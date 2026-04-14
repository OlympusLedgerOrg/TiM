/**
 * Kiosk Mode — Wake Lock, Auto-Logout, Auto-Refocus
 *
 * For wall-mounted factory tablets running /station:
 *  - Wake Lock: Prevent screen dimming using the Screen Wake Lock API
 *  - Auto-Logout: Clear operator session when the current shift ends
 *  - Auto-Refocus: Refocus badge input if idle >30s with no operator
 */

// ─── Wake Lock ────────────────────────────────────────────────────────────────

let _wakeLock: WakeLockSentinel | null = null;

/**
 * Request a screen wake lock to prevent dimming on factory tablets.
 * Automatically re-acquires after visibility change (e.g., tab switch).
 */
export async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen');
      _wakeLock.addEventListener('release', () => {
        _wakeLock = null;
      });
    }
  } catch {
    // Wake Lock API not supported or permission denied — non-critical
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await _wakeLock?.release();
    _wakeLock = null;
  } catch {
    // Already released
  }
}

/**
 * Re-acquire wake lock when the page becomes visible again.
 * Call once at mount; returns cleanup function.
 */
export function setupWakeLockReacquire(): () => void {
  const handler = () => {
    if (document.visibilityState === 'visible' && !_wakeLock) {
      requestWakeLock();
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

// ─── Auto-Logout at Shift End ─────────────────────────────────────────────────

/**
 * Shift end times (Trelleborg Rutherfordton):
 *  1st = 7 AM–3 PM  → ends at 15:00
 *  2nd = 3 PM–11 PM → ends at 23:00
 *  3rd = 11 PM–7 AM → ends at 07:00
 */
const SHIFT_END_HOURS: Record<string, number> = {
  FIRST: 15,   // 3pm
  SECOND: 23,  // 11pm
  THIRD: 7,    // 7am (next day if started at 11pm)
};

/**
 * Calculate milliseconds until the current shift ends.
 */
export function msUntilShiftEnd(shift: string): number {
  const endHour = SHIFT_END_HOURS[shift];
  if (endHour === undefined) return Infinity;

  const now = new Date();
  const end = new Date(now);
  end.setHours(endHour, 0, 0, 0);

  // For THIRD shift (11pm–7am), end hour is 7am:
  //   - If current hour >= 23 (shift just started), 7am today is in the past → add 1 day
  //   - If current hour < 7 (e.g. 2am), 7am today is in the future → correct as-is
  //   - If current hour >= 7 and < 23, shift already ended → return 0
  if (end.getTime() <= now.getTime()) {
    if (shift === 'THIRD' && now.getHours() >= 23) {
      end.setDate(end.getDate() + 1);
    } else {
      // Shift already ended — return 0 to trigger immediate logout
      return 0;
    }
  }

  return end.getTime() - now.getTime();
}

/**
 * Start an auto-logout timer that fires when the current shift ends.
 * Returns a cleanup function to cancel the timer.
 */
export function startAutoLogoutTimer(
  shift: string,
  onLogout: () => void,
): () => void {
  const ms = msUntilShiftEnd(shift);
  if (ms <= 0) {
    // Shift already ended — logout immediately
    onLogout();
    return () => {};
  }

  // Use setTimeout; cap at ~24h to avoid overflow issues
  const cappedMs = Math.min(ms, 24 * 60 * 60 * 1000);
  const timer = window.setTimeout(onLogout, cappedMs);
  return () => window.clearTimeout(timer);
}

// ─── Auto-Refocus Badge Input ─────────────────────────────────────────────────

const REFOCUS_DELAY_MS = 30_000; // 30 seconds

/**
 * Auto-refocus the badge input after 30s of inactivity when no operator is
 * logged in. This ensures the barcode scanner input is always ready.
 * Returns a cleanup function.
 */
export function startAutoRefocus(getInputRef: () => HTMLInputElement | null): () => void {
  let blurTimestamp: number | null = null;
  let checkTimer: number | null = null;

  function onBlur() {
    blurTimestamp = Date.now();
    // Start checking periodically
    if (checkTimer === null) {
      checkTimer = window.setInterval(() => {
        if (blurTimestamp && Date.now() - blurTimestamp >= REFOCUS_DELAY_MS) {
          const input = getInputRef();
          if (input && document.activeElement !== input) {
            input.focus();
          }
          blurTimestamp = null;
        }
      }, 5000);
    }
  }

  function onFocus() {
    blurTimestamp = null;
    if (checkTimer !== null) {
      window.clearInterval(checkTimer);
      checkTimer = null;
    }
  }

  const input = getInputRef();
  if (input) {
    input.addEventListener('blur', onBlur);
    input.addEventListener('focus', onFocus);
  }

  return () => {
    const inp = getInputRef();
    if (inp) {
      inp.removeEventListener('blur', onBlur);
      inp.removeEventListener('focus', onFocus);
    }
    if (checkTimer !== null) {
      window.clearInterval(checkTimer);
    }
  };
}
