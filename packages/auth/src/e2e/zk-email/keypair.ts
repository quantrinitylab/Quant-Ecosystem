// ============================================================================
// ZK Email - OpenPGP KeyPair Service
// Client-side keypair generation using the openpgp library
// ============================================================================

import * as openpgp from 'openpgp';

export interface GeneratedKeyPair {
  publicKey: openpgp.Key;
  privateKey: openpgp.PrivateKey;
}

export class ZKEmailKeyPairService {
  /**
   * Generate a new OpenPGP keypair for the given identity.
   */
  async generateKeyPair(
    name: string,
    email: string,
    passphrase: string,
  ): Promise<GeneratedKeyPair> {
    const { privateKey: armoredPrivate, publicKey: armoredPublic } = await openpgp.generateKey({
      type: 'curve25519',
      userIDs: [{ name, email }],
      passphrase,
      format: 'armored',
    });

    const publicKey = await openpgp.readKey({ armoredKey: armoredPublic });
    const encryptedPrivateKey = await openpgp.readPrivateKey({ armoredKey: armoredPrivate });
    // Decrypt the private key so it can be used directly for encryption/decryption
    const privateKey = await openpgp.decryptKey({
      privateKey: encryptedPrivateKey,
      passphrase,
    });

    return { publicKey, privateKey };
  }

  /**
   * Export a public key to armored string format.
   */
  async exportPublicKey(key: openpgp.Key): Promise<string> {
    return key.armor();
  }

  /**
   * Export a private key to armored string format (encrypted with passphrase).
   */
  async exportPrivateKey(key: openpgp.PrivateKey, passphrase: string): Promise<string> {
    const encrypted = await openpgp.encryptKey({
      privateKey: key,
      passphrase,
    });
    return encrypted.armor();
  }

  /**
   * Import a public key from armored string format.
   */
  async importPublicKey(armored: string): Promise<openpgp.Key> {
    return openpgp.readKey({ armoredKey: armored });
  }

  /**
   * Import a private key from armored string format (decrypted with passphrase).
   */
  async importPrivateKey(armored: string, passphrase: string): Promise<openpgp.PrivateKey> {
    const encryptedKey = await openpgp.readPrivateKey({ armoredKey: armored });
    const decryptedKey = await openpgp.decryptKey({
      privateKey: encryptedKey,
      passphrase,
    });
    return decryptedKey;
  }
}
