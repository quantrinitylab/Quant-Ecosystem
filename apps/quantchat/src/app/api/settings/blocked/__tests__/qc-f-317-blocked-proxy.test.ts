// ============================================================================
// QC-F-317 — Next proxy for /api/settings/blocked/[userId]
//
// The proxy previously exported only DELETE (unblock) — the block writer
// had no web path at all. Case 19 pins the new POST forward: method POST,
// target id URL-encoded, Authorization passed through, backend status/body
// mirrored verbatim, and a backend failure answered honestly as 502
// NETWORK_ERROR. A DELETE regression case pins the pre-existing unblock
// forward as unchanged.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from '../[userId]/route';

const originalFetch = global.fetch;

function request(method: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/settings/blocked/user%20x', {
    method,
    headers: { Authorization: 'Bearer test-token' },
  });
}

const params = { params: Promise.resolve({ userId: 'user x' }) };

describe('QC-F-317: POST /api/settings/blocked/[userId] (block proxy)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('19. forwards POST with the id encoded and Authorization passed through, mirroring the backend response', async () => {
    const backendPayload = {
      success: true,
      data: {
        blockedUsers: [
          { id: 'user x', name: 'Ex User', username: 'ex', blockedAt: '2026-10-13T00:00:00.000Z' },
        ],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(backendPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    const res = await POST(request('POST'), params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(backendPayload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/settings/blocked/user%20x');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
  });

  it('19b. answers 502 NETWORK_ERROR when the backend is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const res = await POST(request('POST'), params);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NETWORK_ERROR');
    expect(json.error.message).toBe('Block request failed');
  });

  it('19c. regression: the pre-existing DELETE (unblock) forward is unchanged', async () => {
    const backendPayload = { success: true, data: { blockedUsers: [] } };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(backendPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    const res = await DELETE(request('DELETE'), params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(backendPayload);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/settings/blocked/user%20x');
    expect(init.method).toBe('DELETE');
  });
});
