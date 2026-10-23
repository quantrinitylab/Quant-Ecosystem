// ============================================================================
// QuantDrive offline support — minimal shippable slice.
//
// Finding: QuantMail Drive had no offline story — no offline-caching service
// worker anywhere in src, zero "offline" mentions on the Drive surface, files
// unreadable on flaky networks (Google Drive has an offline-mode toggle +
// per-file offline on mobile).
//
// Deliberate scope (full offline editing + auto-sync is follow-up work, NOT
// in this slice):
//   1. An offline-caching service worker for Drive READ paths (file
//      listings/metadata + file previews/downloads). Served from
//      /api/drive/offline-sw.js so its max scope is /api/drive/ — it can see
//      every /api/drive/* read without ever touching pages or the push
//      worker, which owns scope / (public/sw.js) and must keep owning it.
//   2. An honest offline indicator on the Drive surface when the network drops.
//   3. Honest error states — never a fake success — when content is not
//      available offline.
//
// The cacheability predicate below is written in plain-JS-compatible style
// (JSDoc types, no TS-only syntax, no closure references) because its source
// is embedded verbatim into the worker via Function.prototype.toString() —
// single source of truth, unit-tested here.
// ============================================================================

/** URL the Drive offline worker is served from (route: src/app/api/drive/offline-sw.js). */
export const DRIVE_OFFLINE_SW_URL = '/api/drive/offline-sw.js';

/** Worker scope — deliberately limited to Drive API reads. */
export const DRIVE_OFFLINE_SW_SCOPE = '/api/drive/';

/** Versioned cache name; the worker evicts older quantdrive-offline-* caches. */
export const DRIVE_OFFLINE_CACHE_NAME = 'quantdrive-offline-v1';

/**
 * Response header the worker stamps on responses served from cache, so the
 * UI can honestly say "showing cached files" instead of guessing.
 */
export const DRIVE_OFFLINE_CACHE_HEADER = 'x-quantdrive-cache';
export const DRIVE_OFFLINE_CACHE_HIT = 'hit';

/**
 * True when this request is a Drive READ the offline worker may cache.
 *
 * Rules: GET only (uploads/renames/deletes/shares pass straight through —
 * caching a mutation response would be a lie), same path family as the
 * worker's /api/drive/ scope, and never the worker script itself (caching
 * /api/drive/offline-sw.js would pin a stale worker).
 *
 * NOTE: declared as a typed const holding an *unannotated* arrow function.
 * The arrow's source is embedded verbatim into the service worker via
 * Function.prototype.toString() (see sw-source.ts) — a classic worker script
 * where TS annotations would be a syntax error — while the const's type
 * annotation keeps this file strict-clean.
 */
export const isDriveReadCacheable: (url: string, method: string) => boolean = (url, method) => {
  if (typeof url !== 'string' || typeof method !== 'string') return false;
  if (method.toUpperCase() !== 'GET') return false;
  let pathname: string;
  try {
    // Absolute same-origin fetch URLs -> pathname; relative URLs -> as-is.
    pathname = new URL(url, 'https://quantdrive.invalid').pathname;
  } catch {
    return false;
  }
  if (pathname.indexOf('/api/drive/') !== 0) return false;
  if (pathname === '/api/drive/offline-sw.js') return false;
  return true;
};

/** True when the browser currently reports no network connection. */
export function isOfflineNow(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Registers the Drive offline-cache worker. Never throws and never claims
 * success it doesn't have: returns the registration, or null when workers
 * are unsupported (SSR, old browsers) or registration fails. The UI must
 * describe the *network* state from isOfflineNow(), never infer caching.
 */
export async function registerDriveOfflineWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
    if (!('serviceWorker' in navigator)) return null;
    // Scope /api/drive/ keeps this worker off the push worker's scope (/).
    const registration = await navigator.serviceWorker.register(DRIVE_OFFLINE_SW_URL, {
      scope: DRIVE_OFFLINE_SW_SCOPE,
    });
    return registration;
  } catch {
    return null;
  }
}

/**
 * Drive error text with an honest offline branch. A network outage must never
 * be presented as a server error or a silent empty state.
 */
export function getDriveErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : '';
  const normalized = message.toLowerCase();

  const networkish =
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed') ||
    normalized.includes('fetch files');

  if (networkish && isOfflineNow()) {
    return 'You appear to be offline. Cached Drive files are shown when available — uploads and changes need a connection.';
  }

  if (normalized.includes('401') || normalized.includes('unauthorized')) {
    return 'Your Drive session expired. Refresh or sign in again, then retry.';
  }

  if (networkish) {
    return `${fallback} Your files are safe.`;
  }

  return message || fallback;
}
