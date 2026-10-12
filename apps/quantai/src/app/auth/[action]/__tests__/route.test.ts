// ============================================================================
// QuantAI — /auth/{action} route tests (F-206)
// ============================================================================
//
// Pins the /refresh NO_SESSION fast-path against the substring-match bypass:
// only a cookie named EXACTLY `quantmail_refresh` may skip the local 200
// NO_SESSION answer and proceed to the identity backend.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const params = (action: string) => ({ params: Promise.resolve({ action }) });

function refreshRequest(cookie: string | null): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie !== null) headers.set('cookie', cookie);
  return new NextRequest('http://localhost/auth/refresh', {
    method: 'POST',
    headers,
    body: '{}',
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /auth/refresh NO_SESSION fast-path', () => {
  it('answers NO_SESSION when the Cookie header is missing', async () => {
    const res = await POST(refreshRequest(null), params('refresh'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; error: { code: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NO_SESSION');
  });

  it('answers NO_SESSION when a decoy cookie merely contains the target name', async () => {
    const res = await POST(refreshRequest('xquantmail_refresh=attacker-value'), params('refresh'));
    const json = (await res.json()) as { success: boolean; error: { code: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NO_SESSION');
  });

  it('answers NO_SESSION when only prefixed/suffixed cookie names are present', async () => {
    const res = await POST(
      refreshRequest('quantmail_refresh2=x; my_quantmail_refresh=y'),
      params('refresh'),
    );
    const json = (await res.json()) as { success: boolean; error: { code: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NO_SESSION');
  });

  it('proxies upstream when the exact refresh cookie is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { success: true, data: { access_token: 'new-access' } },
          { headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const res = await POST(
      refreshRequest('theme=dark; quantmail_refresh=real-refresh-token'),
      params('refresh'),
    );
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown actions before touching cookies or the backend', async () => {
    const res = await POST(refreshRequest('quantmail_refresh=abc'), params('bogus'));
    expect(res.status).toBe(404);
  });
});
