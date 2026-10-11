// ============================================================================
// QuantAI — OAuth2 (code + PKCE) helpers for "Continue with QuantMail".
//
// QuantMail (https://quantmail.in) is the ecosystem identity provider.
// Contract (FINAL):
//   A. OAuth2 authorization-code + PKCE:
//      GET /api/oauth/authorize?response_type=code&client_id=quantai
//        &redirect_uri={app}/api/auth/sso/callback&scope=openid%20profile%20email
//        &state={random}&code_challenge={S256}&code_challenge_method=S256
//      → 302 to QuantMail login with returnTo (login gate, not 401)
//      → consent screen → approve → 302 {redirect_uri}?code={5-min single-use}&state={state}
//      POST /api/oauth/token { grant_type:'authorization_code', code,
//        redirect_uri (exact), client_id, code_verifier }
//        → { access_token, refresh_token, id_token, expires_in }
//      GET /api/oauth/userinfo with Authorization: Bearer <access_token>
//   B. /sso chooser ticket: QuantMail /sso?returnTo=... hands back
//      ?sso_ticket={single-use 60s ticket} (NOT a token).
//      App server POSTs /api/oauth/sso-ticket/verify { ticket }
//        → { success, data: { id, email, username, displayName } } → mint app session.
//   C. Forgot password: POST /api/auth/password-reset/request { email }
//      (always 200, no enumeration). Reset link is emailed to the user's
//      QuantMail inbox.
//   D. NEVER put tokens in the URL — no ?token=, ?accessToken= etc. anywhere.
//
// The pure helpers in this file are unit-tested
// (src/__tests__/sso-oauth.test.ts). The server routes under
// src/app/api/auth/sso/* compose them with NextResponse cookie handling.
// ============================================================================

/** OAuth client_id registered for QuantAI at the QuantMail provider. */
export const QUANTAI_OAUTH_CLIENT_ID = 'quantai';

/** HttpOnly cookies the SSO handshake uses (10-minute lifetime). */
export const SSO_STATE_COOKIE = 'quant_sso_state';
export const SSO_VERIFIER_COOKIE = 'quant_sso_verifier';
export const SSO_RETURN_COOKIE = 'quant_sso_return';

/** App session cookies minted by the SSO callback / ticket routes. */
export const APP_ACCESS_COOKIE = 'quant_access_token';
export const APP_REFRESH_COOKIE = 'quant_refresh_token';
/** Identity-root refresh cookie — the existing /auth/refresh proxy forwards it
 * to the QuantMail backend, which rotates it. Kept in sync with the SSO
 * refresh token so session restore keeps working after an SSO sign-in. */
export const QUANTMAIL_REFRESH_COOKIE = 'quantmail_refresh';

/** Public (browser-facing) QuantMail base URL for the authorize redirect. */
export function publicQuantmailBase(): string {
  return (
    process.env['NEXT_PUBLIC_QUANTMAIL_SSO_URL'] ||
    process.env['NEXT_PUBLIC_QUANTMAIL_BASE_URL'] ||
    'https://quantmail.in'
  ).replace(/\/$/, '');
}

/** Server-side QuantMail base URL for back-channel calls (token, userinfo,
 * ticket verify). Prefers an explicit override, then the configured backend,
 * then the public site. Paths are tried as /oauth/* then /api/oauth/* (the
 * /api prefix only exists on the public Next.js proxy, not the internal
 * backend service). */
export function serverQuantmailBase(): string {
  return (
    process.env['QUANTMAIL_OAUTH_URL'] ||
    process.env['QUANTMAIL_BACKEND_URL'] ||
    'https://quantmail.in'
  ).replace(/\/$/, '');
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  // Fallback only for non-secure contexts (should never happen in prod);
  // still 256 bits of entropy via Math.random.
  for (let i = 0; i < count; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** PKCE code_verifier: 43–128 chars from the unreserved set (RFC 7636 §4.1). */
export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32)); // 43 chars
}

/** Opaque CSRF state for the authorization request (256 bits). */
export function generateState(): string {
  return base64UrlEncode(randomBytes(32));
}

async function sha256(data: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto SubtleCrypto is unavailable');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(data));
  return new Uint8Array(digest);
}

/** PKCE code_challenge for method S256: BASE64URL(SHA256(verifier)). */
export async function codeChallengeS256(verifier: string): Promise<string> {
  return base64UrlEncode(await sha256(verifier));
}

/** Constant-time string comparison (state validation must not leak via timing). */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

export interface AuthorizeUrlParams {
  providerBaseUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/** Builds the QuantMail OAuth2 authorization URL (Contract A). */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL('/api/oauth/authorize', params.providerBaseUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/** Only allow same-origin, absolute-path returns so ?returnTo cannot open-redirect. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

export type FetchImpl = typeof fetch;

/**
 * Tries each QuantMail path in order, transparently skipping 404s (the /api
 * prefix exists on the public proxy but not on the internal backend service).
 * Returns the first non-404 response, or the last response if all 404'd.
 */
export async function quantmailFetch(
  paths: string[],
  init: RequestInit,
  fetchImpl: FetchImpl = fetch,
): Promise<Response> {
  const base = serverQuantmailBase();
  let last: Response | null = null;
  for (const path of paths) {
    const res = await fetchImpl(`${base}${path}`, init);
    if (res.status !== 404) return res;
    last = res;
  }
  return last!;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresIn: number;
}

export class SsoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SsoError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** Exchanges an authorization code for tokens (Contract A, back-channel). */
export async function exchangeCodeForTokens(
  args: {
    code: string;
    redirectUri: string;
    clientId: string;
    codeVerifier: string;
    timeoutMs?: number;
  },
  fetchImpl: FetchImpl = fetch,
): Promise<TokenSet> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 10000);
  try {
    const res = await quantmailFetch(
      ['/oauth/token', '/api/oauth/token'],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: args.code,
          redirect_uri: args.redirectUri,
          client_id: args.clientId,
          code_verifier: args.codeVerifier,
        }),
        signal: controller.signal,
      },
      fetchImpl,
    );
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const err = asRecord(body)?.['error'];
      const code = typeof err === 'string' ? err : asRecord(err)?.['code'];
      throw new SsoError(
        typeof code === 'string' ? code : 'TOKEN_EXCHANGE_FAILED',
        'QuantMail did not accept the authorization code.',
      );
    }
    const data = asRecord(body);
    const accessToken = data?.['access_token'] ?? data?.['accessToken'];
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new SsoError('TOKEN_EXCHANGE_FAILED', 'QuantMail returned no access token.');
    }
    const expiresIn = data?.['expires_in'] ?? data?.['expiresIn'];
    return {
      accessToken,
      refreshToken:
        typeof data?.['refresh_token'] === 'string'
          ? (data['refresh_token'] as string)
          : typeof data?.['refreshToken'] === 'string'
            ? (data['refreshToken'] as string)
            : null,
      idToken:
        typeof data?.['id_token'] === 'string'
          ? (data['id_token'] as string)
          : typeof data?.['idToken'] === 'string'
            ? (data['idToken'] as string)
            : null,
      expiresIn: typeof expiresIn === 'number' && expiresIn > 0 ? Math.floor(expiresIn) : 3600,
    };
  } catch (err) {
    if (err instanceof SsoError) throw err;
    throw new SsoError(
      'TOKEN_EXCHANGE_UNAVAILABLE',
      'Could not reach QuantMail to exchange the authorization code.',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface VerifiedUserinfo {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
}

/** Fetches the verified identity for an access token (Contract A, back-channel). */
export async function fetchUserinfo(
  args: { accessToken: string; timeoutMs?: number },
  fetchImpl: FetchImpl = fetch,
): Promise<VerifiedUserinfo> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 10000);
  try {
    const res = await quantmailFetch(
      ['/oauth/userinfo', '/api/oauth/userinfo'],
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${args.accessToken}` },
        signal: controller.signal,
        cache: 'no-store',
      },
      fetchImpl,
    );
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      throw new SsoError('USERINFO_FAILED', 'QuantMail did not verify the access token.');
    }
    const raw = asRecord(body);
    const data = asRecord(raw?.['data']) ?? asRecord(raw?.['user']) ?? raw;
    const id = data?.['id'] ?? data?.['sub'];
    const email = data?.['email'];
    if (typeof id !== 'string' || !id || typeof email !== 'string' || !email.includes('@')) {
      throw new SsoError('USERINFO_FAILED', 'QuantMail returned an incomplete identity.');
    }
    const username = data?.['username'];
    const displayName = data?.['displayName'] ?? data?.['name'];
    return {
      id,
      email,
      username: typeof username === 'string' ? username : null,
      displayName: typeof displayName === 'string' ? displayName : null,
    };
  } catch (err) {
    if (err instanceof SsoError) throw err;
    throw new SsoError('USERINFO_UNAVAILABLE', 'Could not reach QuantMail to verify the session.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface VerifiedTicket {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
}

/**
 * Verifies a Contract-B sso_ticket with QuantMail (single-use, 60s).
 * Returns the verified identity — never trust ticket claims client-side.
 */
export async function verifySsoTicket(
  args: { ticket: string; timeoutMs?: number },
  fetchImpl: FetchImpl = fetch,
): Promise<VerifiedTicket> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 10000);
  try {
    const res = await quantmailFetch(
      ['/oauth/sso-ticket/verify', '/api/oauth/sso-ticket/verify'],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: args.ticket }),
        signal: controller.signal,
      },
      fetchImpl,
    );
    const body = (await res.json().catch(() => null)) as unknown;
    const raw = asRecord(body);
    const ok = raw?.['success'] === true;
    const data = asRecord(raw?.['data']);
    const id = data?.['id'];
    const email = data?.['email'];
    if (!res.ok || !ok || typeof id !== 'string' || !id || typeof email !== 'string' || !email.includes('@')) {
      throw new SsoError('INVALID_SSO_TICKET', 'The QuantMail sign-in ticket was rejected or expired.');
    }
    const username = data?.['username'];
    const displayName = data?.['displayName'];
    return {
      id,
      email,
      username: typeof username === 'string' ? username : null,
      displayName: typeof displayName === 'string' ? displayName : null,
    };
  } catch (err) {
    if (err instanceof SsoError) throw err;
    throw new SsoError('TICKET_VERIFY_UNAVAILABLE', 'Could not reach QuantMail to verify the sign-in ticket.');
  } finally {
    clearTimeout(timeoutId);
  }
}
