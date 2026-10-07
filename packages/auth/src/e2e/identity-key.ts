// ============================================================================
// E2E - Identity Key Service
// Long-term identity keypair per user using Ed25519
// ============================================================================

import * as crypto from 'node:crypto';

export interface IdentityKeyPair {
  publicKey: crypto.KeyObject;
  privateKey: crypto.KeyObject;
}

export interface SerializedIdentityKeyPair {
  publicKey: string;
  privateKey: string;
}

export class IdentityKeyService {
  /**
   * Generate a long-term identity keypair using Ed25519
   */
  generateIdentityKeyPair(): IdentityKeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    return { publicKey, privateKey };
  }

  /**
   * Serialize a public key to base64-encoded DER format
   */
  serializePublicKey(publicKey: crypto.KeyObject): string {
    const der = publicKey.export({ type: 'spki', format: 'der' });
    return Buffer.from(der).toString('base64');
  }

  /**
   * Deserialize a public key from base64-encoded DER format
   */
  deserializePublicKey(serialized: string): crypto.KeyObject {
    const der = Buffer.from(serialized, 'base64');
    return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  }

  /**
   * Serialize a private key to base64-encoded DER format
   */
  serializePrivateKey(privateKey: crypto.KeyObject): string {
    const der = privateKey.export({ type: 'pkcs8', format: 'der' });
    return Buffer.from(der).toString('base64');
  }

  /**
   * Deserialize a private key from base64-encoded DER format
   */
  deserializePrivateKey(serialized: string): crypto.KeyObject {
    const der = Buffer.from(serialized, 'base64');
    return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  }

  /**
   * Serialize the full keypair to base64-encoded DER
   */
  serializeKeyPair(keyPair: IdentityKeyPair): SerializedIdentityKeyPair {
    return {
      publicKey: this.serializePublicKey(keyPair.publicKey),
      privateKey: this.serializePrivateKey(keyPair.privateKey),
    };
  }
}
