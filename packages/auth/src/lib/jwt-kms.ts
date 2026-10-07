// ============================================================================
// Auth - JWT KMS key resolution (runtime-resolved, rotatable signing keys)
// ============================================================================
//
// Requirement 2.1: signing/verifying a JWT must resolve the JWT_Secret from the
// KMS at runtime rather than from a hardcoded or static literal value.
// Requirement 2.2: when a signing key is rotated, tokens issued under the
// previous key keep verifying until they expire, while new tokens are signed
// with the rotated key.
//
// The TokenService depends only on the `JwtKms` interface below so a real
// deployment can inject a KMS-backed implementation (e.g. `VaultJwtKms`
// wrapping the @quant/security SecretManager / @quant/encryption vault, which in
// turn fronts AWS Secrets Manager or HashiCorp Vault). Tests and local dev use
// the env/config-backed default. No signing secret is ever captured as a static
// literal: every sign/verify call resolves the current key material at runtime.

import { createHash } from 'node:crypto';

/** The two independent key namespaces, preserving the access/refresh split. */
export type JwtKeyPurpose = 'access' | 'refresh';

/** A single versioned key: its `kid` (embedded in the JWT header) + material. */
export interface JwtKeyVersion {
  /** Stable, non-reversible key identifier embedded in the JWT `kid` header. */
  kid: string;
  /** Raw signing/verification key material. */
  secret: Uint8Array;
}

/**
 * Minimal KMS port for runtime resolution of JWT signing keys.
 *
 * Implementations resolve key material lazily (per call) so rotation takes
 * effect without re-instantiating the TokenService.
 */
export interface JwtKms {
  /** Resolve the active key used to SIGN new tokens for a purpose. */
  getActiveKey(purpose: JwtKeyPurpose): Promise<JwtKeyVersion>;
  /**
   * Resolve a key by id for VERIFICATION. Returns the active key, a still-valid
   * previous key (rotation grace window), or null if the kid is unknown/retired.
   */
  getKeyById(purpose: JwtKeyPurpose, kid: string): Promise<JwtKeyVersion | null>;
  /**
   * All currently-valid keys for a purpose (active first, then previous), used
   * to verify legacy tokens that carry no `kid` header.
   */
  getVerificationKeys(purpose: JwtKeyPurpose): Promise<JwtKeyVersion[]>;
}

const encoder = new TextEncoder();

/** Derive a deterministic, non-reversible key id from raw secret material. */
export function deriveKid(purpose: JwtKeyPurpose, secret: string): string {
  const digest = createHash('sha256').update(`${purpose}:${secret}`).digest('hex');
  return `${purpose}-${digest.slice(0, 16)}`;
}

function toKeyVersion(purpose: JwtKeyPurpose, secret: string): JwtKeyVersion {
  return { kid: deriveKid(purpose, secret), secret: encoder.encode(secret) };
}

export interface EnvConfigJwtKmsOptions {
  /** Active access secret (typically resolved from AuthConfig at app startup). */
  accessSecret?: string;
  /** Active refresh secret (typically resolved from AuthConfig at app startup). */
  refreshSecret?: string;
  /** Override the env source (defaults to process.env); enables testing rotation. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Default KMS provider that resolves JWT key material at runtime from the
 * provided active secrets (config) with environment-variable fallbacks.
 *
 * Rotation: the previous key is supplied via the `JWT_SECRET_PREVIOUS` /
 * `JWT_REFRESH_SECRET_PREVIOUS` environment variables. A token signed under the
 * previous key keeps verifying (it carries the previous `kid`) until it expires,
 * while new tokens are signed with the rotated active key.
 */
export class EnvConfigJwtKms implements JwtKms {
  private readonly accessActive?: string;
  private readonly refreshActive?: string;
  private readonly envSource?: NodeJS.ProcessEnv;

  constructor(options: EnvConfigJwtKmsOptions = {}) {
    this.accessActive = options.accessSecret;
    this.refreshActive = options.refreshSecret;
    this.envSource = options.env;
  }

  private get env(): NodeJS.ProcessEnv {
    return this.envSource ?? process.env;
  }

  private resolveActiveSecret(purpose: JwtKeyPurpose): string {
    const env = this.env;
    if (purpose === 'access') {
      // Config-provided active secret wins; env is a runtime fallback.
      return this.accessActive ?? env.JWT_SECRET ?? '';
    }
    // Refresh falls back to the access key to preserve historical behavior
    // (the legacy TokenService signed both tokens with a single secret).
    return (
      this.refreshActive ??
      env.JWT_REFRESH_SECRET ??
      this.accessActive ??
      env.JWT_SECRET ??
      ''
    );
  }

  private resolvePreviousSecret(purpose: JwtKeyPurpose): string | undefined {
    const env = this.env;
    const value =
      purpose === 'access' ? env.JWT_SECRET_PREVIOUS : env.JWT_REFRESH_SECRET_PREVIOUS;
    return value && value.length > 0 ? value : undefined;
  }

  async getActiveKey(purpose: JwtKeyPurpose): Promise<JwtKeyVersion> {
    return toKeyVersion(purpose, this.resolveActiveSecret(purpose));
  }

  async getVerificationKeys(purpose: JwtKeyPurpose): Promise<JwtKeyVersion[]> {
    const keys = [toKeyVersion(purpose, this.resolveActiveSecret(purpose))];
    const previous = this.resolvePreviousSecret(purpose);
    if (previous !== undefined) {
      keys.push(toKeyVersion(purpose, previous));
    }
    return keys;
  }

  async getKeyById(purpose: JwtKeyPurpose, kid: string): Promise<JwtKeyVersion | null> {
    const keys = await this.getVerificationKeys(purpose);
    return keys.find((k) => k.kid === kid) ?? null;
  }
}

/**
 * Structural port for a KMS / secret vault. Matches the shape of the
 * @quant/security `SecretManager` (`getSecret`), so a production deployment can
 * inject one without @quant/auth taking a hard dependency on it.
 */
export interface SecretVaultPort {
  getSecret(key: string): Promise<string | null>;
}

/**
 * KMS-backed provider that resolves versioned JWT keys from a secret vault
 * (e.g. the @quant/security SecretManager fronting AWS Secrets Manager / Vault).
 *
 * Vault layout per purpose:
 *   jwt/<purpose>/active   - the current signing key
 *   jwt/<purpose>/previous - the prior key, valid until its tokens expire
 */
export class VaultJwtKms implements JwtKms {
  constructor(private readonly vault: SecretVaultPort) {}

  async getActiveKey(purpose: JwtKeyPurpose): Promise<JwtKeyVersion> {
    const secret = await this.vault.getSecret(`jwt/${purpose}/active`);
    if (!secret) {
      throw new Error(`KMS is missing the active JWT key for purpose '${purpose}'`);
    }
    return toKeyVersion(purpose, secret);
  }

  async getVerificationKeys(purpose: JwtKeyPurpose): Promise<JwtKeyVersion[]> {
    const keys: JwtKeyVersion[] = [];
    const active = await this.vault.getSecret(`jwt/${purpose}/active`);
    if (active) {
      keys.push(toKeyVersion(purpose, active));
    }
    const previous = await this.vault.getSecret(`jwt/${purpose}/previous`);
    if (previous) {
      keys.push(toKeyVersion(purpose, previous));
    }
    return keys;
  }

  async getKeyById(purpose: JwtKeyPurpose, kid: string): Promise<JwtKeyVersion | null> {
    const keys = await this.getVerificationKeys(purpose);
    return keys.find((k) => k.kid === kid) ?? null;
  }
}
