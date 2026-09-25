/**
 * Safe Tauri Desktop Window & Platform Bridge
 * Supports both native Tauri 2.0 runtime and browser/dev simulation.
 */

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function minimizeDesktopWindow(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
      return;
    } catch (err) {
      console.warn('[Desktop Bridge] Failed to minimize native window:', err);
    }
  }
  console.info('[Desktop Bridge - Dev Mode] Window minimize invoked');
}

export async function toggleMaximizeDesktopWindow(): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.toggleMaximize();
      return await win.isMaximized();
    } catch (err) {
      console.warn('[Desktop Bridge] Failed to toggle maximize:', err);
    }
  }
  console.info('[Desktop Bridge - Dev Mode] Window toggle maximize invoked');
  return false;
}

export async function closeDesktopWindow(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
      return;
    } catch (err) {
      console.warn('[Desktop Bridge] Failed to close native window:', err);
    }
  }
  console.info('[Desktop Bridge - Dev Mode] Window close invoked');
}
