// ============================================================================
// Task 2.3 — Unit tests for no-plaintext key storage (KMS-resolvable refs)
// ============================================================================
//
// Validates: Requirement 2.4 — when a domain private key (or other secret) is
// persisted, only a KMS-resolvable REFERENCE is stored; the private key material
// is never persisted in plaintext.
//
// These run against the REAL implementations: `PgpCrypto` (which mints genuine
// RSA private-key PEMs) plus the two `KeyVault` implementations — `InMemoryKeyVault`
// and `SecretVaultKeyVault`. The invariant asserted everywhere is the same: the
// value a domain record would persist (`privateKeyRef`) is a `kms://` reference
// that isKeyRef() accepts and that contains no PEM/private-key material, while
// the vault can still resolve the original material on demand.

import { describe, it, expect } from 'vitest';
import { PgpCrypto } from '../pgp-crypto.js';
import {
  InMemoryKeyVault,
  SecretVaultKeyVault,
  isKeyRef,
  keyRefId,
  KEY_REF_PREFIX,
  type SecretVaultPort,
} from '../key-vault.js';

// RSA-4096 keygen is slow; tests use a smaller (still real) modulus for speed.
const crypto = new PgpCrypto(2048);

/** Assert a persisted reference leaks no private-key material in plaintext. */
function expectNoPlaintext(ref: string): void {
  expect(isKeyRef(ref)).toBe(true);
  expect(ref.startsWith(KEY_REF_PREFIX)).toBe(true);
  expect(ref).not.toContain('-----BEGIN');
  expect(ref).not.toContain('PRIVATE KEY');
}

/** A minimal in-memory SecretVaultPort modelling AWS Secrets Manager / Vault. */
function makeSecretVault(): SecretVaultPort & { dump(): Record<string, string> } {
  const store = new Map<string, string>();
  return {
    async getSecret(key) {
      return store.get(key) ?? null;
    },
    async setSecret(key, value) {
      store.set(key, value);
    },
    async deleteSecret(key) {
      store.delete(key);
    },
    dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

describe('InMemoryKeyVault — persists only references, never plaintext (Req 2.4)', () => {
  it('returns a kms:// reference containing no private-key material', async () => {
    const material = crypto.generateKeyPair('passphrase');
    // Sanity: the real material genuinely is a private-key PEM.
    expect(material.privateKeyPem).toContain('PRIVATE KEY');

    const vault = new InMemoryKeyVault();
    const ref = await vault.store(material.privateKeyPem, { userId: 'user-1' });

    expectNoPlaintext(ref);
    expect(ref).not.toContain(material.privateKeyPem);
  });

  it('resolves the original material back from the reference', async () => {
    const material = crypto.generateKeyPair('passphrase');
    const vault = new InMemoryKeyVault();
    const ref = await vault.store(material.privateKeyPem);

    expect(await vault.resolve(ref)).toBe(material.privateKeyPem);
  });

  it('keeps the simulated persisted domain record free of key material', async () => {
    const material = crypto.generateKeyPair('passphrase');
    const vault = new InMemoryKeyVault();
    const privateKeyRef = await vault.store(material.privateKeyPem, { userId: 'user-1' });

    // Model what a `DomainAuthKey` row would persist to the database.
    const persistedRecord = {
      userId: 'user-1',
      publicKey: material.publicKey,
      privateKeyRef,
      fingerprint: material.fingerprint,
    };

    const serialized = JSON.stringify(persistedRecord);
    expect(serialized).not.toContain('PRIVATE KEY');
    expect(serialized).not.toContain('-----BEGIN PRIVATE KEY-----');
    expect(serialized).not.toContain('-----BEGIN ENCRYPTED PRIVATE KEY-----');
    expectNoPlaintext(persistedRecord.privateKeyRef);
  });

  it('issues a distinct reference per stored secret', async () => {
    const vault = new InMemoryKeyVault();
    const a = crypto.generateKeyPair('p1');
    const b = crypto.generateKeyPair('p2');

    const refA = await vault.store(a.privateKeyPem);
    const refB = await vault.store(b.privateKeyPem);

    expect(refA).not.toBe(refB);
    expect(await vault.resolve(refA)).toBe(a.privateKeyPem);
    expect(await vault.resolve(refB)).toBe(b.privateKeyPem);
  });

  it('returns null for a deleted (revoked) reference', async () => {
    const vault = new InMemoryKeyVault();
    const material = crypto.generateKeyPair('p');
    const ref = await vault.store(material.privateKeyPem);

    await vault.delete(ref);
    expect(await vault.resolve(ref)).toBeNull();
  });
});

describe('SecretVaultKeyVault — references are opaque; material lives only in the vault (Req 2.4)', () => {
  it('returns a kms:// reference and stores material under a namespaced vault key', async () => {
    const material = crypto.generateKeyPair('passphrase');
    const secretVault = makeSecretVault();
    const vault = new SecretVaultKeyVault(secretVault);

    const ref = await vault.store(material.privateKeyPem, { userId: 'user-2' });

    // The persisted reference is opaque — no plaintext key material.
    expectNoPlaintext(ref);

    // The material is held only inside the external secret vault, never in the ref.
    const dumped = secretVault.dump();
    const vaultValues = Object.values(dumped);
    expect(vaultValues).toContain(material.privateKeyPem);
    // ...and the vault key is namespaced (pgp/<id>), not the ref itself.
    expect(Object.keys(dumped)).toContain(`pgp/${keyRefId(ref)}`);
  });

  it('resolves the original material via the reference', async () => {
    const material = crypto.generateKeyPair('passphrase');
    const vault = new SecretVaultKeyVault(makeSecretVault());
    const ref = await vault.store(material.privateKeyPem);

    expect(await vault.resolve(ref)).toBe(material.privateKeyPem);
  });

  it('returns null after the referenced material is deleted', async () => {
    const material = crypto.generateKeyPair('passphrase');
    const vault = new SecretVaultKeyVault(makeSecretVault());
    const ref = await vault.store(material.privateKeyPem);

    await vault.delete(ref);
    expect(await vault.resolve(ref)).toBeNull();
  });
});
