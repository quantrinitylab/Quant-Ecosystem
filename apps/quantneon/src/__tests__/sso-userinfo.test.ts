import { describe, it, expect } from 'vitest';
import { GET } from '../app/api/auth/userinfo/route';

describe('SSO Userinfo Route', () => {
  it('returns 401 when no auth header is provided', async () => {
    const request = new Request('http://localhost/api/auth/userinfo');
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it('returns 200 and parses JWT token', async () => {
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

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data.id).toBe('test-123');
    expect(result.data.email).toBe('test@example.com');
  });

  it('returns 200 for quant_ tokens', async () => {
    const request = new Request('http://localhost/api/auth/userinfo', {
      headers: {
        authorization: `Bearer quant_12345`,
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data.id).toBe('user_sso');
  });
});
