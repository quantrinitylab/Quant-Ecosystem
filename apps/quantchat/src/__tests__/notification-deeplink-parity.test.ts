// ===========================================================================
// QC-F-142 — deep-link parity + service-worker behaviour
// ===========================================================================
//
// The deep-link map lives in THREE copies that cannot import each other:
//   1. src/lib/notification-deeplink.ts   (in-app resolver)
//   2. public/sw.js                        (service worker copy)
//   3. backend/lib/notification-deeplink.ts (server copy — covered by the
//      backend parity suite against the same fixture)
//
// This suite runs copies 1 and 2 against the SHARED vectors in
// test-fixtures/notification-deeplink-vectors.json and asserts every
// vector output is a real 'app' route (route-access). If any copy drifts
// back to a dead target ('/notifications', '/chat', '/stories/<id>', ...),
// this file goes red.
//
// It also drives the REAL sw.js handlers with fake `self` / clients:
//   - push with the new backend payload stores the right deep link;
//   - push with a LEGACY payload (only `conversationId` — the pre-fix
//     offline shape) still lands on the conversation (one-release alias);
//   - notificationclick with an open window NAVIGATES it (previously it
//     only postMessaged a listener that does not exist + focused, so the
//     conversation never opened);
//   - notificationclick with no window opens one at the resolved route.
// ===========================================================================

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDeepLink } from '../lib/notification-deeplink';
import { classifyPath } from '../lib/route-access';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface DeepLinkVector {
  category: string;
  contentId: string | null;
  expected: string;
}

const vectors = JSON.parse(
  readFileSync(join(appRoot, 'test-fixtures', 'notification-deeplink-vectors.json'), 'utf8'),
) as DeepLinkVector[];

const swSource = readFileSync(join(appRoot, 'public', 'sw.js'), 'utf8');

/** Extracts the resolveDeepLink function text out of sw.js and evals it. */
function extractSwResolver(): (category: string, contentId?: string | null) => string {
  const start = swSource.indexOf('function resolveDeepLink');
  if (start < 0) throw new Error('resolveDeepLink not found in public/sw.js');
  const open = swSource.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < swSource.length; i++) {
    const ch = swSource[i]!;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('resolveDeepLink body not closed in public/sw.js');
  const fnText = swSource.slice(start, end + 1);
  return new Function(`${fnText}\nreturn resolveDeepLink;`)() as (
    category: string,
    contentId?: string | null,
  ) => string;
}

interface FakeClient {
  focus: ReturnType<typeof vi.fn>;
  navigate?: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
}

/** Loads the real sw.js against a fake `self` and returns its listeners. */
function loadServiceWorker() {
  const listeners = new Map<string, (event: never) => void>();
  const fakeSelf = {
    addEventListener: (type: string, fn: (event: never) => void) => {
      listeners.set(type, fn);
    },
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async (): Promise<FakeClient[]> => []),
      openWindow: vi.fn(async (_path: string) => undefined),
    },
    registration: {
      showNotification: vi.fn(async (_title: string, _options: unknown) => undefined),
      pushManager: { subscribe: vi.fn(async () => ({})) },
    },
  };
  new Function('self', swSource)(fakeSelf);
  return { listeners, fakeSelf };
}

function makeClient(withNavigate: boolean): FakeClient {
  const client: FakeClient = {
    focus: vi.fn(async () => client),
    postMessage: vi.fn(),
  };
  if (withNavigate) {
    client.navigate = vi.fn(async (_path: string) => client);
  }
  return client;
}

describe('QC-F-142 deep-link parity — shared vectors', () => {
  it('the TS resolver matches every shared vector', () => {
    for (const v of vectors) {
      expect(resolveDeepLink(v.category, v.contentId), `${v.category}/${v.contentId}`).toBe(
        v.expected,
      );
    }
  });

  it('the sw.js resolver copy matches every shared vector', () => {
    const swResolve = extractSwResolver();
    for (const v of vectors) {
      expect(swResolve(v.category, v.contentId), `${v.category}/${v.contentId}`).toBe(v.expected);
    }
  });

  it('every shared vector output is a real app route (never a 404)', () => {
    for (const v of vectors) {
      expect(classifyPath(v.expected), `${v.category} -> ${v.expected}`).toBe('app');
    }
  });
});

describe('QC-F-142 service worker — push handler', () => {
  it('stores the server-computed deep link from the NEW backend payload', async () => {
    const { listeners, fakeSelf } = loadServiceWorker();
    const push = listeners.get('push')!;
    let waited: Promise<unknown> | undefined;
    push({
      data: {
        json: () => ({
          title: 'QuantChat',
          body: 'New message',
          category: 'MESSAGES',
          contentId: 'conv-1',
          deepLink: '/chat/conv-1',
        }),
        text: () => '',
      },
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
    } as never);
    await waited;
    expect(fakeSelf.registration.showNotification).toHaveBeenCalledTimes(1);
    const options = fakeSelf.registration.showNotification.mock.calls[0]![1] as {
      data: { category: string; contentId: string; deepLink: string };
    };
    expect(options.data.category).toBe('MESSAGES');
    expect(options.data.contentId).toBe('conv-1');
    expect(options.data.deepLink).toBe('/chat/conv-1');
  });

  it('legacy payload (only conversationId, the pre-fix offline shape) still lands on the conversation', async () => {
    const { listeners, fakeSelf } = loadServiceWorker();
    const push = listeners.get('push')!;
    let waited: Promise<unknown> | undefined;
    push({
      data: {
        json: () => ({ title: 'QuantChat', body: 'New message', conversationId: 'conv-1' }),
        text: () => '',
      },
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
    } as never);
    await waited;
    const options = fakeSelf.registration.showNotification.mock.calls[0]![1] as {
      data: { category: string; contentId: string; deepLink: string };
    };
    expect(options.data.category).toBe('MESSAGES');
    expect(options.data.contentId).toBe('conv-1');
    expect(options.data.deepLink).toBe('/chat/conv-1');
  });

  it('payload without a deep link resolves through the FIXED map (REELS id -> /reels, not /reels/<id>)', async () => {
    const { listeners, fakeSelf } = loadServiceWorker();
    const push = listeners.get('push')!;
    let waited: Promise<unknown> | undefined;
    push({
      data: {
        json: () => ({ title: 'QuantChat', body: 'New like', category: 'REELS', contentId: 'reel-1' }),
        text: () => '',
      },
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
    } as never);
    await waited;
    const options = fakeSelf.registration.showNotification.mock.calls[0]![1] as {
      data: { deepLink: string };
    };
    expect(options.data.deepLink).toBe('/reels');
  });
});

describe('QC-F-142 service worker — notificationclick', () => {
  it('NAVIGATES an already-open window to the conversation (not just focus)', async () => {
    const { listeners, fakeSelf } = loadServiceWorker();
    const client = makeClient(true);
    fakeSelf.clients.matchAll.mockResolvedValue([client]);
    const click = listeners.get('notificationclick')!;
    let waited: Promise<unknown> | undefined;
    click({
      notification: {
        close: vi.fn(),
        data: { category: 'MESSAGES', contentId: 'conv-1', deepLink: '/chat/conv-1' },
      },
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
    } as never);
    await waited;
    expect(client.navigate).toHaveBeenCalledWith('/chat/conv-1');
    expect(client.focus).toHaveBeenCalled();
    expect(fakeSelf.clients.openWindow).not.toHaveBeenCalled();
  });

  it('falls back to focus-only when the open window cannot navigate', async () => {
    const { listeners, fakeSelf } = loadServiceWorker();
    const client = makeClient(false);
    fakeSelf.clients.matchAll.mockResolvedValue([client]);
    const click = listeners.get('notificationclick')!;
    let waited: Promise<unknown> | undefined;
    click({
      notification: {
        close: vi.fn(),
        data: { category: 'MESSAGES', contentId: 'conv-1', deepLink: '/chat/conv-1' },
      },
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
    } as never);
    await waited;
    expect(client.focus).toHaveBeenCalled();
    expect(fakeSelf.clients.openWindow).not.toHaveBeenCalled();
  });

  it('opens a fresh window at the payload deep link when no window is open', async () => {
    const { listeners, fakeSelf } = loadServiceWorker();
    const click = listeners.get('notificationclick')!;
    let waited: Promise<unknown> | undefined;
    click({
      notification: {
        close: vi.fn(),
        data: { category: 'MESSAGES', contentId: 'conv-1', deepLink: '/chat/conv-1' },
      },
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
    } as never);
    await waited;
    expect(fakeSelf.clients.openWindow).toHaveBeenCalledWith('/chat/conv-1');
  });

  it('opens a fresh window at the RESOLVED route when the payload carries no deep link', async () => {
    const { listeners, fakeSelf } = loadServiceWorker();
    const click = listeners.get('notificationclick')!;
    let waited: Promise<unknown> | undefined;
    click({
      notification: {
        close: vi.fn(),
        data: { category: 'MESSAGES', contentId: 'conv-2' },
      },
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
    } as never);
    await waited;
    expect(fakeSelf.clients.openWindow).toHaveBeenCalledWith('/chat/conv-2');
  });
});
