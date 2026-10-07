// ============================================================================
// QuantChat - Centralized Auth Token Utilities
// Single source of truth for auth token access and header construction
// ============================================================================

/**
 * Reads the auth token from localStorage.
 * Returns null if no token is stored or localStorage is unavailable.
 *
 * QuantChat stores the session token under several keys depending on the
 * sign-in path (`token`, `quant_access_token`, `quant_auth_token`,
 * `quant_token`, `quantchat_access_token` — see lib/auth-session.ts). Read
 * every known key so a session persisted under any of them still produces an
 * Authorization header. Previously only `token` was read: an SSO session that
 * stored the token under a different key sent NO Authorization header, the
 * backend answered 401, and pages like /stories surfaced a generic
 * "Failed to fetch stories" while apiClient-based screens kept working.
 */
const TOKEN_KEYS = [
  'token',
  'quant_access_token',
  'quant_auth_token',
  'quant_token',
  'quantchat_access_token',
];

export function getAuthToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  for (const key of TOKEN_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value) return value;
    } catch {
      /* storage unavailable - try next key */
    }
  }
  return null;
}

/**
 * Returns Authorization headers if a token exists, otherwise an empty object.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Returns Authorization + Content-Type headers for JSON requests.
 */
export function getAuthHeadersWithContent(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return { 'Content-Type': 'application/json' };
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/**
 * Resolves the base WebSocket URL for the QuantChat realtime endpoint.
 * Prefers `NEXT_PUBLIC_WS_URL`, then the SAME ORIGIN as the page
 * (`wss://<host>` — the ingress routes `/ws` to the chat backend which serves
 * `/ws/chat`), and finally a loopback fallback for SSR/tests.
 *
 * NOTE (P0-1, 2026-10-06): this previously hardcoded
 * `wss://quantws.quantrinity.in/ws` for the production host, but that hostname
 * was never deployed (no DNS record, no backend behind it) so the handshake
 * timed out and realtime never worked in production. Same-origin keeps the WS
 * endpoint glued to whatever host actually serves the app. (It also fixes a
 * latent doubled path: the old base already ended in `/ws` while callers
 * appended `/ws/chat` again.)
 */
export function getWsBaseUrl(): string {
  const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envWsUrl) return envWsUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}`;
    }
    return `ws://${window.location.hostname}:3002`;
  }
  return `ws://127.0.0.1:3002`;
}

/**
 * Builds the subprotocol list for a WebSocket handshake.
 *
 * Browser WebSockets cannot set custom headers on the upgrade request, so the
 * bearer token travels as a negotiated subprotocol instead of a `?token=`
 * query parameter. The backend (`@quant/realtime` ConnectionAuth) already
 * accepts the token from the `Sec-WebSocket-Protocol` handshake header — the
 * JWT (base64url, unpadded) is a valid HTTP token. This keeps the credential
 * out of URLs: no proxy/CDN access logs, no browser history, no Referer leaks.
 */
export function getWsProtocols(): string[] {
  const token = getAuthToken();
  return token ? [token] : [];
}

/**
 * Builds the WebSocket URL for a conversation-scoped chat connection.
 * Auth travels via {@link getWsProtocols} (subprotocol), never in the URL.
 */
export function getWsAuthUrl(conversationId: string): string {
  return `${getWsBaseUrl()}/ws/chat?conversationId=${encodeURIComponent(conversationId)}`;
}

/**
 * Builds the URL for the single, app-wide chat WebSocket connection.
 *
 * Unlike {@link getWsAuthUrl} this is NOT bound to a single conversation — the
 * shared socket joins conversation rooms dynamically via `join_conversation`
 * frames (see `useChatSocket`). The backend `/ws/chat` route treats the
 * `conversationId` query param as optional, so it is omitted here. Auth
 * travels via {@link getWsProtocols} (subprotocol), never in the URL.
 */
export function getChatSocketUrl(): string {
  return `${getWsBaseUrl()}/ws/chat`;
}
