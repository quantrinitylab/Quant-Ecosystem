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

// ---------------------------------------------------------------------------
// Authorized token keys (F-204 — token-source audit)
//
// Named, frozen registry of every localStorage key getAuthToken() is allowed
// to read. Each entry is explicitly scoped; a `cross-app-sso` entry is an
// OPT-IN cross-app read and must carry a justification for why the foreign
// key is trusted on QuantAI's origin.
//
// Scope notes:
// - Tokens in this ecosystem are ecosystem-scoped, not per-app: QuantMail is
//   the identity root, and UniversalSSOTokenBridge.consumeHandoffTicket()
//   stores the SERVER-VERIFIED handoff token under every ecosystem key below
//   only after GET /api/auth/userinfo accepts it. QuantAI's backend
//   (packages/server-core/src/plugins/auth.ts) verifies the JWT against the
//   ecosystem issuer list (quantmail + quant-ecosystem audience) and rejects
//   any non-'access' token `kind` — a QuantChat refresh token presented as a
//   bearer is 401'd server-side.
// - localStorage is per-origin: QuantChat's own writes to
//   'quantchat_access_token' live on quantchat.quantrinity.in and can never
//   appear on QuantAI's origin. The only writer of that key on this origin
//   is the verified SSO bridge, so its value is always a server-verified
//   ecosystem access token — the read is legitimate cross-app SSO, not token
//   confusion. It was kept (not dropped) for that reason; removing it would
//   break verified SSO sessions that landed through the handoff flow.
// ---------------------------------------------------------------------------

/** Scope of a token key in the authorized registry. */
export type TokenKeyScope = 'quantai' | 'ecosystem-sso' | 'cross-app-sso';

export interface AuthorizedTokenKey {
  /** The localStorage key name. */
  key: string;
  /** Who may legitimately have written this key. */
  scope: TokenKeyScope;
  /** Honest justification for reading this key — required on every entry. */
  reason: string;
}

/**
 * FROZEN registry of authorized token keys, in read-precedence order.
 * Any new cross-app key added here must update the cross-app snapshot in
 * src/__tests__/auth-token-keys.test.ts or that suite fails.
 */
export const AUTHORIZED_TOKEN_KEYS: readonly AuthorizedTokenKey[] = Object.freeze([
  {
    key: 'quant_access_token',
    scope: 'ecosystem-sso',
    reason:
      'Primary QuantAI key. Written by QuantAI setAuthToken() and by UniversalSSOTokenBridge after server-side verification of the QuantMail SSO handoff.',
  },
  {
    key: 'quant_auth_token',
    scope: 'ecosystem-sso',
    reason:
      'Legacy ecosystem key; written by the same verified SSO flow as quant_access_token.',
  },
  {
    key: 'token',
    scope: 'ecosystem-sso',
    reason:
      'Generic ecosystem key. Written by UniversalSSOTokenBridge for verified handoff tokens; also mirrored by QuantAI setAuthToken().',
  },
  {
    key: 'quant_token',
    scope: 'ecosystem-sso',
    reason:
      'Ecosystem SSO key written by UniversalSSOTokenBridge for verified handoff tokens.',
  },
  {
    key: 'quantchat_access_token',
    scope: 'cross-app-sso',
    reason:
      'F-204 OPT-IN cross-app read. Named for QuantChat, but on QuantAI\'s origin the ONLY writer is UniversalSSOTokenBridge.consumeHandoffTicket(), which stores it solely after server-side verification (GET /api/auth/userinfo) of a QuantMail-issued ecosystem JWT. QuantChat\'s native writes live on its own origin and never reach this localStorage. The value is therefore always a server-verified ecosystem access token — not token confusion.',
  },
]);

// In-memory session cache for fast synchronous access
let memoryToken: string | null = null;
let memoryUser: AuthUser | null = null;

/**
 * Reads the auth token from memory session or localStorage.
 * Consults AUTHORIZED_TOKEN_KEYS in order — see the registry above for why
 * each key (including the cross-app SSO key) is trusted.
 * Returns null if no token is stored or environment is not browser.
 */
export function getAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    let token: string | null = null;
    for (const entry of AUTHORIZED_TOKEN_KEYS) {
      const candidate = localStorage.getItem(entry.key);
      if (candidate) {
        token = candidate;
        break;
      }
    }
    if (token) {
      memoryToken = token;
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * Persists auth token and user in memory session, localStorage, and cookie.
 * Clears guest exploration flag upon successful login.
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
    if (token) {
      localStorage.setItem('quant_access_token', token);
      localStorage.setItem('quant_auth_token', token);
      localStorage.setItem('token', token);
      localStorage.setItem('quant_token', token);
      try {
        document.cookie = `quant_access_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
      } catch {}
    }
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
 */
export function clearAuthSession(): void {
  memoryToken = null;
  memoryUser = null;
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    for (const entry of AUTHORIZED_TOKEN_KEYS) {
      localStorage.removeItem(entry.key);
    }
    localStorage.removeItem(USER_KEY);
    try {
      document.cookie = 'quant_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
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
