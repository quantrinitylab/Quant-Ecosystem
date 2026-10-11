// ============================================================================
// Quant Ecosystem — shared QuantMail OAuth2 (PKCE) client helpers.
//
// Used by the six social apps' login screens for the REAL "Continue with
// QuantMail" flow (Contract A):
//   1. generatePkcePair() + generateOAuthState()
//   2. writeSsoRequestCookies({ state, verifier, returnTo }) — short-lived,
//      SameSite=Lax, readable by this origin's JS only for the round-trip
//   3. redirect the browser to buildAuthorizeUrl(...)
//   4. QuantMail redirects back to this app's /api/auth/sso/callback, which
//      does the code->token exchange SERVER-SIDE and mints httpOnly cookies.
//
// No tokens ever touch the URL or JavaScript storage. Pure functions are
// unit-tested; DOM/cookie helpers degrade silently in sandboxed iframes.
// ============================================================================

/** OAuth client_ids registered at QuantMail for the six social apps. */
export const SSO_CLIENT_IDS = {
  quantgram: 'quantgram',
  quantube: 'quantube',
  quantwave: 'quantwave',
  quantcooks: 'quantcooks',
  quantads: 'quantads',
  quantmax: 'quantmax',
} as const;

export type SsoAppId = keyof typeof SSO_CLIENT_IDS;

/** Query params that must never linger in the address bar after an SSO handoff. */
export const SSO_HANDOFF_PARAM_NAMES = [
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  '__quant_sso_ticket',
  'sso_ticket',
  '__quant_return',
] as const;

/** Honest copy for the forgot-password affordance (Contract C). */
export const PASSWORD_RESET_SENT_COPY =
  "We'll email a reset link to your QuantMail inbox.";

/** Pre-auth request cookie names (client-set, 10-minute life, SameSite=Lax). */
export const SSO_REQUEST_COOKIES = {
  state: 'quant_sso_state',
  verifier: 'quant_sso_verifier',
  returnTo: 'quant_sso_return',
  /** The exact redirect_uri the browser sent to /authorize (for the code exchange). */
  redirectUri: 'quant_sso_redirect',
} as const;

function getCrypto(): Crypto | null {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
  } catch {
    // Restricted environment
  }
  return null;
}

/** URL-safe random string from WebCrypto (Node fallback via globalThis.crypto). */
export function randomUrlSafeString(byteLength: number): string {
  const cryptoObj = getCrypto();
  if (!cryptoObj?.getRandomValues) {
    throw new Error('Secure random number generation is unavailable in this environment.');
  }
  const bytes = cryptoObj.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64Url(input: string): Promise<string> {
  const cryptoObj = getCrypto();
  if (!cryptoObj?.subtle) {
    throw new Error('SubtleCrypto is unavailable in this environment.');
  }
  const digest = await cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface PkcePair {
  /** High-entropy secret; stored in the pre-auth request cookie, never in the URL. */
  verifier: string;
  /** S256 challenge sent to the authorize endpoint. */
  challenge: string;
}

/** Generate an OAuth2 PKCE pair (S256). The verifier stays client+server-side only. */
export async function generatePkcePair(): Promise<PkcePair> {
  const verifier = randomUrlSafeString(64);
  const challenge = await sha256Base64Url(verifier);
  return { verifier, challenge };
}

/** Generate a single-use OAuth state value (CSRF protection for the round-trip). */
export function generateOAuthState(): string {
  return randomUrlSafeString(32);
}

/**
 * Build the QuantMail authorize URL (Contract A). The browser navigates here;
 * an unauthenticated browser gets QuantMail's login with returnTo, then
 * consent, then a 302 back to redirectUri with ?code=&state=.
 */
export function buildAuthorizeUrl(args: {
  baseUrl?: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
}): string {
  const base = (args.baseUrl ?? 'https://quantmail.in').replace(/\/$/, '');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: args.scope ?? 'openid profile email',
    state: args.state,
    code_challenge: args.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${base}/api/oauth/authorize?${params.toString()}`;
}

/**
 * Validate the returned OAuth state against the stored one. Constant-time
 * comparison; false for any missing/mismatched input. Pure — unit-tested.
 */
export function validateOAuthState(
  expected: string | null | undefined,
  actual: string | null | undefined,
): boolean {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  if (expected.length === 0 || actual.length === 0) return false;
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Only allow same-origin, absolute-path returns so ?returnTo can't
 * open-redirect. Accepts the pages-router string|string[] shape. Pure.
 */
export function safeReturnPath(raw: string | string[] | null | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) return null;
  return trimmed;
}

/**
 * Strip every SSO handoff param from a full URL, preserving everything else
 * (including returnTo and the hash). Pure — unit-tested. Callers apply the
 * result with history.replaceState immediately after ingesting a handoff.
 */
export function scrubSsoParamsFromUrl(href: string, names: readonly string[] = SSO_HANDOFF_PARAM_NAMES): string {
  try {
    const url = new URL(href);
    for (const name of names) url.searchParams.delete(name);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

/** Read one cookie value. Null-safe for SSR/sandboxed iframes. */
function readCookie(name: string): string | null {
  try {
    if (typeof document === 'undefined') return null;
    for (const part of document.cookie.split(';')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      if (part.slice(0, idx).trim() === name) {
        const raw = part.slice(idx + 1).trim();
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSec: number): void {
  try {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
  } catch {
    // Sandboxed iframe — the SSO round-trip cannot proceed; the callback
    // route will fail closed on the missing state cookie.
  }
}

export interface SsoRequestCookies {
  state: string;
  verifier: string;
  returnTo: string | null;
  /** Exact redirect_uri used at /authorize; the token exchange must repeat it verbatim. */
  redirectUri: string | null;
}

/**
 * Persist the pre-auth round-trip values (state, PKCE verifier, return path,
 * exact redirect_uri) in short-lived, SameSite=Lax, first-party cookies. The
 * callback route reads them to validate state and complete the code exchange.
 */
export function writeSsoRequestCookies(args: { state: string; verifier: string; returnTo?: string | null; redirectUri?: string }): void {
  const maxAge = 600; // 10 minutes — the auth round-trip must finish quickly
  writeCookie(SSO_REQUEST_COOKIES.state, args.state, maxAge);
  writeCookie(SSO_REQUEST_COOKIES.verifier, args.verifier, maxAge);
  if (args.returnTo) writeCookie(SSO_REQUEST_COOKIES.returnTo, args.returnTo, maxAge);
  if (args.redirectUri) writeCookie(SSO_REQUEST_COOKIES.redirectUri, args.redirectUri, maxAge);
}

export function readSsoRequestCookies(): SsoRequestCookies | null {
  const state = readCookie(SSO_REQUEST_COOKIES.state);
  const verifier = readCookie(SSO_REQUEST_COOKIES.verifier);
  if (!state || !verifier) return null;
  return {
    state,
    verifier,
    returnTo: readCookie(SSO_REQUEST_COOKIES.returnTo),
    redirectUri: readCookie(SSO_REQUEST_COOKIES.redirectUri),
  };
}

export function clearSsoRequestCookies(): void {
  try {
    if (typeof document === 'undefined') return;
    for (const name of Object.values(SSO_REQUEST_COOKIES)) {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  } catch {
    // Sandboxed iframe
  }
}

/** Honest, non-technical copy for SSO failure redirects (?error= from the callback). */
export const SSO_ERROR_COPY: Record<string, string> = {
  sso_failed: 'QuantMail sign-in failed. Please try again.',
  sso_rejected: 'QuantMail rejected the sign-in attempt. Please try again.',
  sso_cancelled: 'QuantMail sign-in was cancelled.',
};

/** Read the Contract B ticket (?sso_ticket=) from the current URL, if present. */
export function readSsoTicketFromLocation(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const value = new URLSearchParams(window.location.search).get('sso_ticket');
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Consume the Contract B ticket from the URL: scrub it from the address bar
 * FIRST (history.replaceState, before any network call), then return it for
 * server-side verification. Returns null when no ticket is present.
 */
export function consumeSsoTicketFromUrl(): string | null {
  const ticket = readSsoTicketFromLocation();
  if (!ticket || typeof window === 'undefined') return ticket;
  try {
    window.history.replaceState({}, document.title, scrubSsoParamsFromUrl(window.location.href));
  } catch {
    // Sandboxed iframe without history access — the ticket stays visible but
    // is single-use and verified server-side regardless.
  }
  return ticket;
}

/**
 * Start the real "Continue with QuantMail" flow: PKCE + state -> persist the
 * round-trip cookies -> browser redirect to QuantMail's authorize endpoint.
 * Nothing secret goes in the URL; the code exchange happens server-side in
 * this app's /api/auth/sso/callback.
 */
export async function startQuantMailOAuth(args: {
  appId: SsoAppId;
  returnTo?: string | null;
  baseUrl?: string;
}): Promise<void> {
  const { verifier, challenge } = await generatePkcePair();
  const state = generateOAuthState();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectUri = `${origin}/api/auth/sso/callback`;
  writeSsoRequestCookies({ state, verifier, returnTo: args.returnTo ?? null, redirectUri });
  const authorizeUrl = buildAuthorizeUrl({
    baseUrl: args.baseUrl,
    clientId: SSO_CLIENT_IDS[args.appId],
    redirectUri,
    state,
    codeChallenge: challenge,
  });
  window.location.href = authorizeUrl;
}

/**
 * Ask this app's server to request a QuantMail password-reset email
 * (Contract C). The server proxies to QuantMail, which always answers 200
 * (no account enumeration). Resolves on accepted; throws an honest Error on
 * transport/service failure.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch('/api/auth/password-reset/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      body?.error?.message ?? 'Could not reach the password-reset service. Please try again later.',
    );
  }
}
