/**
 * Alert Sounds + Vibration + Voice Feedback
 * Haptic, audio, and speech feedback for critical events
 *
 * Factory floor is LOUD. Workers need:
 *  - Vibration (tablet in pocket or mounted) for critical alerts
 *  - Audio tones for equipment DOWN / quality fail events
 *  - Voice confirmations for glove-wearing workers
 *  - Visual toast notifications (handled by the dashboard component)
 *
 * Uses Web Audio API for tones — no audio files needed.
 * Uses Vibration API for haptic feedback (mobile/tablet only).
 * Uses Speech Synthesis API for voice confirmations.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a tone with the Web Audio API.
 * @param frequency Hz (440 = A4, 880 = A5, 220 = A3)
 * @param duration Seconds
 * @param type Oscillator type
 */
function playTone(frequency: number, duration: number, type: OscillatorType = "sine") {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = 0.3;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Non-critical — audio may be blocked by browser policy
  }
}

/**
 * Vibrate the device if supported.
 * @param pattern Vibration pattern in ms — e.g., [200, 100, 200] = vibrate, pause, vibrate
 */
function vibrate(pattern: number | number[]) {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Not supported
  }
}

// ─── Voice Synthesis ──────────────────────────────────────────────────────────

let _voiceEnabled = true;

/**
 * Enable or disable voice feedback globally.
 */
export function setVoiceEnabled(enabled: boolean) {
  _voiceEnabled = enabled;
}

export function isVoiceEnabled(): boolean {
  return _voiceEnabled;
}

/**
 * Speak a message using the Web Speech Synthesis API.
 * Works even with gloves and ear protection — loud and clear.
 */
export function speak(message: string, options?: { rate?: number; pitch?: number; volume?: number }) {
  if (!_voiceEnabled) return;

  try {
    if (!('speechSynthesis' in window)) return;

    // Cancel any pending speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = options?.rate ?? 1.1;   // Slightly fast for urgency
    utterance.pitch = options?.pitch ?? 1.0;
    utterance.volume = options?.volume ?? 1.0;

    // Prefer a clear, natural voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
    ) || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
  } catch {
    // Non-critical — speech may not be supported
  }
}

// ─── Haptic Patterns ──────────────────────────────────────────────────────────
// Different vibration patterns for distinct feedback types

/** Strong double-buzz for errors and urgent alerts */
export function hapticError() {
  vibrate([100, 50, 100, 50, 200]);
}

/** Quick single tap for success */
export function hapticSuccess() {
  vibrate(50);
}

/** Medium buzz for warnings */
export function hapticWarning() {
  vibrate([150, 75, 150]);
}

/** Long single buzz for attention-needed */
export function hapticAlert() {
  vibrate([300, 100, 300]);
}

/** Light tap for UI interactions */
export function hapticTap() {
  vibrate(30);
}

// ─── Public Alert Functions ───────────────────────────────────────────────────

/** Machine went DOWN — urgent double beep + strong vibration + voice */
export function alertMachineDown(equipmentCode?: string) {
  playTone(440, 0.2, "square");
  setTimeout(() => playTone(440, 0.3, "square"), 250);
  hapticAlert();
  if (equipmentCode) {
    speak(`Machine ${equipmentCode} is down`);
  }
}

/** Machine back up — friendly single beep + light vibration + voice */
export function alertMachineUp(equipmentCode?: string, downtimeMin?: number) {
  playTone(880, 0.15, "sine");
  hapticSuccess();
  if (equipmentCode) {
    const msg = downtimeMin
      ? `${equipmentCode} back up after ${Math.round(downtimeMin)} minutes`
      : `${equipmentCode} is running`;
    speak(msg);
  }
}

/** Quality alert (lab fail, etc.) — triple beep + strong vibration + voice */
export function alertQuality(detail?: string) {
  playTone(660, 0.15, "triangle");
  setTimeout(() => playTone(660, 0.15, "triangle"), 200);
  setTimeout(() => playTone(880, 0.2, "triangle"), 400);
  hapticError();
  speak(detail || "Quality alert");
}

/** Success confirmation — quick chirp + tap + voice */
export function alertSuccess(message?: string) {
  playTone(880, 0.1, "sine");
  hapticSuccess();
  if (message) speak(message);
}

/** Generic notification — soft beep + tap */
export function alertNotification(message?: string) {
  playTone(660, 0.12, "sine");
  hapticTap();
  if (message) speak(message);
}

/** Lot consumed — voice feedback with quantity remaining */
export function alertLotConsumed(lotNumber: string, remaining?: number, uom?: string) {
  playTone(880, 0.1, "sine");
  hapticSuccess();
  const remainStr = remaining != null && uom
    ? `, ${Math.round(remaining)} ${uom} remaining`
    : "";
  speak(`Lot ${lotNumber} consumed${remainStr}`);
}

/** Production recorded — voice feedback */
export function alertProductionRecorded(quantity: number, uom: string) {
  playTone(880, 0.15, "sine");
  hapticSuccess();
  speak(`Production recorded, ${Math.round(quantity)} ${uom}`);
}

/**
 * Initialize the audio context on first user interaction.
 * Browsers require a user gesture before playing audio.
 * Call this on the first tap/click in the app.
 */
export function initAudio() {
  getAudioContext();
  // Pre-load voices for speech synthesis
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
  }
}
