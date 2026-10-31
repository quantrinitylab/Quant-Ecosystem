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
//      listings/metadata + file previews/downloads) issued from Drive pages.
//      TWO scopes must not be confused here:
//      - Control scope (which documents the worker controls): '/drive'.
//        A worker only ever sees fetches from documents it controls, so a
//        scope of '/api/drive/' could NEVER intercept a Drive page's API
//        calls — no app document lives under /api/drive/. The script is
//        served from /api/drive/offline-sw.js, but route.ts widens the
//        permitted scope to '/drive' via Service-Worker-Allowed, which is
//        what lets the worker control the /drive document (and /drive/doc/*)
//        and actually see its fetches. Scope '/' is forbidden: it would
//        collide with the push worker (public/sw.js), which owns scope /
//        and must keep owning it — and registering a second worker at an
//        already-owned scope would replace the push registration.
//      - Intercept scope (which requests the worker handles): only GET
//        /api/drive/* reads (see isDriveReadCacheable), plus a same-origin
//        guard in the worker itself. Every other fetch from a Drive page —
//        non-Drive routes, mutations, the worker script itself — passes
//        through untouched because the handler never calls respondWith.
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

/**
 * Worker CONTROL scope — the documents the worker controls.
 *
 * '/drive' (no trailing slash) is deliberate: the Drive document itself
 * lives at exactly /drive, and scope matching is a string prefix — a scope
 * of '/drive/' would control /drive/doc/* but NOT the /drive document, so
 * the banner's own page would never be cached. '/drive' covers /drive,
 * /drive?tab=*, and /drive/doc/*, and nothing else. It is NOT the
 * intercept scope: what the worker caches is decided by
 * isDriveReadCacheable (GET /api/drive/* reads only), not by this value.
 * Never widen this to '/' — the push worker owns scope / (see above).
 */
export const DRIVE_OFFLINE_SW_SCOPE = '/drive';

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
 * caching a mutation response would be a lie), under /api/drive/, and never
 * the worker script itself (caching /api/drive/offline-sw.js would pin a
 * stale worker). The resumable-upload subtree (/api/drive/upload/*) is
 * excluded too: GET /api/drive/upload/chunk/<id>/status reports which
 * chunks already landed, and serving a stale copy of THAT would make the
 * uploader skip chunks the server never received — freshness-critical
 * state must never come from the cache, even while online (the metadata
 * strategy serves cached copies instantly).
 *
 * NOTE: this is a path-and-method check only. It deliberately does not
 * decide origin: an absolute cross-origin URL with a Drive path still
 * returns true here, and the worker's fetch handler applies the
 * same-origin guard on top before ever calling respondWith. Do not use
 * this predicate alone as an "is safe to serve" decision outside the
 * worker without that guard.
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
  if (pathname.indexOf('/api/drive/offline-sw.js/') === 0) return false;
  if (pathname === '/api/drive/upload') return false;
  if (pathname.indexOf('/api/drive/upload/') === 0) return false;
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
    // Control scope '/drive' (see DRIVE_OFFLINE_SW_SCOPE): the worker must
    // control Drive documents to see their fetches at all. The route's
    // Service-Worker-Allowed header is what permits this scope for a script
    // served from under /api/drive/. This stays off the push worker's
    // scope (/) — push subscriptions live on the /sw.js registration and
    // are unaffected by which worker controls a given page.
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
