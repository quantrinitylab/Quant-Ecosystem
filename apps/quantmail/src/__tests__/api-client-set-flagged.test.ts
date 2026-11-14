import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/browser-auth-session', () => ({
  browserAuthSession: {
    getAccessToken: () => 'test-token',
    authenticatedFetch: vi.fn(),
  },
}));

vi.mock('../services/browser-api-request', () => ({
  browserApiRequest: vi.fn(),
}));

vi.mock('../lib/ai-intent-preference', () => ({
  readAIIntent: () => null,
}));

import { apiClient } from '../services/api-client';
import { browserAuthSession } from '../services/browser-auth-session';

const mockAuthenticatedFetch = vi.mocked(browserAuthSession.authenticatedFetch);

describe('apiClient.setFlagged (AC-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts /emails/:id/flag with isFlagged boolean and fresh Idempotency-Key', async () => {
    const fakeResponse = new Response(
      JSON.stringify({ success: true, data: { id: 'email-1', isFlagged: true } }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    mockAuthenticatedFetch.mockResolvedValueOnce(fakeResponse);

    const result = await apiClient.setFlagged('email-1', true);

    expect(result.success).toBe(true);
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockAuthenticatedFetch.mock.calls[0];
    expect(url).toContain('/emails/email-1/flag');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ isFlagged: true });

    const headers = init?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(/^[\w-]{1,128}$/);
  });

  it('returns failure envelope without throwing on HTTP 403 or network failure', async () => {
    const errorResponse = new Response(
      JSON.stringify({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not authorized', statusCode: 403 },
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    mockAuthenticatedFetch.mockResolvedValueOnce(errorResponse);

    const result = await apiClient.setFlagged('email-forbidden', true);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('FORBIDDEN');
    expect(result.error?.statusCode).toBe(403);
  });
});
