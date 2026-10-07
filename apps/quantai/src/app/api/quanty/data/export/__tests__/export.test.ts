import { describe, it, expect } from 'vitest';
import { POST } from '../route';

function jwt(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${b64}.signature`;
}

function post(token?: string) {
  return new Request('http://localhost/api/quanty/data/export', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: '{}',
  });
}

describe('POST /api/quanty/data/export', () => {
  it('returns 401 without auth', async () => {
    const res = await POST(post());
    expect(res.status).toBe(401);
  });

  it('returns a JSON download with honest coverage manifest', async () => {
    const token = jwt({ id: 'user-1', email: 'user@quantmail.in', displayName: 'User' });
    const res = await POST(post(token));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).toContain('quanty-data-export-');

    const json = await res.json();
    expect(json.format).toBe('quanty-data-export/1');
    expect(json.exportedAt).toBeTruthy();
    expect(json.data.profile.email).toBe('user@quantmail.in');
    expect(json.data.profile.id).toBe('user-1');
    // Honest coverage: states what is NOT included.
    expect(JSON.stringify(json.coverage.notIncluded)).toMatch(/not yet included/i);
  });

  it('does not fabricate profile fields missing from the token', async () => {
    const token = jwt({ sub: 'abc' });
    const res = await POST(post(token));
    const json = await res.json();
    expect(json.data.profile.id).toBe('abc');
    expect(json.data.profile.email).toBeUndefined();
    expect(json.data.profile.displayName).toBeUndefined();
  });

  it('works with opaque (non-JWT) tokens without inventing identity', async () => {
    const res = await POST(post('quant_opaque_token'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.profile).toEqual({});
  });
});
