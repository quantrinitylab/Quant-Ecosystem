// Collab WebSocket handshake construction — the session access token must
// NEVER appear in the WS URL (query params land in proxy/server logs and
// browser history); it travels as a Sec-WebSocket-Protocol bearer offer.
import { describe, expect, it } from 'vitest';
import {
  COLLAB_WS_SUBPROTOCOL,
  buildCollabWsHandshake,
  performDocSave,
  type DocSavePayload,
} from '../useCollabDoc';

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

// Auto-save honesty contract: the UI must NEVER show "Saved" unless the
// backend actually accepted the write. A rejected write is 'error' (visible
// banner), a transport failure is 'offline'.
const PAYLOAD: DocSavePayload = {
  title: 'T',
  content: 'x',
  metadata: { icon: '📄', blocks: [] },
  isPublic: false,
};

type Req = (url: string, init?: { method: string; body?: string }) => Promise<{
  ok: boolean;
  status: number;
}>;

describe('performDocSave — honest save status', () => {
  it('returns saved when PATCH succeeds', async () => {
    const req: Req = async () => ({ ok: true, status: 200 });
    expect(await performDocSave(req, 'doc-1', PAYLOAD, 'a@example.com')).toBe('saved');
  });

  it.each([400, 401, 403, 500])(
    'returns error (never saved) when PATCH is rejected with %i',
    async (status) => {
      const req: Req = async () => ({ ok: false, status });
      expect(await performDocSave(req, 'doc-1', PAYLOAD, 'a@example.com')).toBe('error');
    },
  );

  it('returns saved on the 404 -> POST create fallback when POST succeeds', async () => {
    const calls: string[] = [];
    const req: Req = async (url) => {
      calls.push(url);
      return url === '/api/documents' ? { ok: true, status: 201 } : { ok: false, status: 404 };
    };
    expect(await performDocSave(req, 'doc-1', PAYLOAD, 'a@example.com')).toBe('saved');
    expect(calls).toEqual(['/api/documents/doc-1', '/api/documents']);
  });

  it('returns error when the 404 -> POST create fallback fails', async () => {
    const req: Req = async (url) =>
      url === '/api/documents'
        ? { ok: false, status: 500 }
        : { ok: false, status: 404 };
    expect(await performDocSave(req, 'doc-1', PAYLOAD, 'a@example.com')).toBe('error');
  });

  it('returns offline when the network throws', async () => {
    const req: Req = async () => {
      throw new Error('network down');
    };
    expect(await performDocSave(req, 'doc-1', PAYLOAD, 'a@example.com')).toBe('offline');
  });
});
