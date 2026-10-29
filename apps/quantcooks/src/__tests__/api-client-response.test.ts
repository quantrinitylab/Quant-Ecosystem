// ============================================================================
// api-client response parsing (CP-1 contract follow-up, flagged by the
// assets-fix unit): QuantEditsApiClient.request() must NEVER throw on an
// unparseable body. When the backend is unreachable the Next proxy
// handler itself fails and answers with an EMPTY body; a bare res.json()
// rejected with a raw SyntaxError ('Unexpected end of JSON input') that
// escaped to every caller and crashed /assets into its error boundary.
// Mirroring @quant/api-client's apiFetch, the failure is a RETURNED
// { success: false, error: { code: 'INVALID_RESPONSE' } } envelope.
// Valid JSON paths (success AND backend error envelopes) are unchanged.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiFetchRaw = vi.fn();

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: (...args: unknown[]) => apiFetchRaw(...args),
}));

import { apiClient } from '../services/api-client';

function fakeResponse(status: number, body: string) {
  return {
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

describe('api-client request() response parsing', () => {
  beforeEach(() => {
    apiFetchRaw.mockReset();
  });

  it('empty body → INVALID_RESPONSE envelope, no throw', async () => {
    // The proxy-crash shape: Next answers an empty body (status 500).
    apiFetchRaw.mockResolvedValue(fakeResponse(500, ''));
    const res = await apiClient.listProjects();
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('INVALID_RESPONSE');
    expect(res.error?.statusCode).toBe(500);
  });

  it('non-JSON body → INVALID_RESPONSE envelope, no throw', async () => {
    apiFetchRaw.mockResolvedValue(fakeResponse(502, '<html>Bad Gateway</html>'));
    const res = await apiClient.listTools();
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('INVALID_RESPONSE');
    expect(res.error?.statusCode).toBe(502);
  });

  it('valid JSON success envelope passes through unchanged', async () => {
    const envelope = { success: true, data: [{ id: 'p1', name: 'Dish film' }] };
    apiFetchRaw.mockResolvedValue(fakeResponse(200, JSON.stringify(envelope)));
    const res = await apiClient.listProjects();
    expect(res).toEqual(envelope);
  });

  it('valid JSON backend error envelope passes through unchanged (not remapped)', async () => {
    const envelope = {
      success: false,
      error: { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage is not configured', statusCode: 503 },
    };
    apiFetchRaw.mockResolvedValue(fakeResponse(503, JSON.stringify(envelope)));
    const res = await apiClient.listAssets();
    expect(res).toEqual(envelope);
    expect(res.error?.code).toBe('STORAGE_NOT_CONFIGURED');
  });
});
