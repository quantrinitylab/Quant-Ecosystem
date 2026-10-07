import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from '../app/api/auth/userinfo/route';

// P0-A regression: this route must NEVER fabricate an identity from
// unverified token content. Replaces the old tests that asserted the flaw
// (HTTP 200 + fabricated identity for unsigned JWTs / quant_ tokens,
// including the catch-all fallback_user fabrication).
describe('SSO Userinfo Route (fail-closed)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fetchRefused() {
    vi.stubGlobal('fetch', async () => {
      throw new Error('connect ECONNREFUSED');
    });
  }

  it('returns 401 when no auth header is provided', async () => {
    const request = new Request('http://localhost/api/auth/userinfo');
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('never fabricates an identity from an unsigned JWT (backend down -> 503)', async () => {
    fetchRefused();
    const payload = {
      sub: 'test-123',
      email: 'test@example.com',
      username: 'tester',
      displayName: 'Test User',
    };
    const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

    const request = new Request('http://localhost/api/auth/userinfo', {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const response = await GET(request);

    // Fail closed: never HTTP 200 with a fabricated identity.
    expect(response.status).toBe(503);
    const result = await response.json();
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toContain('test@example.com');
    expect(JSON.stringify(result)).not.toContain('test-123');
  });

  it('never fabricates an identity for quant_ tokens (backend down -> 503)', async () => {
    fetchRefused();
    const request = new Request('http://localhost/api/auth/userinfo', {
      headers: {
        authorization: 'Bearer quant_test-token-123',
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(503);
    const result = await response.json();
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toContain('user_sso');
  });

  it('never fabricates a fallback identity for garbage tokens (backend down -> 503)', async () => {
    fetchRefused();
    const request = new Request('http://localhost/api/auth/userinfo', {
      headers: {
        authorization: 'Bearer definitely-not-a-real-token',
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(503);
    const result = await response.json();
    expect(result.success).toBe(false);
    // The old catch-all fallback_user fabrication is gone.
    expect(JSON.stringify(result)).not.toContain('fallback_user');
  });

  it('proxies the backend userinfo when the backend is healthy', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ success: true, data: { id: 'real-1' } }), {
          status: 200,
        }),
    );
    const request = new Request('http://localhost/api/auth/userinfo', {
      headers: {
        authorization: 'Bearer real-backend-token',
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data.id).toBe('real-1');
  });
});
