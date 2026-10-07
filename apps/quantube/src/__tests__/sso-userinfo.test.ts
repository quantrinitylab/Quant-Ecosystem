import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from '../app/api/auth/userinfo/route';

// P0-A regression: this route must NEVER fabricate an identity from
// unverified token content. Replaces the old tests that asserted the flaw
// (HTTP 200 + fabricated identity for unsigned JWTs / prefix tokens).
describe('Quantube UserInfo API (fail-closed)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fetchRefused() {
    vi.stubGlobal('fetch', async () => {
      throw new Error('connect ECONNREFUSED');
    });
  }

  it('returns 401 if no auth header', async () => {
    const req = new Request('http://localhost/api/auth/userinfo');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('never fabricates an identity from an unsigned JWT (backend down -> 503)', async () => {
    fetchRefused();
    const payload = Buffer.from(
      JSON.stringify({ id: 'jwt-1', email: 'jwt@quantmail.in' }),
    ).toString('base64');
    const token = `header.${payload}.signature`;
    const req = new Request('http://localhost/api/auth/userinfo', {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await GET(req);
    // Fail closed: never HTTP 200 with a fabricated identity.
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(JSON.stringify(json)).not.toContain('jwt@quantmail.in');
    expect(JSON.stringify(json)).not.toContain('jwt-1');
    expect(JSON.stringify(json)).not.toContain('verified');
  });

  it('never fabricates an identity for prefix tokens (backend down -> 503)', async () => {
    fetchRefused();
    const req = new Request('http://localhost/api/auth/userinfo', {
      headers: { authorization: 'Bearer sso_test-token' },
    });
    const res = await GET(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(JSON.stringify(json)).not.toContain('user-1');
  });

  it('proxies the backend userinfo when the backend is healthy', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ success: true, data: { id: 'real-1' } }), {
          status: 200,
        }),
    );
    const req = new Request('http://localhost/api/auth/userinfo', {
      headers: { authorization: 'Bearer real-backend-token' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('real-1');
  });
});
