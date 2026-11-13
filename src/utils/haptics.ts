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

export function vibrateHeavy(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([30, 40, 45]);
    }
  } catch {
    // Ignore
  }
}

export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export async function requestArenaFullscreen(
  target?: HTMLElement | null
): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  try {
    if (isFullscreenActive()) return true;
    const elem = (target || document.documentElement) as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (typeof elem.requestFullscreen === 'function') {
      await elem.requestFullscreen({ navigationUI: 'hide' });
      return true;
    }
    if (typeof elem.webkitRequestFullscreen === 'function') {
      await elem.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // Browser may block if not triggered directly from a gesture or if unsupported;
    // ArenaView still enforces 100vw x 100dvh fixed inset-0 full-viewport mode.
  }
  return false;
}

export async function exitArenaFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    if (!isFullscreenActive()) return;
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (typeof doc.exitFullscreen === 'function') {
      await doc.exitFullscreen();
    } else if (typeof doc.webkitExitFullscreen === 'function') {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // Ignore
  }
}

export async function toggleArenaFullscreen(
  target?: HTMLElement | null
): Promise<boolean> {
  if (isFullscreenActive()) {
    await exitArenaFullscreen();
    return false;
  }
  return requestArenaFullscreen(target);
}
