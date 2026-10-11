// Collab WebSocket handshake auth — token must travel via
// Sec-WebSocket-Protocol / cookie / Authorization header, NEVER the URL query.
import { describe, expect, it } from 'vitest';
import {
  COLLAB_WS_SUBPROTOCOL,
  extractCollabWsToken,
} from '../services/collab-ws-auth';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ';

describe('extractCollabWsToken', () => {
  it('extracts the bearer token from a Sec-WebSocket-Protocol offer', () => {
    const token = extractCollabWsToken({
      headers: { 'sec-websocket-protocol': `${COLLAB_WS_SUBPROTOCOL}, bearer.${JWT}` },
    });
    expect(token).toBe(JWT);
  });

  it('finds the bearer offer when it is the only protocol offered', () => {
    const token = extractCollabWsToken({
      headers: { 'sec-websocket-protocol': `bearer.${JWT}` },
    });
    expect(token).toBe(JWT);
  });

  it('is case-insensitive about the bearer prefix', () => {
    const token = extractCollabWsToken({
      headers: { 'sec-websocket-protocol': `Bearer.${JWT}` },
    });
    expect(token).toBe(JWT);
  });

  it('ignores a non-bearer protocol offer without a token', () => {
    expect(
      extractCollabWsToken({ headers: { 'sec-websocket-protocol': COLLAB_WS_SUBPROTOCOL } }),
    ).toBeNull();
  });

  it('NEVER accepts a token from the URL query string — even when it is the only credential', () => {
    // The leak this fix closes: ?token=<accessToken> used to be honored.
    const token = extractCollabWsToken({
      headers: {},
      url: `/collab/doc-1?token=${encodeURIComponent(JWT)}`,
      query: { token: JWT },
    });
    expect(token).toBeNull();
  });

  it('accepts the quant_access_token cookie', () => {
    const token = extractCollabWsToken({
      headers: {},
      cookies: { quant_access_token: JWT },
    });
    expect(token).toBe(JWT);
  });

  it('accepts the quant_access_token cookie from the raw cookie header', () => {
    const token = extractCollabWsToken({
      headers: { cookie: `other=1; quant_access_token=${JWT}; more=2` },
    });
    expect(token).toBe(JWT);
  });

  it('accepts an Authorization: Bearer header (non-browser WS clients)', () => {
    const token = extractCollabWsToken({
      headers: { authorization: `Bearer ${JWT}` },
    });
    expect(token).toBe(JWT);
  });

  it('prefers the subprotocol bearer token over cookie/header fallbacks', () => {
    const token = extractCollabWsToken({
      headers: {
        'sec-websocket-protocol': `bearer.${JWT}`,
        cookie: `quant_access_token=cookie-token`,
        authorization: 'Bearer header-token',
      },
      cookies: { quant_access_token: 'cookie-token' },
    });
    expect(token).toBe(JWT);
  });

  it('returns null when no credential is present anywhere', () => {
    expect(extractCollabWsToken({ headers: {} })).toBeNull();
    expect(extractCollabWsToken({})).toBeNull();
  });
});
