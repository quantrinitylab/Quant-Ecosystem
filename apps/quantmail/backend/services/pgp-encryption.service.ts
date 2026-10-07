import { z } from 'zod';
import {
  PgpCrypto,
  InMemoryKeyVault,
  isKeyRef,
  type KeyVault,
  type KeyRef,
} from '@quant/encryption';

export const KeyPairSchema = z.object({
  userId: z.string(),
  publicKey: z.string(),
  /**
   * KMS-resolvable reference to the (passphrase-encrypted) private key. The raw
   * private key material is NEVER stored here in plaintext (Requirement 2.4 /
   * design `DomainAuthKey.privateKeyRef`); it lives only in the KeyVault and is
   * resolved at crypto time.
   */
  privateKeyRef: z.string(),
  fingerprint: z.string(),
  createdAt: z.number(),
  algorithm: z.string(),
});

export type KeyPair = z.infer<typeof KeyPairSchema>;

/**
 * PGP-style email encryption service backed by REAL asymmetric cryptography.
 *
 * All signing/encryption is routed through `@quant/encryption`'s `PgpCrypto`
 * (RSA-4096 + RSA-OAEP + AES-256-GCM + RSA-SHA256) — there is no longer any
 * reachable `@simulated` crypto path (Requirement 2.3). Private keys are
 * persisted only as KMS-resolvable references via a `KeyVault`; the service
 * never holds private key material in plaintext (Requirements 2.4, 2.5).
 */
export class PGPEncryptionService {
  private keys: Map<string, KeyPair> = new Map();
  private readonly crypto: PgpCrypto;
  private readonly vault: KeyVault;

  constructor(options?: { crypto?: PgpCrypto; vault?: KeyVault }) {
    this.crypto = options?.crypto ?? new PgpCrypto();
    this.vault = options?.vault ?? new InMemoryKeyVault();
  }


  /**
   * Generate a real RSA keypair. The passphrase-encrypted private key is stored
   * in the KeyVault and only its KMS reference is retained/returned.
   */
  async generateKeyPair(userId: string, passphrase: string): Promise<KeyPair> {
    const material = this.crypto.generateKeyPair(passphrase);
    const privateKeyRef = await this.vault.store(material.privateKeyPem, {
      userId,
      fingerprint: material.fingerprint,
    });

    const keyPair: KeyPair = {
      userId,
      publicKey: material.publicKey,
      privateKeyRef,
      fingerprint: material.fingerprint,
      createdAt: Date.now(),
      algorithm: material.algorithm,
    };

    this.keys.set(userId, keyPair);
    return keyPair;
  }

  /** Encrypt a message to a recipient's PUBLIC key (real RSA-OAEP + AES-GCM). */
  async encrypt(message: string, recipientPublicKey: string): Promise<string> {
    return this.crypto.encrypt(message, recipientPublicKey);
  }

  /**
   * Decrypt a message. `privateKey` is a KMS reference (resolved via the vault);
   * a raw PEM is accepted only as a fallback for direct callers/tests.
   */
  async decrypt(
    encryptedMessage: string,
    privateKey: string,
    passphrase: string,
  ): Promise<string> {
    const pem = await this.resolvePrivateKey(privateKey);
    return this.crypto.decrypt(encryptedMessage, pem, passphrase);
  }

  /** Produce a real RSA-SHA256 signature using the KMS-resolved private key. */
  async signMessage(message: string, privateKey: string, passphrase: string): Promise<string> {
    const pem = await this.resolvePrivateKey(privateKey);
    return this.crypto.signMessage(message, pem, passphrase);
  }

  /** Verify a signature against the message AND the signer's public key. */
  async verifySignature(
    message: string,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    return this.crypto.verifySignature(message, signature, publicKey);
  }

  /**
   * Resolve private key material from its KMS reference. Throws if a reference
   * cannot be resolved, so a missing/revoked key fails closed rather than
   * silently degrading. A non-reference value is treated as a raw PEM.
   */
  private async resolvePrivateKey(privateKeyOrRef: string): Promise<string> {
    if (isKeyRef(privateKeyOrRef)) {
      const pem = await this.vault.resolve(privateKeyOrRef as KeyRef);
      if (!pem) {
        throw new Error('Private key reference could not be resolved from the KMS');
      }
      return pem;
    }
    return privateKeyOrRef;
  }
}
