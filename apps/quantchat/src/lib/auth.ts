// ============================================================================
// QuantChat - Centralized Auth Token Utilities
// Single source of truth for auth token access and header construction
// ============================================================================

/**
 * Reads the auth token from localStorage.
 * Returns null if no token is stored or localStorage is unavailable.
 */
export function getAuthToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('token');
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
 * Prefers `NEXT_PUBLIC_WS_URL`, then the current host on the backend's WS port,
 * and finally a loopback fallback for SSR/tests.
 */
export function getWsBaseUrl(): string {
  const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envWsUrl) return envWsUrl;
  if (typeof window !== 'undefined') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      if (window.location.hostname === 'quantchat.quantrinity.in') {
        return 'wss://quantws.quantrinity.in/ws';
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws`;
    }
    return `ws://${window.location.hostname}:3002`;
  }
  return `ws://127.0.0.1:3002`;
}

/**
 * Builds a WebSocket URL with the auth token as a query parameter.
 */
export function getWsAuthUrl(conversationId: string): string {
  const token = getAuthToken() || '';
  return `${getWsBaseUrl()}/ws/chat?conversationId=${conversationId}&token=${token}`;
}

/**
 * Builds the URL for the single, app-wide chat WebSocket connection.
 *
 * Unlike {@link getWsAuthUrl} this is NOT bound to a single conversation — the
 * shared socket joins conversation rooms dynamically via `join_conversation`
 * frames (see `useChatSocket`). The backend `/ws/chat` route treats the
 * `conversationId` query param as optional, so it is omitted here.
 */
export function getChatSocketUrl(): string {
  const token = getAuthToken() || '';
  return `${getWsBaseUrl()}/ws/chat?token=${encodeURIComponent(token)}`;
}
