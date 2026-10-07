// ============================================================================
// QuantMail — OIDC signing key service (asymmetric JWKS provider)
// ============================================================================
//
// QuantMail is the Quant Ecosystem's OpenID Connect provider. Relying parties
// (every other Quant app + third-party clients) verify the `id_token` QuantMail
// issues by fetching the public keys from `/.well-known/jwks.json`. That makes
// the signing key ASYMMETRIC (RS256): QuantMail holds the private key; everyone
// else only ever sees the public JWK.
//
// This service resolves that key with the following precedence:
//   1. `QUANTMAIL_OIDC_PRIVATE_KEY` — a PKCS#8 PEM private key (production).
//      Set the SAME key on every QuantMail instance so a token signed by one
//      instance verifies against the JWKS served by any other (horizontal
//      scaling / rotation are handled by deploying new keys + keeping the prior
//      public JWK in the set during the grace window).
//   2. Otherwise a process-local RS256 keypair is generated once and cached.
//      This keeps a single dev/test process internally consistent, but is NOT
//      multi-instance safe — a warning is logged so this never silently ships.
//
// The `kid` is the RFC 7638 JWK thumbprint of the public key (or the explicit
// `QUANTMAIL_OIDC_KID`), so it is stable for a given key and rotates with it.

import * as jose from 'jose';

const ALG = 'RS256';

export interface OidcSigningKey {
  privateKey: jose.CryptoKey;
  publicKey: jose.CryptoKey;
  kid: string;
}

export interface IdTokenClaims {
  /** Subject — the authenticated user's id. */
  sub: string;
  /** Audience — the OAuth client_id the token is minted for. */
  aud: string;
  /** Authorized party (== aud for a single-audience token). */
  azp?: string;
  /** Nonce echoed back from the authorization request, when supplied. */
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  /** Seconds since epoch of the end-user authentication event. */
  auth_time?: number;
}

/**
 * Lazily-resolved, process-wide OIDC signing key. A module singleton so the
 * dev-fallback keypair (and the parsed env key) are computed at most once.
 */
export class OidcKeyService {
  private keyPromise: Promise<OidcSigningKey> | null = null;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly logger: { warn: (msg: string) => void } = console,
  ) {}

  /** Resolve (and cache) the signing key per the precedence documented above. */
  async getSigningKey(): Promise<OidcSigningKey> {
    if (!this.keyPromise) {
      this.keyPromise = this.resolveSigningKey();
    }
    return this.keyPromise;
  }

  private async resolveSigningKey(): Promise<OidcSigningKey> {
    const pem = this.env['QUANTMAIL_OIDC_PRIVATE_KEY'];
    if (pem && pem.trim().length > 0) {
      const privateKey = await jose.importPKCS8(pem, ALG, { extractable: false });
      const publicKey = await this.derivePublicKey(pem);
      const kid = this.env['QUANTMAIL_OIDC_KID'] ?? (await this.thumbprint(publicKey));
      return { privateKey, publicKey, kid };
    }

    // Dev/test fallback: a single ephemeral keypair for this process only.
    this.logger.warn(
      '[quantmail:oidc] QUANTMAIL_OIDC_PRIVATE_KEY is not set — generating an ' +
        'EPHEMERAL RS256 keypair. Tokens will not verify across restarts or ' +
        'multiple instances. Set QUANTMAIL_OIDC_PRIVATE_KEY (PKCS#8 PEM) in production.',
    );
    const { privateKey, publicKey } = await jose.generateKeyPair(ALG, { extractable: true });
    const kid = this.env['QUANTMAIL_OIDC_KID'] ?? (await this.thumbprint(publicKey));
    return { privateKey, publicKey, kid };
  }

  /**
   * Derive the public key from a PKCS#8 private PEM. We re-import as a signing
   * key (extractable) and export its public JWK so `exportJWK` can run, then
   * re-import that JWK as a verification CryptoKey.
   */
  private async derivePublicKey(pem: string): Promise<jose.CryptoKey> {
    const extractablePrivate = await jose.importPKCS8(pem, ALG, { extractable: true });
    const fullJwk = await jose.exportJWK(extractablePrivate);
    // Strip private fields, keep only the public RSA parameters.
    const publicJwk: jose.JWK = { kty: fullJwk.kty, n: fullJwk.n, e: fullJwk.e };
    return (await jose.importJWK(publicJwk, ALG)) as jose.CryptoKey;
  }

  private async thumbprint(publicKey: jose.CryptoKey): Promise<string> {
    const jwk = await jose.exportJWK(publicKey);
    return jose.calculateJwkThumbprint(jwk, 'sha256');
  }

  /**
   * The public JWKS served at `/.well-known/jwks.json`. Returns the active
   * public key with its `kid`, `use: 'sig'`, and `alg: 'RS256'` so relying
   * parties can select and verify against it.
   */
  async getPublicJwks(): Promise<jose.JSONWebKeySet> {
    const { publicKey, kid } = await this.getSigningKey();
    const jwk = await jose.exportJWK(publicKey);
    return {
      keys: [{ ...jwk, kid, use: 'sig', alg: ALG }],
    };
  }

  /**
   * Mint an OIDC `id_token` (RS256) signed by the active key. The token carries
   * the standard OIDC claims and is verifiable by any party using the published
   * JWKS.
   */
  async signIdToken(
    claims: IdTokenClaims,
    options: { issuer: string; expiresInSeconds: number },
  ): Promise<string> {
    const { privateKey, kid } = await this.getSigningKey();
    const { sub, aud, azp, nonce, ...rest } = claims;

    const jwt = new jose.SignJWT({ ...rest, ...(azp ? { azp } : {}), ...(nonce ? { nonce } : {}) })
      .setProtectedHeader({ alg: ALG, kid, typ: 'JWT' })
      .setIssuedAt()
      .setIssuer(options.issuer)
      .setSubject(sub)
      .setAudience(aud)
      .setExpirationTime(`${options.expiresInSeconds}s`);

    return jwt.sign(privateKey);
  }
}

/** Process-wide singleton — see class docs for the key-resolution precedence. */
export const oidcKeyService = new OidcKeyService();
