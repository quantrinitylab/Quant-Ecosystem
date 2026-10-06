// ============================================================================
// Quanty agent — Gmail OAuth flow
// ============================================================================
//
// PURPOSE
//   Connects a user's REAL Gmail account to Quanty. Flow:
//
//     1. User clicks "Connect Gmail" in the Quanty popup.
//     2. Backend: GET /api/quanty/gmail/connect  -> 302 to Google's consent
//        screen (scopes below). A signed, short-lived `state` binds the flow
//        to the Quanty userId (CSRF protection).
//     3. Google redirects to GET /api/quanty/gmail/callback?code=...&state=...
//     4. Backend exchanges the code for tokens, encrypts the refresh token,
//        stores it userId-scoped, and redirects the user back to the app with
//        a success flag.
//     5. Every Gmail tool call: token store returns a fresh access token,
//        refreshing automatically when expired.
//
// SCOPES (least privilege)
//   - gmail.readonly : search + read (gmail_search, gmail_read)
//   - gmail.send     : send (gmail_send — destructive, needs confirmation)
//   - gmail.modify   : archive/trash via label changes (gmail_archive)
//
// SECURITY
//   * Client secret comes ONLY from env (never committed, never logged).
//   * Refresh tokens are encrypted at rest (AES-256-GCM via the injected
//     TokenCipher; the prototype ships an env-key cipher).
//   * Access tokens live only in memory, refreshed on demand.
//   * NOTHING token-shaped is ever written to logs (see sanitize()).

import { createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** e.g. https://quantmail.in/api/quanty/gmail/callback */
  redirectUri: string;
  /** HMAC key for signing `state` (from env, 32+ bytes). */
  stateSecret: string;
  /** Key for refresh-token encryption (from env, 32 bytes). */
  encryptionKey: string;
}

export interface GmailTokens {
  accessToken: string;
  /** Milliseconds since epoch when the access token expires. */
  accessTokenExpiresAt: number;
  /** Encrypted refresh token (opaque to callers). */
  encryptedRefreshToken: string;
  scope: string;
  /** Google account email the grant belongs to. */
  accountEmail?: string;
}

/** What the token store persists (refresh token already encrypted). */
export interface StoredGmailGrant {
  userId: string;
  encryptedRefreshToken: string;
  scope: string;
  accountEmail?: string;
  connectedAt: string;
  lastRefreshedAt?: string;
}

/** Storage seam — production uses Prisma, prototype can use memory. */
export interface GmailGrantStore {
  save(grant: StoredGmailGrant): Promise<void>;
  get(userId: string): Promise<StoredGmailGrant | null>;
  delete(userId: string): Promise<void>;
}

/** In-memory grant store (dev/test only — production must use Prisma). */
export class InMemoryGmailGrantStore implements GmailGrantStore {
  private grants = new Map<string, StoredGmailGrant>();
  async save(grant: StoredGmailGrant): Promise<void> {
    this.grants.set(grant.userId, grant);
  }
  async get(userId: string): Promise<StoredGmailGrant | null> {
    return this.grants.get(userId) ?? null;
  }
  async delete(userId: string): Promise<void> {
    this.grants.delete(userId);
  }
}

// ---------------------------------------------------------------------------
// Token cipher (AES-256-GCM, env key)
// ---------------------------------------------------------------------------

export interface TokenCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/** AES-256-GCM cipher keyed by a 32-byte env secret. Format: iv:authTag:data (hex). */
export class EnvKeyTokenCipher implements TokenCipher {
  private readonly key: Buffer;

  constructor(hexOrUtf8Key: string) {
    // Accept 64-hex-char or raw 32-byte utf8.
    this.key = /^[0-9a-fA-F]{64}$/.test(hexOrUtf8Key)
      ? Buffer.from(hexOrUtf8Key, 'hex')
      : Buffer.from(hexOrUtf8Key.padEnd(32, '0').slice(0, 32), 'utf8');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${data.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, tagHex, dataHex] = ciphertext.split(':');
    if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed encrypted token');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }
}

// ---------------------------------------------------------------------------
// OAuth flow
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

export interface GmailOAuthDeps {
  config: GmailOAuthConfig;
  grantStore: GmailGrantStore;
  cipher: TokenCipher;
  fetchImpl?: typeof fetch;
}

export class GmailOAuth {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: GmailOAuthDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  /**
   * Step 1 — build the Google consent URL. The `state` param is
   * HMAC-signed and binds the flow to this Quanty userId (10-min expiry).
   */
  getAuthorizationUrl(userId: string): string {
    const { clientId, redirectUri, stateSecret } = this.deps.config;
    const state = this.signState(userId, stateSecret);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPES.join(' '),
      access_type: 'offline', // get a refresh token
      prompt: 'consent', // force refresh token on re-connect
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Step 2 — handle the OAuth callback. Validates `state`, exchanges the
   * code, encrypts + stores the refresh token. Returns the connected
   * Google account email (safe to show the user).
   */
  async handleCallback(code: string, state: string): Promise<{ userId: string; accountEmail?: string }> {
    const userId = this.verifyState(state, this.deps.config.stateSecret);
    const { clientId, clientSecret, redirectUri } = this.deps.config;

    const tokenRes = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenRes.ok) {
      // Never include client_secret or the code in the error.
      throw new Error(`Token exchange failed (HTTP ${tokenRes.status})`);
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };
    if (!tokens.refresh_token) {
      throw new Error('Google did not return a refresh token (re-connect with consent)');
    }

    const accountEmail = await this.fetchAccountEmail(tokens.access_token).catch(() => undefined);

    await this.deps.grantStore.save({
      userId,
      encryptedRefreshToken: this.deps.cipher.encrypt(tokens.refresh_token),
      scope: tokens.scope ?? GMAIL_SCOPES.join(' '),
      accountEmail,
      connectedAt: new Date().toISOString(),
    });

    // Cache the fresh access token in memory for subsequent calls.
    this.accessTokenCache.set(userId, {
      token: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000 - 60_000, // 60s skew
    });

    return { userId, accountEmail };
  }

  /**
   * Step 3 — resolve a fresh access token for a user, refreshing when
   * needed. This is what GmailRestTransport's getAccessToken calls.
   * Returns null when the user has not connected Gmail.
   */
  async getAccessToken(userId: string): Promise<string | null> {
    const cached = this.accessTokenCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const grant = await this.deps.grantStore.get(userId);
    if (!grant) return null;

    const refreshToken = this.deps.cipher.decrypt(grant.encryptedRefreshToken);
    const { clientId, clientSecret } = this.deps.config;
    const res = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        // Refresh token revoked/expired — user must reconnect.
        await this.deps.grantStore.delete(userId);
        this.accessTokenCache.delete(userId);
        return null;
      }
      throw new Error(`Token refresh failed (HTTP ${res.status})`);
    }
    const tokens = (await res.json()) as { access_token: string; expires_in: number };
    this.accessTokenCache.set(userId, {
      token: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000 - 60_000,
    });
    await this.deps.grantStore.save({ ...grant, lastRefreshedAt: new Date().toISOString() });
    return tokens.access_token;
  }

  /** Disconnect: drop the grant (and any cached access token). */
  async disconnect(userId: string): Promise<void> {
    await this.deps.grantStore.delete(userId);
    this.accessTokenCache.delete(userId);
  }

  /** True when the user has a stored Gmail grant. */
  async isConnected(userId: string): Promise<boolean> {
    return (await this.deps.grantStore.get(userId)) !== null;
  }

  // -- internal -------------------------------------------------------------

  private readonly accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

  private signState(userId: string, secret: string): string {
    const exp = Date.now() + 10 * 60_000;
    const payload = `${userId}.${exp}`;
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    return Buffer.from(`${payload}.${sig}`).toString('base64url');
  }

  private verifyState(state: string, secret: string): string {
    let decoded: string;
    try {
      decoded = Buffer.from(state, 'base64url').toString('utf8');
    } catch {
      throw new Error('Invalid OAuth state');
    }
    const [userId, expStr, sig] = decoded.split('.');
    if (!userId || !expStr || !sig) throw new Error('Invalid OAuth state');
    const expected = createHmac('sha256', secret).update(`${userId}.${expStr}`).digest('hex');
    if (sig !== expected) throw new Error('Invalid OAuth state signature');
    if (Number(expStr) < Date.now()) throw new Error('OAuth state expired');
    return userId;
  }

  private async fetchAccountEmail(accessToken: string): Promise<string | undefined> {
    const res = await this.fetchImpl(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const info = (await res.json()) as { email?: string };
    return info.email;
  }
}

/**
 * Build GmailOAuthConfig from env. Throws a clear error when required vars
 * are missing (fail closed — no Gmail tools without OAuth configured).
 */
export function gmailOAuthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GmailOAuthConfig {
  const clientId = env.GMAIL_OAUTH_CLIENT_ID ?? '';
  const clientSecret = env.GMAIL_OAUTH_CLIENT_SECRET ?? '';
  const redirectUri = env.GMAIL_OAUTH_REDIRECT_URI ?? '';
  const stateSecret = env.GMAIL_OAUTH_STATE_SECRET ?? '';
  const encryptionKey = env.GMAIL_TOKEN_ENCRYPTION_KEY ?? '';
  const missing = [
    ['GMAIL_OAUTH_CLIENT_ID', clientId],
    ['GMAIL_OAUTH_CLIENT_SECRET', clientSecret],
    ['GMAIL_OAUTH_REDIRECT_URI', redirectUri],
    ['GMAIL_OAUTH_STATE_SECRET', stateSecret],
    ['GMAIL_TOKEN_ENCRYPTION_KEY', encryptionKey],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Gmail OAuth not configured — missing env: ${missing.join(', ')}`);
  }
  return { clientId, clientSecret, redirectUri, stateSecret, encryptionKey };
}
