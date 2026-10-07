// ============================================================================
// @quant/encryption — KMS key vault (KMS-resolvable references, never plaintext)
// ============================================================================
//
// Requirement 2.4: when a domain private key or other secret is persisted, the
// SuperHub stores ONLY a KMS-resolvable reference and never the private key
// material in plaintext.
// Requirement 2.5: when PGP email encryption or an E2EE route performs a
// cryptographic operation, the real key material is resolved via the KMS.
//
// This mirrors the `JwtKms` / `SecretVaultPort` port pattern introduced for the
// TokenService in @quant/auth (Task 2.1): consumers depend only on the
// `KeyVault` interface so a real deployment can inject a vault-backed
// implementation (e.g. one fronting AWS Secrets Manager / HashiCorp Vault),
// while tests and local dev use the in-memory default. A `KeyRef` returned by
// `store` is an opaque locator — it contains no key material and cannot be
// reversed back into the secret.

import { randomUUID } from 'node:crypto';

/** Opaque, KMS-resolvable reference to stored secret material (no key bytes). */
export type KeyRef = string;

/** Reference scheme prefix; distinguishes a vault locator from raw key material. */
export const KEY_REF_PREFIX = 'kms://';

/** True when `value` is a vault reference rather than inlined key material. */
export function isKeyRef(value: string): boolean {
  return typeof value === 'string' && value.startsWith(KEY_REF_PREFIX);
}

/** Build a reference locator from a vault entry id. */
export function toKeyRef(id: string): KeyRef {
  return `${KEY_REF_PREFIX}${id}`;
}

/** Extract the vault entry id from a reference locator. */
export function keyRefId(ref: KeyRef): string {
  return ref.startsWith(KEY_REF_PREFIX) ? ref.slice(KEY_REF_PREFIX.length) : ref;
}

export interface KeyVaultMetadata {
  [key: string]: string;
}

/**
 * Minimal KMS / secret-vault port for storing private key material behind an
 * opaque reference. Implementations resolve material lazily so rotation /
 * revocation take effect without re-instantiating the caller.
 */
export interface KeyVault {
  /** Persist secret material, returning a KMS-resolvable reference to it. */
  store(material: string, metadata?: KeyVaultMetadata): Promise<KeyRef>;
  /** Resolve previously stored material by reference; null if unknown/revoked. */
  resolve(ref: KeyRef): Promise<string | null>;
  /** Permanently remove the referenced material (e.g. on key revocation). */
  delete(ref: KeyRef): Promise<void>;
}

/**
 * Default in-memory {@link KeyVault} for local dev and tests. Holds material in
 * process memory keyed by a random id and never writes it back through the
 * caller — callers persist only the returned `KeyRef`.
 */
export class InMemoryKeyVault implements KeyVault {
  private readonly entries = new Map<string, string>();

  async store(material: string, _metadata?: KeyVaultMetadata): Promise<KeyRef> {
    const id = randomUUID();
    this.entries.set(id, material);
    return toKeyRef(id);
  }

  async resolve(ref: KeyRef): Promise<string | null> {
    return this.entries.get(keyRefId(ref)) ?? null;
  }

  async delete(ref: KeyRef): Promise<void> {
    this.entries.delete(keyRefId(ref));
  }

  /** Release all held material (test cleanup / shutdown). */
  clear(): void {
    this.entries.clear();
  }
}

/**
 * Structural port for a KMS / secret vault. Matches the shape of the
 * @quant/security `SecretManager` so a production deployment can inject one
 * without @quant/encryption taking a hard dependency on it.
 */
export interface SecretVaultPort {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret?(key: string): Promise<void>;
}

/**
 * KMS-backed {@link KeyVault} that persists private key material in an external
 * secret vault (e.g. the @quant/security SecretManager fronting AWS Secrets
 * Manager / HashiCorp Vault). The reference is `kms://<id>`; the underlying
 * vault key is namespaced under `pgp/<id>` so material never lands in
 * application storage in plaintext.
 */
export class SecretVaultKeyVault implements KeyVault {
  constructor(
    private readonly vault: SecretVaultPort,
    private readonly namespace = 'pgp',
  ) {}

  private vaultKey(ref: KeyRef): string {
    return `${this.namespace}/${keyRefId(ref)}`;
  }

  async store(material: string, _metadata?: KeyVaultMetadata): Promise<KeyRef> {
    const ref = toKeyRef(randomUUID());
    await this.vault.setSecret(this.vaultKey(ref), material);
    return ref;
  }

  async resolve(ref: KeyRef): Promise<string | null> {
    return this.vault.getSecret(this.vaultKey(ref));
  }

  async delete(ref: KeyRef): Promise<void> {
    await this.vault.deleteSecret?.(this.vaultKey(ref));
  }
}
