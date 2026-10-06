// ============================================================================
// QuantAI - Guest session token (client)
// ----------------------------------------------------------------------------
// "Continue as Guest" mints a short-lived, guest-scoped JWT from
// POST /api/guest/session. The token is a REAL credential the backend auth
// gate accepts (same JWT secret), so guest chat uses the real inference
// path — never a fabricated reply.
//
// Cached in memory + sessionStorage (never localStorage: the token expires
// in ~20 minutes and must not outlive the tab).
// ============================================================================

const GUEST_TOKEN_KEY = 'quantai_guest_token';
const GUEST_EXP_KEY = 'quantai_guest_token_exp';

let memoryGuestToken: string | null = null;
let inflight: Promise<string | null> | null = null;

function readStored(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const token = sessionStorage.getItem(GUEST_TOKEN_KEY);
    const exp = Number(sessionStorage.getItem(GUEST_EXP_KEY) ?? 0);
    if (token && exp > Date.now() + 60_000) return token;
    sessionStorage.removeItem(GUEST_TOKEN_KEY);
    sessionStorage.removeItem(GUEST_EXP_KEY);
  } catch {
    // storage unavailable — fall through to minting
  }
  return null;
}

function store(token: string, expiresInSeconds: number): void {
  memoryGuestToken = token;
  try {
    sessionStorage.setItem(GUEST_TOKEN_KEY, token);
    sessionStorage.setItem(GUEST_EXP_KEY, String(Date.now() + expiresInSeconds * 1000));
  } catch {
    // storage unavailable — memory cache still works for this page
  }
}

/**
 * Returns a usable guest token, minting one if needed. Concurrent callers
 * share a single in-flight mint. Returns null when guest sessions are
 * unavailable (backend misconfigured / rate limited / offline) — callers
 * must then degrade honestly, never fake a reply.
 */
export function getGuestToken(): Promise<string | null> {
  if (memoryGuestToken) return Promise.resolve(memoryGuestToken);
  const stored = readStored();
  if (stored) {
    memoryGuestToken = stored;
    return Promise.resolve(stored);
  }
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch('/api/guest/session', { method: 'POST' });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          data?: { token?: string; expiresIn?: number };
        };
        const token = json?.data?.token;
        if (typeof token !== 'string' || !token) return null;
        store(token, json.data?.expiresIn ?? 1200);
        return token;
      } catch {
        return null;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

/** Drops the cached guest token (e.g. after a 401 — it likely expired). */
export function clearGuestToken(): void {
  memoryGuestToken = null;
  try {
    sessionStorage.removeItem(GUEST_TOKEN_KEY);
    sessionStorage.removeItem(GUEST_EXP_KEY);
  } catch {
    // ignore
  }
}
