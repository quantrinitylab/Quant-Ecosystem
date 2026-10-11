// Thread WebSocket handshake auth — token must travel via
// Sec-WebSocket-Protocol / cookie / Authorization header, NEVER the URL query.
import { describe, expect, it } from 'vitest';
import {
  THREAD_WS_SUBPROTOCOL,
  extractThreadWsToken,
} from '../services/thread-ws-auth';

const TEST_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ';

describe('extractThreadWsToken', () => {
  it('extracts the session token from a Sec-WebSocket-Protocol offer', () => {
    const token = extractThreadWsToken({
      headers: { 'sec-websocket-protocol': `${THREAD_WS_SUBPROTOCOL}, bearer.${TEST_JWT}` },
    });
    expect(token).toBe(TEST_JWT);
  });

  it('finds the session token when it is the only protocol offered', () => {
    const token = extractThreadWsToken({
      headers: { 'sec-websocket-protocol': `bearer.${TEST_JWT}` },
    });
    expect(token).toBe(TEST_JWT);
  });

  it('is case-insensitive about the bearer prefix', () => {
    const token = extractThreadWsToken({
      headers: { 'sec-websocket-protocol': `Bearer.${TEST_JWT}` },
    });
    expect(token).toBe(TEST_JWT);
  });

  it('ignores a non-token offer without a credential', () => {
    expect(
      extractThreadWsToken({ headers: { 'sec-websocket-protocol': THREAD_WS_SUBPROTOCOL } }),
    ).toBeNull();
  });

  it('NEVER accepts a token from the URL query string — even when it is the only credential', () => {
    // The leak this fix closes: ?token=<accessToken> used to be honored first.
    const token = extractThreadWsToken({
      headers: {},
      url: `/ws/thread/thread-1?token=${encodeURIComponent(TEST_JWT)}`,
      query: { token: TEST_JWT },
    });
    expect(token).toBeNull();
  });

  it('accepts the quant_access_token cookie', () => {
    const token = extractThreadWsToken({
      headers: {},
      cookies: { quant_access_token: TEST_JWT },
    });
    expect(token).toBe(TEST_JWT);
  });

  it('accepts the quant_access_token cookie from the raw cookie header', () => {
    const token = extractThreadWsToken({
      headers: { cookie: `other=1; quant_access_token=${TEST_JWT}; more=2` },
    });
    expect(token).toBe(TEST_JWT);
  });

  it('accepts an Authorization header token (non-browser WS clients)', () => {
    const token = extractThreadWsToken({
      headers: { authorization: `Bearer ${TEST_JWT}` },
    });
    expect(token).toBe(TEST_JWT);
  });

  it('prefers the subprotocol session token over cookie/header fallbacks', () => {
    const token = extractThreadWsToken({
      headers: {
        'sec-websocket-protocol': `bearer.${TEST_JWT}`,
        cookie: 'quant_access_token=cookie-token',
        authorization: 'Bearer header-token',
      },
      cookies: { quant_access_token: 'cookie-token' },
    });
    expect(token).toBe(TEST_JWT);
  });

  it('returns null when no credential is present anywhere', () => {
    expect(extractThreadWsToken({ headers: {} })).toBeNull();
    expect(extractThreadWsToken({})).toBeNull();
  });
});
