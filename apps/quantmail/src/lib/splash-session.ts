/**
 * Remembers that a brand splash has already been painted in this tab session.
 *
 * AuthGuard paints the QuantWorkplace splash as the loading state of every hard
 * load of a signed-in route. QuantumSplashIntro (once per session, mounted by
 * AppShell) must not stack a second splash on top of it, so both go through
 * this flag. sessionStorage carries it across soft navigations and reloads of
 * the tab; the module variable covers browsers where storage is blocked, where
 * the intro would otherwise replay on every shell mount.
 */
const STORAGE_KEY = 'quant_splash_shown';

let shownInMemory = false;

/** True once a splash has been painted in this page load or tab session. */
export function hasSplashBeenShown(): boolean {
  if (shownInMemory) return true;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // No window (server) or blocked storage: nothing to remember.
    return false;
  }
}

/** Record that a splash has been painted. Client-side only. */
export function markSplashShown(): void {
  shownInMemory = true;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Private mode or blocked storage: the in-memory flag still holds for this page load.
  }
}

/** Test seam: forget that a splash was shown (module flag and storage). */
export function __resetSplashSessionForTests(): void {
  shownInMemory = false;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
