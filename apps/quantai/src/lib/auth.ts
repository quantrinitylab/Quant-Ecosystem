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
 * Checks 'token', 'quant_token', and 'quantchat_access_token'.
 * Returns null if no token is stored or environment is not browser.
 */
export function getAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const token =
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
 * Persists auth token and user in memory session and localStorage.
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
      localStorage.setItem('token', token);
      localStorage.setItem('quant_token', token);
    }
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    localStorage.removeItem(GUEST_KEY);
  } catch {}
}

/**
 * Returns current authenticated user profile from memory or localStorage.
 * If token is present but no user profile is stored, returns a valid default profile.
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
    const token = getAuthToken();
    if (token) {
      return {
        id: 'usr_quant',
        email: 'user@quantmail.in',
        name: 'Quant Member',
        plan: 'pro',
      };
    }
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
    localStorage.removeItem('token');
    localStorage.removeItem('quant_token');
    localStorage.removeItem('quantchat_access_token');
    localStorage.removeItem(USER_KEY);
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
