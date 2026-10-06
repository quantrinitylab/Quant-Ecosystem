import { describe, it, expect } from 'vitest';
import { DELETE } from '../route';

const AUTH = { authorization: 'Bearer quant_test_token' };

function del(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/quanty/data', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('DELETE /api/quanty/data', () => {
  it('returns 401 without auth', async () => {
    const res = await DELETE(del({ confirm: 'DELETE' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 without the typed DELETE confirmation', async () => {
    const res = await DELETE(del({}, AUTH));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('rejects wrong confirmation text', async () => {
    const res = await DELETE(del({ confirm: 'delete' }, AUTH));
    expect(res.status).toBe(400);
  });

  it('honestly returns 501 — never a fake deletion success', async () => {
    const res = await DELETE(del({ confirm: 'DELETE' }, AUTH));
    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe('DELETION_NOT_SELF_SERVE');
    expect(json.error).toMatch(/support@quantmail.in/);
    expect(json.error).toMatch(/Nothing has been deleted/);
  });
});
