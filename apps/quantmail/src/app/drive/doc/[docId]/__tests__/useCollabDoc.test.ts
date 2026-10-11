// Collab WebSocket handshake construction — the session access token must
// NEVER appear in the WS URL (query params land in proxy/server logs and
// browser history); it travels as a Sec-WebSocket-Protocol bearer offer.
import { describe, expect, it } from 'vitest';
import { COLLAB_WS_SUBPROTOCOL, buildCollabWsHandshake } from '../useCollabDoc';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ';

describe('buildCollabWsHandshake', () => {
  it('never puts the token in the URL query string', () => {
    const { url } = buildCollabWsHandshake({
      docId: 'doc-1',
      wsHost: 'backend.example:3010',
      secure: true,
      token: JWT,
    });
    expect(url).not.toContain('?token=');
    expect(url).not.toContain('token=');
    expect(url).not.toContain(JWT);
    expect(url).toBe('wss://backend.example:3010/collab/doc-1');
  });

  it('carries the bearer token as a Sec-WebSocket-Protocol offer', () => {
    const { protocols } = buildCollabWsHandshake({
      docId: 'doc-1',
      wsHost: 'backend.example:3010',
      secure: true,
      token: JWT,
    });
    expect(protocols).toContain(COLLAB_WS_SUBPROTOCOL);
    expect(protocols).toContain(`bearer.${JWT}`);
  });

  it('offers only the app subprotocol when no token is available', () => {
    const { protocols, url } = buildCollabWsHandshake({
      docId: 'doc-1',
      wsHost: 'backend.example:3010',
      secure: true,
      token: null,
    });
    expect(protocols).toEqual([COLLAB_WS_SUBPROTOCOL]);
    expect(url).not.toContain('?');
  });

  it('uses ws: for insecure pages and encodes the doc id', () => {
    const { url } = buildCollabWsHandshake({
      docId: 'doc/with spaces',
      wsHost: 'localhost:3010',
      secure: false,
      token: null,
    });
    expect(url).toBe('ws://localhost:3010/collab/doc%2Fwith%20spaces');
  });
});
