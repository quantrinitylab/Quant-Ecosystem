// ============================================================================
// Thread WebSocket handshake auth (thread realtime gateway, /ws/thread/:threadId)
// ============================================================================
//
// SECURITY: the session access token must NEVER be placed in the WebSocket URL
// query string. Query params land in reverse-proxy/server access logs and in
// browser history, leaking the credential to anyone with log access. Browsers
// cannot set an `Authorization` header on a WebSocket upgrade request, so the
// frontend sends the session token as a `Sec-WebSocket-Protocol` offer
// (`bearer.<jwt>`). The server reads it from the *offered* protocol list and
// never echoes it back in the 101 response, so the token never appears on the
// wire outside the request header.
//
// Accepted token sources, in priority order:
//   1. `Sec-WebSocket-Protocol: ..., bearer.<jwt>` offer (browser clients)
//   2. `quant_access_token` cookie
//   3. `Authorization: Bearer <jwt>` header (non-browser WS clients only —
//      browsers cannot set this header on an upgrade request)
//
// Tokens in `req.query` / the URL are deliberately NOT read here.

export const THREAD_WS_SUBPROTOCOL = 'thread-v1';
export const THREAD_WS_BEARER_PREFIX = 'bearer.';
const THREAD_ACCESS_COOKIE = 'quant_access_token';

export interface ThreadWsHandshakeRequest {
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  /** Present only to document intent: URL/query tokens are never accepted. */
  url?: string;
  query?: unknown;
}

/**
 * Extract the session token from a `/ws/thread/:threadId` WebSocket upgrade
 * handshake. Returns `null` when no accepted credential is present — in
 * particular, a token that appears ONLY in the URL query string is ignored.
 */
export function extractThreadWsToken(req: ThreadWsHandshakeRequest): string | null {
  // 1. Session token carried as a Sec-WebSocket-Protocol offer.
  const offered = req.headers?.['sec-websocket-protocol'];
  const offeredEntries = Array.isArray(offered) ? offered : typeof offered === 'string' ? [offered] : [];
  for (const entry of offeredEntries) {
    for (const proto of entry.split(',')) {
      const candidate = proto.trim();
      if (
        candidate.length > THREAD_WS_BEARER_PREFIX.length &&
        candidate.toLowerCase().startsWith(THREAD_WS_BEARER_PREFIX)
      ) {
        return candidate.slice(THREAD_WS_BEARER_PREFIX.length);
      }
    }
  }

  // 2. Session cookie.
  const cookieToken = req.cookies?.[THREAD_ACCESS_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }
  const rawCookieHeader = req.headers?.cookie;
  if (typeof rawCookieHeader === 'string' || Array.isArray(rawCookieHeader)) {
    const headerValue = Array.isArray(rawCookieHeader) ? rawCookieHeader.join(';') : rawCookieHeader;
    const match = headerValue.match(/(?:^|;\s*)quant_access_token=([^;]+)/);
    if (match?.[1]?.trim()) {
      return decodeURIComponent(match[1].trim());
    }
  }

  // 3. Authorization header (non-browser WS clients).
  const authorization = req.headers?.authorization;
  const authValue = Array.isArray(authorization) ? authorization[0] : authorization;
  if (typeof authValue === 'string' && authValue.startsWith('Bearer ')) {
    const headerToken = authValue.slice(7).trim();
    if (headerToken) return headerToken;
  }

  return null;
}
