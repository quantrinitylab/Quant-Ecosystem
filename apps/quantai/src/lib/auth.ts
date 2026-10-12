// ============================================================================
// QuantAI - Centralized Auth Token & Session Utilities
// Single source of truth for auth token access, session persistence, and headers
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  plan?: 'free' | 'pro' | 'enterprise';
}

export interface PreservedChatState {
  conversations: any[];
  activeConversationId: string | null;
  inputDraft?: string;
  savedAt: string;
}

const PRESERVED_CHAT_KEY = 'quantai_preserved_chat_state';
const GUEST_KEY = 'quantai_guest';
const USER_KEY = 'quant_user';

// In-memory session cache for fast synchronous access
let memoryToken: string | null = null;
let memoryUser: AuthUser | null = null;

/**
 * Reads the auth token from memory session or localStorage.
 * Checks 'quant_access_token', 'quant_auth_token', 'token', 'quant_token', and 'quantchat_access_token'.
 * Returns null if no token is stored or environment is not browser.
 */
export function getAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const token =
      localStorage.getItem('quant_access_token') ||
      localStorage.getItem('quant_auth_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('quant_token') ||
      localStorage.getItem('quantchat_access_token');
    if (token) {
      memoryToken = token;
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * WR-SEC-001: access tokens are NEVER written to JS-readable persistence.
 *
 * The access token lives in the in-memory session cache only. localStorage /
 * cookies are readable by any script on the page (XSS exfiltration risk), so
 * QuantAI no longer duplicates the token into them. Session restore across
 * reloads goes through the HttpOnly-cookie /auth/refresh flow (see
 * services/auth-session.ts); the bridge-owned localStorage keys remain
 * readable via getAuthToken() until the SSO lane migrates the bridge itself.
 *
 * Persists the (non-secret) user profile and clears the guest flag.
 */
export function setAuthToken(token: string, user?: AuthUser | null): void {
  if (token) {
    memoryToken = token;
  }
  if (user) {
    memoryUser = user;
  }
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    localStorage.removeItem(GUEST_KEY);
  } catch {}
}

/**
 * Returns current authenticated user profile from memory or localStorage.
 * Returns null when no profile is stored — never fabricates an identity.
 * Callers treat null as unauthenticated and redirect to login / SSO.
 */
export function getAuthUser(): AuthUser | null {
  if (memoryUser) return memoryUser;
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthUser;
      memoryUser = parsed;
      return parsed;
    }
    // A token without a stored profile is not a valid session — do not
    // invent a user (previously fabricated id 'usr_quant'). The auth flow
    // must complete (login/SSO) to establish identity.
    return null;
  } catch {
    return null;
  }
}

/**
 * Clears all authentication state from memory session and localStorage.
 *
 * WR-SEC-001: clears every known token alias, including the JS-readable
 * keys/cookies the legacy bridge writes (bridge-owned; the SSO lane is
 * migrating the bridge itself, but logout must already be complete):
 * localStorage quant_access_token / quant_auth_token / token / quant_token /
 * quantchat_access_token / quant_auth_tokens / quant_refresh_token /
 * quant_sso_sync_event, and cookies quant_access_token / quant_auth_token /
 * token. HttpOnly cookies can only be cleared server-side via /auth/logout.
 */
export function clearAuthSession(): void {
  memoryToken = null;
  memoryUser = null;
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem('quant_access_token');
    localStorage.removeItem('quant_auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('quant_token');
    localStorage.removeItem('quantchat_access_token');
    localStorage.removeItem('quant_auth_tokens');
    localStorage.removeItem('quant_refresh_token');
    localStorage.removeItem('quant_sso_sync_event');
    localStorage.removeItem(USER_KEY);
    try {
      const expire = 'path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = `quant_access_token=; ${expire}`;
      document.cookie = `quant_auth_token=; ${expire}`;
      document.cookie = `token=; ${expire}`;
    } catch {}
  } catch {}
}

/**
 * Checks whether user is explicitly exploring in Guest mode.
 */
export function isGuestMode(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  try {
    return !getAuthToken() && localStorage.getItem(GUEST_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Sets or clears the guest exploration flag.
 */
export function setGuestMode(isGuest: boolean): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    if (isGuest) {
      localStorage.setItem(GUEST_KEY, 'true');
    } else {
      localStorage.removeItem(GUEST_KEY);
    }
  } catch {}
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
 * Saves chat state to localStorage so it survives page reloads and login transitions.
 */
export function savePreservedChatState(state: PreservedChatState): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PRESERVED_CHAT_KEY, JSON.stringify(state));
  } catch {}
}

/**
 * Loads preserved chat state from localStorage.
 */
export function loadPreservedChatState(): PreservedChatState | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PRESERVED_CHAT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PreservedChatState;
  } catch {
    return null;
  }
}

/**
 * Clears preserved chat state.
 */
export function clearPreservedChatState(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PRESERVED_CHAT_KEY);
  } catch {}
}
