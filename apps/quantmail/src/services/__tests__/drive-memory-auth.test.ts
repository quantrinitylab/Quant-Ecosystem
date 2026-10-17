/**
 * fix/qm-drive-ai-memory-auth — P1: Drive "AI Memory" tab 401d for every
 * signed-in user because loadMemory (drive/page.tsx) called GET
 * /api/drive/memory and forget-memory called DELETE
 * /api/drive/memory/[logicalId] with a plain tokenless fetch. The access
 * token lives only in browser memory (browserAuthSession — no access-token
 * cookie exists), so the backend 401d and the tab always showed
 * "Memory data is unavailable right now."
 *
 * Proves: fetchDriveMemoryItems and forgetDriveMemory attach
 * browserAuthSession.getAccessToken() to every request via apiFetchRaw's
 * `token` param (api-client's own api-fetch.test.ts proves that param
 * becomes the `Authorization: Bearer <token>` header the Next.js proxy
 * forwards to the backend); a missing session token is passed as
 * undefined (never an empty header); HTTP failures surface the honest
 * errors the UI already displays.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  apiFetchRaw: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock('@quant/api-client', () => ({ apiFetchRaw: hoisted.apiFetchRaw }));
vi.mock('../browser-auth-session', () => ({
  browserAuthSession: { getAccessToken: hoisted.getAccessToken },
}));

import { fetchDriveMemoryItems, forgetDriveMemory } from '../drive-memory';

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function statusResponse(status: number): Response {
  // 204/205 must have a null body — the Response constructor throws otherwise.
  return status === 204 || status === 205
    ? new Response(null, { status })
    : new Response(JSON.stringify({}), { status });
}

beforeEach(() => {
  hoisted.apiFetchRaw.mockReset();
  hoisted.getAccessToken.mockReset();
});

describe('drive-memory session auth (fix/qm-drive-ai-memory-auth)', () => {
  it('fetchDriveMemoryItems attaches the browser session token to GET /api/drive/memory', async () => {
    hoisted.getAccessToken.mockReturnValue('sess-token-abc');
    hoisted.apiFetchRaw.mockResolvedValue(
      okResponse({ memories: [{ id: 'm1', content: 'ctx' }] }),
    );

    const items = await fetchDriveMemoryItems();

    expect(hoisted.apiFetchRaw).toHaveBeenCalledTimes(1);
    const [path, init] = hoisted.apiFetchRaw.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/api/drive/memory');
    // THE regression: a tokenless call sent no Authorization and the backend
    // 401d. The session token must travel on every call.
    expect(init.token).toBe('sess-token-abc');
    expect(init.cache).toBe('no-store');
    expect(items).toEqual([{ id: 'm1', content: 'ctx' }]);
  });

  it('fetchDriveMemoryItems passes token: undefined (not a blank header) when the session is empty', async () => {
    hoisted.getAccessToken.mockReturnValue(null);
    hoisted.apiFetchRaw.mockResolvedValue(okResponse({ memories: [] }));

    await fetchDriveMemoryItems();

    const [, init] = hoisted.apiFetchRaw.mock.calls[0] as [string, Record<string, unknown>];
    expect(init.token).toBeUndefined();
  });

  it('fetchDriveMemoryItems returns [] for a missing memories envelope instead of crashing', async () => {
    hoisted.getAccessToken.mockReturnValue('sess-token-abc');
    hoisted.apiFetchRaw.mockResolvedValue(okResponse({}));

    await expect(fetchDriveMemoryItems()).resolves.toEqual([]);
  });

  it('fetchDriveMemoryItems throws the honest "unavailable" error on HTTP failure', async () => {
    hoisted.getAccessToken.mockReturnValue('sess-token-abc');
    hoisted.apiFetchRaw.mockResolvedValue(statusResponse(401));

    await expect(fetchDriveMemoryItems()).rejects.toThrow('Memory data is unavailable right now.');
  });

  it('forgetDriveMemory attaches the session token to DELETE /api/drive/memory/[logicalId] with URL-encoded id', async () => {
    hoisted.getAccessToken.mockReturnValue('sess-token-abc');
    hoisted.apiFetchRaw.mockResolvedValue(statusResponse(204));

    await forgetDriveMemory('mem/1');

    expect(hoisted.apiFetchRaw).toHaveBeenCalledTimes(1);
    const [path, init] = hoisted.apiFetchRaw.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/api/drive/memory/mem%2F1');
    expect(init.method).toBe('DELETE');
    // THE regression (second call site): tokenless DELETE 401d too.
    expect(init.token).toBe('sess-token-abc');
  });

  it('forgetDriveMemory passes token: undefined when the session is empty', async () => {
    hoisted.getAccessToken.mockReturnValue(null);
    hoisted.apiFetchRaw.mockResolvedValue(statusResponse(204));

    await forgetDriveMemory('m1');

    const [, init] = hoisted.apiFetchRaw.mock.calls[0] as [string, Record<string, unknown>];
    expect(init.token).toBeUndefined();
  });

  it('forgetDriveMemory throws the honest error on HTTP failure', async () => {
    hoisted.getAccessToken.mockReturnValue('sess-token-abc');
    hoisted.apiFetchRaw.mockResolvedValue(statusResponse(401));

    await expect(forgetDriveMemory('m1')).rejects.toThrow('Could not forget this memory.');
  });
});
