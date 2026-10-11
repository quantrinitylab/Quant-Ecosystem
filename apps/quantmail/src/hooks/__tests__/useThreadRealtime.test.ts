// Thread WebSocket handshake construction — the session access token must
// NEVER appear in the WS URL (query params land in proxy/server logs and
// browser history); it travels as a Sec-WebSocket-Protocol session token
import { describe, expect, it } from 'vitest';
import { THREAD_WS_SUBPROTOCOL, buildThreadWsHandshake } from '../useThreadRealtime';

const TEST_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ';

describe('buildThreadWsHandshake', () => {
  it('never puts the token in the URL query string', () => {
    const { url } = buildThreadWsHandshake({
      threadId: 'thread-1',
      wsHost: 'quantmail.in',
      secure: true,
      token: TEST_JWT,
    });
    expect(url).not.toContain('?token=');
    expect(url).not.toContain('token=');
    expect(url).not.toContain(TEST_JWT);
    expect(url).toBe('wss://quantmail.in/api/ws/thread/thread-1');
  });

  it('carries the session token as a Sec-WebSocket-Protocol offer', () => {
    const { protocols } = buildThreadWsHandshake({
      threadId: 'thread-1',
      wsHost: 'quantmail.in',
      secure: true,
      token: TEST_JWT,
    });
    expect(protocols).toContain(THREAD_WS_SUBPROTOCOL);
    expect(protocols).toContain(`bearer.${TEST_JWT}`);
  });

  it('offers only the app subprotocol when no token is available', () => {
    const { protocols, url } = buildThreadWsHandshake({
      threadId: 'thread-1',
      wsHost: 'quantmail.in',
      secure: true,
      token: null,
    });
    expect(protocols).toEqual([THREAD_WS_SUBPROTOCOL]);
    expect(url).not.toContain('?');
  });

  it('uses ws: for insecure pages and encodes the thread id', () => {
    const { url } = buildThreadWsHandshake({
      threadId: 'thread/with spaces',
      wsHost: 'localhost:3000',
      secure: false,
      token: TEST_JWT,
    });
    expect(url).toBe('ws://localhost:3000/api/ws/thread/thread%2Fwith%20spaces');
  });
});
