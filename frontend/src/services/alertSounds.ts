/**
 * Alert Sounds + Vibration — Haptic and audio feedback for critical events
 *
 * Factory floor is LOUD. Workers need:
 *  - Vibration (tablet in pocket or mounted) for critical alerts
 *  - Audio tones for equipment DOWN / quality fail events
 *  - Visual toast notifications (handled by the dashboard component)
 *
 * Uses Web Audio API for tones — no audio files needed.
 * Uses Vibration API for haptic feedback (mobile/tablet only).
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

// ─── Public Alert Functions ───────────────────────────────────────────────────

/** Machine went DOWN — urgent double beep + strong vibration */
export function alertMachineDown() {
  playTone(440, 0.2, "square");
  setTimeout(() => playTone(440, 0.3, "square"), 250);
  vibrate([200, 100, 300]);
}

/** Machine back up — friendly single beep + light vibration */
export function alertMachineUp() {
  playTone(880, 0.15, "sine");
  vibrate(100);
}

/** Quality alert (lab fail, etc.) — triple beep + strong vibration */
export function alertQuality() {
  playTone(660, 0.15, "triangle");
  setTimeout(() => playTone(660, 0.15, "triangle"), 200);
  setTimeout(() => playTone(880, 0.2, "triangle"), 400);
  vibrate([100, 50, 100, 50, 200]);
}

/** Success confirmation — quick chirp + tap */
export function alertSuccess() {
  playTone(880, 0.1, "sine");
  vibrate(50);
}

/** Generic notification — soft beep + tap */
export function alertNotification() {
  playTone(660, 0.12, "sine");
  vibrate(80);
}

/**
 * Initialize the audio context on first user interaction.
 * Browsers require a user gesture before playing audio.
 * Call this on the first tap/click in the app.
 */
export function initAudio() {
  getAudioContext();
}
