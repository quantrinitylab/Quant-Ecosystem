// ============================================================================
// QuantDrive offline worker — BEHAVIOUR harness.
//
// String assertions (drive-offline.test.tsx) can only prove the worker
// source *mentions* a guard. This file executes the generated worker
// script (DRIVE_OFFLINE_SW_SOURCE) with stubbed service-worker globals and
// drives its real fetch handler, so scope honesty is proven by behaviour:
// out-of-scope requests get no respondWith (they pass through untouched),
// mutations are never cached or served, the worker script itself is never
// intercepted, partial downloads never poison the cache, and offline
// misses answer with the honest 503.
//
// The harness runs in the default node environment: Response/Headers/URL
// are the real Node (undici) implementations, so markCacheHit's blob()
// round-trip and clone() semantics are exercised for real.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { DRIVE_OFFLINE_SW_SOURCE } from '../../../api/drive/offline-sw.js/sw-source';
import {
  DRIVE_OFFLINE_CACHE_NAME,
  DRIVE_OFFLINE_CACHE_HEADER,
  DRIVE_OFFLINE_CACHE_HIT,
} from '../../../../lib/drive-offline';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface FakeHeaders {
  get(name: string): string | null;
}

interface FakeRequest {
  url: string;
  method: string;
  headers: FakeHeaders;
}

function fakeRequest(url: string, method = 'GET', headers: Record<string, string> = {}): FakeRequest {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    url,
    method,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
  };
}

class FakeCache {
  store = new Map<string, any>();

  async match(request: FakeRequest | string): Promise<any | undefined> {
    const key = typeof request === 'string' ? request : request.url;
    const hit = this.store.get(key);
    return hit ? hit.clone() : undefined;
  }

  async put(request: FakeRequest | string, response: any): Promise<void> {
    const key = typeof request === 'string' ? request : request.url;
    this.store.set(key, response.clone());
  }
}

class FakeCaches {
  map = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    let cache = this.map.get(name);
    if (!cache) {
      cache = new FakeCache();
      this.map.set(name, cache);
    }
    return cache;
  }

  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.map.delete(name);
  }
}

type FetchImpl = (request: FakeRequest) => Promise<any> | any;

function installWorker(fetchImpl: FetchImpl): {
  handlers: Record<string, (...args: any[]) => any>;
  caches: FakeCaches;
} {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const caches = new FakeCaches();
  const fakeSelf: any = {
    location: { origin: 'https://quantmail.test' },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
    addEventListener: (type: string, fn: (...args: any[]) => any) => {
      handlers[type] = fn;
    },
  };
  const runner = new Function(
    'self',
    'caches',
    'fetch',
    'Response',
    'Headers',
    'URL',
    DRIVE_OFFLINE_SW_SOURCE,
  );
  // Real fetch() never throws or answers synchronously: it always returns
  // a promise. The worker relies on that (the metadata branch calls
  // .then() on the result), so the stub must keep the same contract even
  // when the test implementation answers or fails immediately.
  const fetchFn = (request: FakeRequest) => Promise.resolve().then(() => fetchImpl(request));
  runner(fakeSelf, caches, fetchFn, Response, Headers, URL);
  return { handlers, caches };
}

/**
 * Fires the worker's fetch handler. Returns the respondWith promise, or
 * null when the handler never called respondWith — i.e. the request
 * passes through to the network untouched, which is the honest behaviour
 * for everything outside the worker's intercept scope.
 */
function fireFetch(
  handlers: Record<string, (...args: any[]) => any>,
  request: FakeRequest,
): Promise<any> | null {
  let promised: Promise<any> | null = null;
  const event: any = {
    request,
    respondWith: (p: Promise<any>) => {
      promised = p;
    },
  };
  handlers.fetch(event);
  return promised;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const onlineJson = (body: string, extraHeaders: Record<string, string> = {}) =>
  new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });

const networkDown: FetchImpl = () => {
  throw new Error('network down');
};

describe('offline worker fetch handler (executed, not string-matched)', () => {
  it('passes non-Drive routes through untouched', async () => {
    const { handlers } = installWorker(() => onlineJson('{}'));
    expect(fireFetch(handlers, fakeRequest('https://quantmail.test/api/mail/list'))).toBeNull();
    expect(fireFetch(handlers, fakeRequest('https://quantmail.test/drive'))).toBeNull();
    expect(fireFetch(handlers, fakeRequest('https://quantmail.test/api/drive'))).toBeNull();
    expect(fireFetch(handlers, fakeRequest('https://quantmail.test/api/drive-evil/files'))).toBeNull();
  });

  it('passes mutations through untouched — never cached, never served', async () => {
    const { handlers, caches } = installWorker(() => onlineJson('{"ok":true}'));
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(
        fireFetch(handlers, fakeRequest('https://quantmail.test/api/drive/files/abc', method)),
      ).toBeNull();
    }
    // Nothing was even opened: no cache entry exists for the mutation URL.
    const cache = await caches.open(DRIVE_OFFLINE_CACHE_NAME);
    expect(
      await cache.match(fakeRequest('https://quantmail.test/api/drive/files/abc', 'POST')),
    ).toBeUndefined();
  });

  it('never intercepts the worker script itself', async () => {
    const { handlers } = installWorker(() => onlineJson('{}'));
    expect(
      fireFetch(handlers, fakeRequest('https://quantmail.test/api/drive/offline-sw.js')),
    ).toBeNull();
  });

  it('never intercepts cross-origin requests, even with a Drive path', async () => {
    const { handlers } = installWorker(() => onlineJson('{}'));
    expect(
      fireFetch(handlers, fakeRequest('https://evil.example/api/drive/files')),
    ).toBeNull();
  });

  it('never intercepts the freshness-critical upload-chunk status', async () => {
    const { handlers } = installWorker(() => onlineJson('{"missingChunks":[]}'));
    expect(
      fireFetch(
        handlers,
        fakeRequest('https://quantmail.test/api/drive/upload/chunk/abc123/status'),
      ),
    ).toBeNull();
  });

  it('serves metadata stale-while-revalidate and stamps cache hits', async () => {
    const listingUrl = 'https://quantmail.test/api/drive/files?folderId=abc';
    const { handlers, caches } = installWorker(() => onlineJson('{"files":[]}'));
    const first = await fireFetch(handlers, fakeRequest(listingUrl))!;
    expect(first.status).toBe(200);
    expect(first.headers.get(DRIVE_OFFLINE_CACHE_HEADER)).toBeNull();

    // Second fetch while "online": the cached copy is served instantly,
    // stamped so the UI can honestly say "showing cached files".
    const second = await fireFetch(handlers, fakeRequest(listingUrl))!;
    expect(second.headers.get(DRIVE_OFFLINE_CACHE_HEADER)).toBe(DRIVE_OFFLINE_CACHE_HIT);
    expect(await second.text()).toBe('{"files":[]}');
    expect(await caches.open(DRIVE_OFFLINE_CACHE_NAME).then((c) => c.match(fakeRequest(listingUrl)))).toBeDefined();
  });

  it('refreshes stale metadata in the background', async () => {
    const listingUrl = 'https://quantmail.test/api/drive/files';
    const { handlers, caches } = installWorker(async (request: FakeRequest) =>
      request.url === listingUrl ? onlineJson('{"files":["new"]}') : onlineJson('{}'),
    );
    const cache = await caches.open(DRIVE_OFFLINE_CACHE_NAME);
    await cache.put(fakeRequest(listingUrl), onlineJson('{"files":["old"]}'));
    const served = await fireFetch(handlers, fakeRequest(listingUrl))!;
    expect(await served.text()).toBe('{"files":["old"]}');
    expect(served.headers.get(DRIVE_OFFLINE_CACHE_HEADER)).toBe(DRIVE_OFFLINE_CACHE_HIT);
    await sleep(20);
    const refreshed = await cache.match(fakeRequest(listingUrl));
    expect(await refreshed.text()).toBe('{"files":["new"]}');
  });

  it('answers offline metadata misses with the honest 503, never fake data', async () => {
    const { handlers } = installWorker(networkDown);
    const res = await fireFetch(handlers, fakeRequest('https://quantmail.test/api/drive/files'))!;
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('OFFLINE_NOT_CACHED');
    expect(body.message).toContain('offline');
  });

  it('caches downloads under the cap and serves them offline, stamped', async () => {
    const url = 'https://quantmail.test/api/drive/files/abc123/download';
    let online = true;
    const { handlers } = installWorker(() =>
      online
        ? new Response('file-bytes', {
            status: 200,
            headers: { 'Content-Type': 'application/pdf', 'content-length': '10' },
          })
        : networkDown(),
    );
    const first = await fireFetch(handlers, fakeRequest(url))!;
    expect(await first.text()).toBe('file-bytes');
    expect(first.headers.get(DRIVE_OFFLINE_CACHE_HEADER)).toBeNull();
    online = false;
    const offline = await fireFetch(handlers, fakeRequest(url))!;
    expect(offline.headers.get(DRIVE_OFFLINE_CACHE_HEADER)).toBe(DRIVE_OFFLINE_CACHE_HIT);
    expect(await offline.text()).toBe('file-bytes');
  });

  it('refuses to cache downloads over the declared-size cap', async () => {
    const url = 'https://quantmail.test/api/drive/files/big/download';
    let online = true;
    const { handlers, caches } = installWorker(() =>
      online
        ? // Stream body: a string body would let the runtime normalise
          // Content-Length to the real length, defeating the test. The
          // worker trusts the declared size, which is the point.
          new Response(new ReadableStream(), {
            status: 200,
            headers: { 'content-length': String(26 * 1024 * 1024) },
          })
        : networkDown(),
    );
    const first = await fireFetch(handlers, fakeRequest(url))!;
    expect(first.status).toBe(200);
    const cache = await caches.open(DRIVE_OFFLINE_CACHE_NAME);
    expect(await cache.match(fakeRequest(url))).toBeUndefined();
    online = false;
    const offline = await fireFetch(handlers, fakeRequest(url))!;
    expect(offline.status).toBe(503);
  });

  it('caches streamed downloads without a declared size (documented behaviour)', async () => {
    const url = 'https://quantmail.test/api/drive/files/streamed/download';
    let online = true;
    const { handlers } = installWorker(() =>
      online ? new Response('streamed-bytes', { status: 200 }) : networkDown(),
    );
    await fireFetch(handlers, fakeRequest(url))!;
    online = false;
    const offline = await fireFetch(handlers, fakeRequest(url))!;
    expect(offline.headers.get(DRIVE_OFFLINE_CACHE_HEADER)).toBe(DRIVE_OFFLINE_CACHE_HIT);
    expect(await offline.text()).toBe('streamed-bytes');
  });

  it('never caches Range or partial (206) downloads under the full URL', async () => {
    const url = 'https://quantmail.test/api/drive/files/ranged/download';
    const { handlers, caches } = installWorker((request: FakeRequest) =>
      request.headers.get('Range')
        ? new Response('partial', { status: 206, headers: { 'content-length': '7' } })
        : new Response('partial', { status: 206, headers: { 'content-length': '7' } }),
    );
    await fireFetch(handlers, fakeRequest(url, 'GET', { Range: 'bytes=0-6' }))!;
    await fireFetch(handlers, fakeRequest(url))!;
    const cache = await caches.open(DRIVE_OFFLINE_CACHE_NAME);
    expect(await cache.match(fakeRequest(url))).toBeUndefined();
  });

  it('evicts older worker caches on activate, keeps the current one', async () => {
    const { handlers, caches } = installWorker(() => onlineJson('{}'));
    const current = await caches.open(DRIVE_OFFLINE_CACHE_NAME);
    await current.put(fakeRequest('https://quantmail.test/api/drive/files'), onlineJson('{}'));
    const old = await caches.open('quantdrive-offline-v0');
    await old.put(fakeRequest('https://quantmail.test/api/drive/files'), onlineJson('{}'));
    let captured: Promise<unknown> | null = null;
    handlers.activate({ waitUntil: (p: Promise<unknown>) => { captured = p; } });
    await captured!;
    expect(await caches.keys()).toEqual([DRIVE_OFFLINE_CACHE_NAME]);
  });
});
