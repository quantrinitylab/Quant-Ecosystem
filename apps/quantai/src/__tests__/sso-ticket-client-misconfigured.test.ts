import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// SSO_MISCONFIGURED copy (claim quantai-sso-email-verified-gate): a 500
// SSO_MISCONFIGURED from the backend is a configuration error, NOT a
// transient outage — it must never be relabelled "temporarily unreachable"
// (SSO_IDENTITY_UNAVAILABLE, retryable), because retrying cannot fix a
// configuration problem.
import {
  resolveSsoTicket,
  SsoTicketError,
  SSO_TICKET_ERROR_COPY,
} from '../lib/sso-ticket-client';

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SSO_MISCONFIGURED copy', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('has a non-retryable, non-transient copy entry', () => {
    const copy = SSO_TICKET_ERROR_COPY['SSO_MISCONFIGURED'];
    expect(copy).toBeDefined();
    expect(copy.retryable).toBe(false);
    expect(copy.message.length).toBeGreaterThan(20);
    expect(copy.message).not.toMatch(/temporarily unreachable/);
  });

  it('constructs a non-retryable SsoTicketError for SSO_MISCONFIGURED', () => {
    const err = new SsoTicketError('SSO_MISCONFIGURED');
    expect(err.code).toBe('SSO_MISCONFIGURED');
    expect(err.retryable).toBe(false);
    expect(err.message).toBe(SSO_TICKET_ERROR_COPY['SSO_MISCONFIGURED'].message);
  });

  it('maps a backend 500 SSO_MISCONFIGURED to itself, not to SSO_IDENTITY_UNAVAILABLE', async () => {
    mockFetchOnce(500, {
      success: false,
      error: { code: 'SSO_MISCONFIGURED', message: 'not configured', statusCode: 500 },
    });
    const err = await resolveSsoTicket('tick-misconfigured').catch((e) => e);
    expect(err).toBeInstanceOf(SsoTicketError);
    expect(err.code).toBe('SSO_MISCONFIGURED');
    expect(err.retryable).toBe(false);
    expect(err.message).not.toMatch(/temporarily unreachable/);
  });

  it('keeps the generic fallback for genuinely unknown 500 codes', async () => {
    mockFetchOnce(500, {
      success: false,
      error: { code: 'SSO_SOMETHING_ELSE', message: 'unknown', statusCode: 500 },
    });
    const err = await resolveSsoTicket('tick-unknown-500').catch((e) => e);
    expect(err.code).toBe('SSO_IDENTITY_UNAVAILABLE');
    expect(err.retryable).toBe(true);
  });

  it('leaves SSO_CLIENT_MISCONFIGURED non-retryable', () => {
    expect(SSO_TICKET_ERROR_COPY['SSO_CLIENT_MISCONFIGURED'].retryable).toBe(false);
  });
});
