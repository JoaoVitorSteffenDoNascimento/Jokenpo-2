/**
 * Lightweight safe haptic feedback helpers for mobile touch devices.
 */
export function isMobileTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)')?.matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
  );
}

export function vibrateTap(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
  } catch {
    // Ignore unsupported or blocked vibration calls
  }
}

export function vibrateThrow(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([16, 22, 18]);
    }
  } catch {
    // Ignore
  }
}
