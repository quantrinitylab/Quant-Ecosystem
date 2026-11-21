// ============================================================================
// QuantDrive offline-cache worker SOURCE.
//
// This module builds the worker script served at /api/drive/offline-sw.js
// (see route.ts). The cacheability predicate is embedded verbatim from
// src/lib/drive-offline.ts via Function.prototype.toString() — single source
// of truth, unit-tested, no drift between the page's expectations and the
// worker's behaviour.
//
// Worker contract (minimal slice):
//  - CONTROL scope is /drive (granted by route.ts's Service-Worker-Allowed
//    header — the script itself is served from under /api/drive/, whose
//    default max scope could never control a Drive document). The worker
//    therefore sees fetches from /drive and /drive/doc/* pages only.
//  - INTERCEPT scope is narrower: only GET /api/drive/* reads (see
//    isDriveReadCacheable, embedded below), plus a same-origin guard.
//    Non-Drive routes, mutations, the worker script itself, and the
//    freshness-critical upload-chunk status endpoint pass through
//    untouched — the handler simply never calls respondWith for them.
//    The worker never touches the push worker at scope /: push
//    subscriptions live on the /sw.js registration, not on the page's
//    controller, so controlling Drive pages changes nothing about push.
//  - Metadata reads (listings, quota, shares, search): stale-while-revalidate
//    — serve the cached copy instantly (stamped with the x-quantdrive-cache
//    header so the UI can say "showing cached files"), refresh in background.
//  - File downloads/previews: network-first with cache fallback, so a file
//    opened while online opens offline too. A download is stored only when
//    it is a full 200 response to a non-Range request, and — when the
//    server declares a size — that size is at most
//    MAX_DOWNLOAD_CACHE_BYTES. NOTE: the Drive download proxy streams
//    without a Content-Length, so for real downloads the declared-size
//    check cannot run and the body is cached opportunistically; a quota
//    failure there is swallowed by cachePutSafe and never breaks the live
//    response. The cap is a declared-size guard, not a measured-size
//    guarantee — user-facing copy must not promise otherwise.
//  - Offline with nothing cached: an honest 503 JSON (OFFLINE_NOT_CACHED) —
//    never a fake success, never a poisoned cache entry (only res.ok cached).
// ============================================================================

import {
  DRIVE_OFFLINE_CACHE_NAME,
  DRIVE_OFFLINE_CACHE_HEADER,
  DRIVE_OFFLINE_CACHE_HIT,
  isDriveReadCacheable,
} from '../../../../lib/drive-offline';

/** Previews/downloads above this are streamed, never written to the cache. */
const MAX_DOWNLOAD_CACHE_BYTES = 25 * 1024 * 1024;

const WORKER_PRELUDE = "'use strict';\n" +
  '/* QuantDrive offline-cache worker — minimal slice (read paths only).\n' +
  ' * Controls /drive documents; answers only GET /api/drive/ reads from them.\n' +
  ' * Never touches the push worker (scope /) or its subscription.\n' +
  ' * Metadata: stale-while-revalidate. Downloads: network-first, cache fallback.\n' +
  ' * Offline + nothing cached: honest 503 JSON, never fake data. */\n';

const WORKER_BODY = `
var CACHE_NAME = ${JSON.stringify(DRIVE_OFFLINE_CACHE_NAME)};
var CACHE_HEADER = ${JSON.stringify(DRIVE_OFFLINE_CACHE_HEADER)};
var CACHE_HIT = ${JSON.stringify(DRIVE_OFFLINE_CACHE_HIT)};
var MAX_DOWNLOAD_CACHE_BYTES = ${MAX_DOWNLOAD_CACHE_BYTES};

var isDriveReadCacheable = ${isDriveReadCacheable.toString()};

function isDownloadPath(pathname) {
  return /^\\/api\\/drive\\/files\\/[^/]+\\/download(\\/|\\?|#|$)/.test(pathname);
}

// Stamp a cache-served response so the page can honestly say "cached".
function markCacheHit(response) {
  var headers = new Headers(response.headers);
  headers.set(CACHE_HEADER, CACHE_HIT);
  return response.blob().then(function (body) {
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers,
    });
  });
}

// Honest miss: offline and nothing cached. 503 JSON, never fake content.
function offlineFallback() {
  return new Response(
    JSON.stringify({
      error: 'OFFLINE_NOT_CACHED',
      message: 'You are offline and this Drive content is not cached yet.',
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );
}

function cachePutSafe(cache, request, response) {
  // Quota or oversized bodies must never break the live response.
  return cache.put(request, response).catch(function () {});
}

self.addEventListener('install', function (event) {
  // No precached app shell to protect — take over promptly on first install.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      var keys = await caches.keys();
      await Promise.all(
        keys
          .filter(function (k) {
            return k.indexOf('quantdrive-offline-') === 0 && k !== CACHE_NAME;
          })
          .map(function (k) {
            return caches.delete(k);
          }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (!isDriveReadCacheable(request.url, request.method)) return;

  var pathname;
  try {
    var parsed = new URL(request.url);
    // Defence in depth: the predicate is path-based; the worker additionally
    // requires same-origin.
    if (parsed.origin !== self.location.origin) return;
    pathname = parsed.pathname;
  } catch (err) {
    return;
  }

  if (isDownloadPath(pathname)) {
    // Downloads/previews: network-first, cache fallback.
    event.respondWith(
      (async function () {
        try {
          var network = await fetch(request);
          if (network && network.ok) {
            // Never cache a partial response under the full URL: a 206 (or
            // any Range answer) stored under the plain download URL would
            // later be served as if it were the whole file.
            var rangeHeader = null;
            try {
              rangeHeader = request.headers ? request.headers.get('Range') : null;
            } catch (err) {
              rangeHeader = null;
            }
            var lengthHeader = network.headers.get('content-length');
            var length = lengthHeader === null ? NaN : Number(lengthHeader);
            // Declared-size cap only: streamed bodies carry no
            // Content-Length (the download proxy streams), so those are
            // cached opportunistically — see the contract comment above.
            if (
              network.status === 200 &&
              rangeHeader === null &&
              (lengthHeader === null || length <= MAX_DOWNLOAD_CACHE_BYTES)
            ) {
              await cachePutSafe(await caches.open(CACHE_NAME), request, network.clone());
            }
          }
          return network;
        } catch (err) {
          var cached = await caches.open(CACHE_NAME).then(function (c) {
            return c.match(request);
          });
          if (cached) return markCacheHit(cached);
          return offlineFallback();
        }
      })(),
    );
    return;
  }

  // Metadata (listings, quota, shares, search): stale-while-revalidate.
  event.respondWith(
    (async function () {
      var cache = await caches.open(CACHE_NAME);
      var cached = await cache.match(request);
      var refresh = fetch(request)
        .then(function (network) {
          if (network && network.ok) {
            // Background refresh — never blocks the served response.
            cachePutSafe(cache, request, network.clone());
          }
          return network;
        })
        .catch(function () {
          return null;
        });
      if (cached) return markCacheHit(cached);
      var network = await refresh;
      if (network) return network;
      return offlineFallback();
    })(),
  );
});
`;

/** The complete worker script served by route.ts. */
export const DRIVE_OFFLINE_SW_SOURCE: string = WORKER_PRELUDE + WORKER_BODY;
