// ============================================================================
// quantai — usage/stats proxy fallback honesty test (P1 fix 2026-10-11)
// ============================================================================
//
// The /api/usage/stats proxy must NEVER fabricate usage stats when the backend
// is unreachable. A previous fallback returned invented token counts with
// `success: true`, which the UI rendered as the user's real stats. The honest
// behavior is a 503 with `success: false` so the UI stays quiet on error.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../app/api/_lib/agent-proxy';

describe('proxyAgentRequest fallback: GET /usage/stats', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3004')),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns an honest 503 with success:false when the backend is unreachable', async () => {
    const req = new NextRequest('http://localhost:3000/api/usage/stats', {
      method: 'GET',
      headers: { authorization: 'Bearer test-token-abc' },
    });

    const res = await proxyAgentRequest(req, '/usage/stats');

    expect(res.status).toBe(503);
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      code?: string;
      data?: Record<string, unknown>;
    };
    expect(json.success).toBe(false);
    expect(json.code).toBe('UPSTREAM_UNAVAILABLE');
    // No fabricated numbers may leak through.
    expect(json.data).toBeUndefined();
  });
});
