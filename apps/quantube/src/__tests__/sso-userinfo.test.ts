import { describe, it, expect } from 'vitest';
import { GET } from '../app/api/auth/userinfo/route';

describe('Quantube UserInfo API', () => {
  it('returns 401 if no auth header', async () => {
    const req = new Request('http://localhost/api/auth/userinfo');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('handles valid custom prefix token', async () => {
    const req = new Request('http://localhost/api/auth/userinfo', {
      headers: { authorization: 'Bearer quant_token_123' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.email).toBe('user@quantmail.in');
  });

  it('handles valid JWT token', async () => {
    const payload = Buffer.from(
      JSON.stringify({ id: 'jwt-1', email: 'jwt@quantmail.in' }),
    ).toString('base64');
    const token = `header.${payload}.signature`;
    const req = new Request('http://localhost/api/auth/userinfo', {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.email).toBe('jwt@quantmail.in');
    expect(json.data.id).toBe('jwt-1');
  });
});
