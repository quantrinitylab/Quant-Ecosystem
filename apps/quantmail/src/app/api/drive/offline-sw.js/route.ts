import { DRIVE_OFFLINE_SW_SOURCE } from './sw-source';

export const dynamic = 'force-dynamic';

/**
 * GET /api/drive/offline-sw.js — serves the QuantDrive offline-cache worker.
 *
 * The script URL and the worker's CONTROL scope are different things, and
 * confusing them is what broke this worker's first version:
 *
 * - A worker's default max scope is the directory its script is served
 *   from — here /api/drive/. A worker registered with scope /api/drive/
 *   controls only documents under /api/drive/, and no app document lives
 *   there, so its fetch handler could never fire for a Drive page's API
 *   calls: the feature was dead while claiming to cache Drive reads.
 * - Service-Worker-Allowed widens the permitted scope beyond the script
 *   directory. This route sets it to /drive, so the worker may register
 *   with control scope /drive and actually control the /drive document
 *   (and /drive/doc/*) — the pages whose fetches it needs to see.
 * - /drive, not /drive/: scope matching is a string prefix, and the Drive
 *   document itself is exactly /drive — a /drive/ scope would control
 *   /drive/doc/* but miss the very page the banner lives on.
 * - Never '/': the push worker (public/sw.js) owns scope /, and a second
 *   registration at an already-owned scope would replace it.
 *
 * What the worker then intercepts is still only GET /api/drive/* reads
 * (see isDriveReadCacheable + the worker's same-origin guard) — the
 * control scope decides which documents it sees, the predicate decides
 * which of their requests it answers. Everything else passes through
 * untouched, and the push worker's subscription is untouched either way.
 *
 * no-store: a cached worker script would pin stale caching behaviour.
 */
export async function GET(): Promise<Response> {
  return new Response(DRIVE_OFFLINE_SW_SOURCE, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      // Belt and braces, and load-bearing: without this widening, the
      // browser would reject a '/drive' scope for a script served from
      // under /api/drive/. The value is the control scope, NOT the
      // intercept scope — the worker still only answers Drive API reads.
      'Service-Worker-Allowed': '/drive',
    },
  });
}
