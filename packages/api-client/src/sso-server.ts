// ============================================================================
// @quant/api-client - Server-side QuantMail SSO helpers (Node runtime only)
//
// Shared building blocks for the six social apps' real QuantMail OAuth2 login
// (Contract A: authorization-code + PKCE, Contract B: /sso chooser tickets,
// Contract C: password-reset requests). Imported ONLY from Next.js route
// handlers (runtime = 'nodejs') — never from client components.
//
// Session model (per app origin):
//   - `quant_sso_access`  — httpOnly + Secure + SameSite=Lax cookie holding the
//     QuantMail OAuth access token (Contract A) or the identity backend's
//     access token (password login, relayed by /auth/[action]).
//   - `quant_sso_refresh` — httpOnly + Secure + SameSite=Lax cookie holding the
//     OAuth refresh token (Contract A only).
//   - `quant_sso_session` — httpOnly + Secure + SameSite=Lax cookie holding an
//     HMAC-signed identity envelope (Contract B ticket flow, which yields no
//     OAuth tokens). The signature makes it unforgeable by the browser.
// Tokens NEVER appear in URLs and are NEVER readable from JavaScript.
// ============================================================================

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Base URL of the QuantMail identity provider (public; browsers redirect here). */
export function ssoProviderBaseUrl(): string {
  return (process.env['QUANTMAIL_SSO_BASE_URL'] ?? 'https://quantmail.in').replace(/\/$/, '');
}

export const SSO_COOKIES = {
  access: 'quant_sso_access',
  refresh: 'quant_sso_refresh',
  session: 'quant_sso_session',
  state: 'quant_sso_state',
  verifier: 'quant_sso_verifier',
  returnTo: 'quant_sso_return',
} as const;

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

export interface SsoTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  idToken?: string;
}

export interface SsoUser {
  id: string;
  email: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export class SsoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = 'SsoError';
  }
}

/** True in deployed (https) environments so cookies get the Secure attribute. */
export function ssoCookiesSecure(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

function cookieAttributes(maxAgeSec: number, secure: boolean): string {
  return `Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * Build Set-Cookie headers for an OAuth token session (Contract A) or a
 * password-login access token relayed by /auth/[action]. Pure — unit-testable.
 */
export function buildTokenSessionCookies(
  tokens: SsoTokens,
  options?: { secure?: boolean; refreshMaxAgeSec?: number },
): string[] {
  const secure = options?.secure ?? ssoCookiesSecure();
  const accessMaxAge = Math.max(60, Math.min(tokens.expiresIn ?? 900, 3600));
  const out = [
    `${SSO_COOKIES.access}=${encodeURIComponent(tokens.accessToken)}; ${cookieAttributes(accessMaxAge, secure)}`,
  ];
  if (tokens.refreshToken) {
    const refreshMaxAge = options?.refreshMaxAgeSec ?? 30 * 24 * 3600;
    out.push(
      `${SSO_COOKIES.refresh}=${encodeURIComponent(tokens.refreshToken)}; ${cookieAttributes(refreshMaxAge, secure)}`,
    );
  }
  return out;
}

/** Build Set-Cookie headers that clear every SSO session/request cookie. */
export function buildClearSessionCookies(options?: { secure?: boolean }): string[] {
  const secure = options?.secure ?? ssoCookiesSecure();
  const expired = `Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return [SSO_COOKIES.access, SSO_COOKIES.refresh, SSO_COOKIES.session].map(
    (name) => `${name}=; ${expired}`,
  );
}

/** Build Set-Cookie headers that clear the pre-auth SSO request cookies. */
export function buildClearSsoRequestCookies(): string[] {
  return [
    SSO_COOKIES.state,
    SSO_COOKIES.verifier,
    SSO_COOKIES.returnTo,
    'quant_sso_redirect',
  ].map((name) => `${name}=; Path=/; Max-Age=0; SameSite=Lax`);
}

/**
 * Only allow same-origin, absolute-path returns so ?returnTo / stored return
 * values cannot open-redirect. Returns null for anything else.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

/** Parse a Cookie header into a name->value map. Pure — unit-testable. */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name && out[name] === undefined) {
      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contract A: authorization-code + PKCE exchange (server-side, back-channel)
// ---------------------------------------------------------------------------

const TOKEN_TIMEOUT_MS = 10000;

async function postJson(url: string, body: Record<string, string>, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-store' },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'manual',
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Exchange an authorization code for tokens (Contract A), back-channel.
 * Throws SsoError on any failure — callers fail closed.
 */
export async function exchangeAuthorizationCode(args: {
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier: string;
  baseUrl?: string;
}): Promise<SsoTokens> {
  const baseUrl = (args.baseUrl ?? ssoProviderBaseUrl()).replace(/\/$/, '');
  let res;
  try {
    res = await postJson(
      `${baseUrl}/api/oauth/token`,
      {
        grant_type: 'authorization_code',
        code: args.code,
        redirect_uri: args.redirectUri,
        client_id: args.clientId,
        code_verifier: args.codeVerifier,
      },
      TOKEN_TIMEOUT_MS,
    );
  } catch {
    throw new SsoError('PROVIDER_UNAVAILABLE', 'The QuantMail sign-in service is unreachable.', 502);
  }

  if (res.status === 400 || res.status === 401) {
    throw new SsoError(
      'CODE_REJECTED',
      'QuantMail rejected the sign-in attempt. Please try again.',
      401,
    );
  }
  if (!res.ok) {
    throw new SsoError(
      'TOKEN_EXCHANGE_FAILED',
      'Could not complete the QuantMail sign-in. Please try again.',
      502,
    );
  }
  const data = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    token_type?: unknown;
    id_token?: unknown;
  } | null;
  const accessToken = data?.access_token;
  if (!data || typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new SsoError(
      'TOKEN_EXCHANGE_FAILED',
      'QuantMail did not return a usable session. Please try again.',
      502,
    );
  }
  return {
    accessToken,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : undefined,
    tokenType: typeof data.token_type === 'string' ? data.token_type : undefined,
    idToken: typeof data.id_token === 'string' ? data.id_token : undefined,
  };
}

/**
 * Refresh an OAuth session (Contract A) using the refresh token cookie.
 * Throws SsoError when the refresh token is rejected — callers must then
 * clear the session and ask the user to sign in again.
 */
export async function refreshOAuthTokens(args: {
  refreshToken: string;
  clientId: string;
  baseUrl?: string;
}): Promise<SsoTokens> {
  const baseUrl = (args.baseUrl ?? ssoProviderBaseUrl()).replace(/\/$/, '');
  let res;
  try {
    res = await postJson(
      `${baseUrl}/api/oauth/token`,
      {
        grant_type: 'refresh_token',
        refresh_token: args.refreshToken,
        client_id: args.clientId,
      },
      TOKEN_TIMEOUT_MS,
    );
  } catch {
    throw new SsoError('PROVIDER_UNAVAILABLE', 'The QuantMail sign-in service is unreachable.', 502);
  }
  if (res.status === 400 || res.status === 401) {
    // Refresh token rejected/expired — not retryable.
    throw new SsoError('REFRESH_REJECTED', 'The saved sign-in has expired.', 401);
  }
  if (!res.ok) {
    throw new SsoError('REFRESH_FAILED', 'Could not refresh the QuantMail session.', 502);
  }
  const data = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  } | null;
  const accessToken = data?.access_token;
  if (!data || typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new SsoError('REFRESH_FAILED', 'QuantMail did not return a usable session.', 502);
  }
  return {
    accessToken,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : args.refreshToken,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : undefined,
  };
}

// ---------------------------------------------------------------------------
// Back-channel identity verification (userinfo / ticket)
// ---------------------------------------------------------------------------

const USERINFO_TIMEOUT_MS = 8000;

function normalizeUser(raw: unknown): SsoUser | null {
  const obj = (raw as { data?: unknown; user?: unknown } | null)?.data
    ?? (raw as { user?: unknown } | null)?.user
    ?? raw;
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const id = o['id'] ?? o['sub'];
  const email = o['email'];
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof email !== 'string' || email.length === 0) return null;
  const username = typeof o['username'] === 'string' ? o['username'] : undefined;
  const displayName =
    typeof o['displayName'] === 'string'
      ? o['displayName']
      : typeof o['name'] === 'string'
        ? o['name']
        : username;
  const avatarUrl =
    typeof o['avatarUrl'] === 'string'
      ? o['avatarUrl']
      : typeof o['picture'] === 'string'
        ? o['picture']
        : null;
  return { id, email, username, displayName, avatarUrl };
}

/**
 * Verify an access token back-channel against QuantMail /api/oauth/userinfo
 * (Contract A). Returns the verified user, or null when the token is rejected
 * or the provider is unreachable. Never throws for provider errors — callers
 * fail closed on null. (Only programming misuse throws.)
 */
export async function verifyAccessToken(args: {
  accessToken: string;
  baseUrl?: string;
}): Promise<SsoUser | null> {
  const baseUrl = (args.baseUrl ?? ssoProviderBaseUrl()).replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USERINFO_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/oauth/userinfo`, {
      method: 'GET',
      headers: { authorization: `Bearer ${args.accessToken}`, 'cache-control': 'no-store' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return normalizeUser(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Verify a single-use /sso chooser ticket (Contract B) back-channel.
 * Returns the verified identity, or null when the ticket is invalid/expired
 * or the provider is unreachable. The ticket is NOT a token — the response
 * carries no tokens, so callers must mint an app session (signed identity
 * cookie) rather than a token session.
 */
export async function verifySsoTicket(args: {
  ticket: string;
  baseUrl?: string;
}): Promise<SsoUser | null> {
  const baseUrl = (args.baseUrl ?? ssoProviderBaseUrl()).replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USERINFO_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/oauth/sso-ticket/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ ticket: args.ticket }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      success?: unknown;
      data?: unknown;
    } | null;
    if (!data || data.success !== true) return null;
    return normalizeUser(data.data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Constant-time string comparison for OAuth state validation. */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Verify a session access token back-channel, whatever minted it.
 *
 * OAuth (Contract A) tokens verify at the QuantMail provider base URL;
 * password-login tokens come from the ecosystem identity backend
 * (QUANTMAIL_BACKEND_URL / QUANT_IDENTITY_URL), which may be a different
 * origin. Each candidate is tried in order — the first verified identity
 * wins. Returns null when none verifies (fail closed).
 */
export async function verifySessionAccessToken(accessToken: string): Promise<SsoUser | null> {
  const tried = new Set<string>();
  const candidates: string[] = [ssoProviderBaseUrl()];
  for (const key of ['QUANTMAIL_BACKEND_URL', 'QUANT_IDENTITY_URL'] as const) {
    const url = (process.env[key] ?? '').replace(/\/$/, '');
    if (url) candidates.push(url);
  }
  for (const baseUrl of candidates) {
    if (tried.has(baseUrl)) continue;
    tried.add(baseUrl);
    const user = await verifyAccessToken({ accessToken, baseUrl });
    if (user) return user;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Contract B: HMAC-signed identity session cookie ("mint app session")
//
// The ticket flow yields verified identity but NO tokens. The app mints its
// own session as an HMAC-SHA256-signed cookie: the browser cannot forge it,
// and the server verifies it on every /api/auth/session read. Stateless —
// works across replicas without a session store.
// ---------------------------------------------------------------------------

const IDENTITY_SESSION_MAX_AGE_SEC = 12 * 3600;

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function base64UrlDecode(input: string): string | null {
  try {
    return Buffer.from(input, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Resolve the HMAC secret. Prefers QUANT_SSO_SESSION_SECRET; without it, an
 * ephemeral per-process secret is generated (sessions do not survive a
 * restart — safe default, still unforgeable within the process lifetime).
 */
export function identitySessionSecret(): string {
  const configured = process.env['QUANT_SSO_SESSION_SECRET'];
  if (configured && configured.length >= 32) return configured;
  const g = globalThis as unknown as { __quantSsoEphemeralSecret?: string };
  if (!g.__quantSsoEphemeralSecret) {
    g.__quantSsoEphemeralSecret = randomBytes(32).toString('hex');
  }
  return g.__quantSsoEphemeralSecret;
}

/** Mint a Set-Cookie header for a verified ticket identity. Pure given secret. */
export function mintIdentitySessionCookie(
  user: SsoUser,
  options?: { secret?: string; secure?: boolean; maxAgeSec?: number; issuedAt?: number },
): string {
  const secret = options?.secret ?? identitySessionSecret();
  const secure = options?.secure ?? ssoCookiesSecure();
  const maxAge = options?.maxAgeSec ?? IDENTITY_SESSION_MAX_AGE_SEC;
  const iat = options?.issuedAt ?? Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      iat,
      exp: iat + maxAge,
      kind: 'sso-ticket',
    }),
  );
  const sig = base64UrlEncode(createHmac('sha256', secret).update(payload).digest());
  return `${SSO_COOKIES.session}=${payload}.${sig}; ${cookieAttributes(maxAge, secure)}`;
}

/** Verify a `quant_sso_session` cookie value. Returns the user or null. */
export function readIdentitySessionCookie(
  value: string | null | undefined,
  options?: { secret?: string; nowSec?: number },
): SsoUser | null {
  if (!value || typeof value !== 'string') return null;
  const secret = options?.secret ?? identitySessionSecret();
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(createHmac('sha256', secret).update(payload).digest('base64url'), 'utf8');
    actual = Buffer.from(sig, 'utf8');
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const json = base64UrlDecode(payload);
  if (!json) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  const now = options?.nowSec ?? Math.floor(Date.now() / 1000);
  if (typeof parsed['exp'] !== 'number' || parsed['exp'] <= now) return null;
  if (typeof parsed['id'] !== 'string' || typeof parsed['email'] !== 'string') return null;
  return {
    id: parsed['id'] as string,
    email: parsed['email'] as string,
    username: typeof parsed['username'] === 'string' ? (parsed['username'] as string) : undefined,
    displayName:
      typeof parsed['displayName'] === 'string' ? (parsed['displayName'] as string) : undefined,
    avatarUrl: typeof parsed['avatarUrl'] === 'string' ? (parsed['avatarUrl'] as string) : null,
  };
}

// ---------------------------------------------------------------------------
// Contract C: forgot-password request proxy
// ---------------------------------------------------------------------------

/**
 * Forward a password-reset request to QuantMail (Contract C). QuantMail always
 * answers 200 (no account enumeration), so callers show the honest "check your
 * QuantMail inbox" copy on any 2xx. Throws SsoError when unreachable.
 */
export async function requestPasswordResetUpstream(args: {
  email: string;
  baseUrl?: string;
}): Promise<void> {
  const baseUrl = (args.baseUrl ?? ssoProviderBaseUrl()).replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USERINFO_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ email: args.email }),
      signal: controller.signal,
      cache: 'no-store',
    });
    // QuantMail always returns 200 (no enumeration). Any 2xx/4xx from the
    // provider is still "request accepted" from the app's point of view —
    // only transport failure or 5xx is an honest error.
    if (res.status >= 500) {
      throw new SsoError(
        'RESET_UNAVAILABLE',
        'The password-reset service is temporarily unavailable. Please try again later.',
        502,
      );
    }
  } catch (err) {
    if (err instanceof SsoError) throw err;
    throw new SsoError(
      'RESET_UNAVAILABLE',
      'Could not reach the password-reset service. Please try again later.',
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
