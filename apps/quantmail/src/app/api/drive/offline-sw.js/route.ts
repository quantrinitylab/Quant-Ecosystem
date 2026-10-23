import { DRIVE_OFFLINE_SW_SOURCE } from './sw-source';

export const dynamic = 'force-dynamic';

/**
 * GET /api/drive/offline-sw.js — serves the QuantDrive offline-cache worker.
 *
 * A dedicated route (rather than public/) is deliberate: a worker's default
 * max scope is the directory its script is served from, so serving it from
 * under /api/drive/ scopes it to /api/drive/. It can cache Drive reads
 * without ever seeing pages — and without touching the push worker, which
 * owns scope / (public/sw.js) and must keep owning it.
 *
 * no-store: a cached worker script would pin stale caching behaviour.
 */
export async function GET(): Promise<Response> {
  return new Response(DRIVE_OFFLINE_SW_SOURCE, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      // Belt and braces: even if this route ever moved, the worker may only
      // ever control Drive API reads.
      'Service-Worker-Allowed': '/api/drive/',
    },
  });
}
