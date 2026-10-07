// ============================================================================
// QuantChat - Screenshot Detection (Task 14.10)
//
// Browsers do not expose a reliable screenshot event, so detection uses a
// best-effort heuristic plus a manual trigger API:
//
//   1. Heuristic: on some platforms taking a screenshot briefly blurs/hides
//      the page (PrintScreen, OS capture overlays). We listen for a rapid
//      visibilitychange -> hidden -> visible cycle and the PrintScreen key as
//      signals. These are advisory, not guaranteed.
//   2. Manual trigger: native wrappers (or test harnesses) can call
//      `reportScreenshot()` directly when the platform fires a real capture
//      event.
//
// When a capture is detected, the consumer notifies the message sender within
// 2 seconds via the backend (POST .../screenshot) which posts a system message.
//
// Requirements: 18.3 (notify sender within 2s of recipient screenshot)
// ============================================================================

/** Callback invoked when a screenshot is detected. */
export type ScreenshotCallback = (info: ScreenshotDetectionInfo) => void;

export interface ScreenshotDetectionInfo {
  /** How the screenshot was detected. */
  method: 'printscreen-key' | 'visibility-heuristic' | 'manual';
  /** Epoch ms when detected. */
  detectedAt: number;
}

export interface ScreenshotDetectorOptions {
  /**
   * Max gap (ms) between hidden->visible for the visibility heuristic to count
   * as a screenshot. Long absences are normal tab switches and are ignored.
   */
  visibilityGraceMs?: number;
}

const DEFAULT_VISIBILITY_GRACE_MS = 1200;

/**
 * Attaches screenshot-detection listeners to the document and returns a
 * detach function plus a manual `report` trigger.
 *
 * Returns a no-op detacher when `document` is unavailable (SSR).
 */
export function createScreenshotDetector(
  callback: ScreenshotCallback,
  options: ScreenshotDetectorOptions = {},
): { detach: () => void; report: () => void } {
  const graceMs = options.visibilityGraceMs ?? DEFAULT_VISIBILITY_GRACE_MS;

  const report = () => {
    callback({ method: 'manual', detectedAt: Date.now() });
  };

  if (typeof document === 'undefined') {
    return { detach: () => {}, report };
  }

  let hiddenAt: number | null = null;

  const onKeyUp = (event: KeyboardEvent) => {
    // PrintScreen key (key === 'PrintScreen', or keyCode 44 on legacy).
    if (event.key === 'PrintScreen' || event.keyCode === 44) {
      callback({ method: 'printscreen-key', detectedAt: Date.now() });
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (document.visibilityState === 'visible' && hiddenAt !== null) {
      const gap = Date.now() - hiddenAt;
      hiddenAt = null;
      // A very short hidden->visible cycle is consistent with an OS capture
      // overlay rather than a deliberate tab switch.
      if (gap > 0 && gap <= graceMs) {
        callback({ method: 'visibility-heuristic', detectedAt: Date.now() });
      }
    }
  };

  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVisibilityChange);

  const detach = () => {
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  return { detach, report };
}

/** Build the system-message text shown to the sender. Requirement 18.3. */
export function formatScreenshotMessage(viewerName: string): string {
  return `📸 ${viewerName} took a screenshot`;
}
