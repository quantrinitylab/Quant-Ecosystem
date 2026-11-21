// @vitest-environment node
// ============================================================================
// QuantChat — apiClient call-hangup methods (QC-F-129)
// ============================================================================
//
// apiClient.endCall has always posted to POST /calls/:id/end — the phantom
// path. QC-F-129 makes that path REAL (backend route + Next proxy). These
// tests pin the client side of the contract: the exact URL, the empty body,
// the bearer, the timeout passthrough (the call page hangs up with a 5s
// local ceiling so a stalled backend surfaces the honest unconfirmed state
// instead of freezing the End button), and that a non-success envelope
// propagates instead of being masked.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QuantChatApiClient } from '../services/api-client';

// apiFetchRaw mocked at the module boundary so the timeout passthrough is
// observable — the global-fetch pattern cannot see it.
const apiFetchMocks = vi.hoisted(() => ({
  apiFetchRaw: vi.fn(),
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: apiFetchMocks.apiFetchRaw,
}));

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let client: QuantChatApiClient;

beforeEach(() => {
  apiFetchMocks.apiFetchRaw.mockReset();
  client = new QuantChatApiClient();
  client.setTokens('access.jwt', 'refresh.jwt');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiClient call-hangup methods (QC-F-129)', () => {
  it('endCall POSTs to /api/calls/:id/end with an empty body and the bearer', async () => {
    apiFetchMocks.apiFetchRaw.mockResolvedValue(
      jsonResponse(200, { success: true, data: { message: 'Call ended' } }),
    );
    const res = await client.endCall('call-9');
    expect(res.success).toBe(true);
    const [url, init] = apiFetchMocks.apiFetchRaw.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/calls/call-9/end');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({});
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer access.jwt',
    );
  });

  it('endCall passes the default 30s ceiling through when no options are given', async () => {
    apiFetchMocks.apiFetchRaw.mockResolvedValue(
      jsonResponse(200, { success: true, data: { message: 'Call ended' } }),
    );
    await client.endCall('call-9');
    const [, init] = apiFetchMocks.apiFetchRaw.mock.calls[0]! as [
      string,
      RequestInit & { timeout?: number },
    ];
    expect(init.timeout).toBe(30_000);
  });

  it('endCall passes a caller-supplied timeout through (the page uses 5s)', async () => {
    apiFetchMocks.apiFetchRaw.mockResolvedValue(
      jsonResponse(200, { success: true, data: { message: 'Call ended' } }),
    );
    await client.endCall('call-9', { timeout: 5_000 });
    const [, init] = apiFetchMocks.apiFetchRaw.mock.calls[0]! as [
      string,
      RequestInit & { timeout?: number },
    ];
    expect(init.timeout).toBe(5_000);
  });

  it('endCall propagates a non-success envelope instead of masking it', async () => {
    apiFetchMocks.apiFetchRaw.mockResolvedValue(
      jsonResponse(503, {
        success: false,
        error: { code: 'CALLS_UNAVAILABLE', message: 'down', statusCode: 503 },
      }),
    );
    const res = await client.endCall('call-9');
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('CALLS_UNAVAILABLE');
  });

  it('leaveCall POSTs to /api/calls/:id/leave with an empty body and the bearer', async () => {
    apiFetchMocks.apiFetchRaw.mockResolvedValue(
      jsonResponse(200, { success: true, data: { message: 'Left call' } }),
    );
    const res = await client.leaveCall('call-9');
    expect(res.success).toBe(true);
    const [url, init] = apiFetchMocks.apiFetchRaw.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/calls/call-9/leave');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({});
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer access.jwt',
    );
  });
});
