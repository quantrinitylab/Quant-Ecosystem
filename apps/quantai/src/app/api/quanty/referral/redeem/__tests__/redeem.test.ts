import { describe, it, expect } from 'vitest';
import { POST } from '../route';

const AUTH = { authorization: 'Bearer quant_test_token' };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/quanty/referral/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/quanty/referral/redeem', () => {
  it('returns 401 without auth', async () => {
    const res = await POST(post({ code: 'QUANT-ABC123' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns 400 when code is missing', async () => {
    const res = await POST(post({}, AUTH));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns 400 for malformed codes', async () => {
    for (const bad of ['!!!', 'AB', 'a'.repeat(30), 'QUANT 123']) {
      const res = await POST(post({ code: bad }, AUTH));
      expect(res.status).toBe(400);
    }
  });

  it('honestly returns 501 for a well-formed code while the program is not live', async () => {
    const res = await POST(post({ code: 'QUANT-ABC123' }, AUTH));
    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe('REFERRAL_NOT_LIVE');
    expect(json.error).toMatch(/not live yet/i);
  });

  it('never fabricates a success', async () => {
    const res = await POST(post({ code: 'WELCOME-2026' }, AUTH));
    const json = await res.json();
    // A redeem endpoint must not claim success without a real ledger.
    expect(json.success).toBe(false);
  });
});
