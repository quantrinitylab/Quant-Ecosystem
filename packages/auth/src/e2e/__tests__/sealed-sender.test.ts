import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { SealedSenderService } from '../sealed-sender';
import { IdentityKeyService } from '../identity-key';

describe('SealedSenderService', () => {
  const sealedService = new SealedSenderService();
  const identityService = new IdentityKeyService();

  it('should seal and unseal a message roundtrip', () => {
    const senderIdentity = identityService.generateIdentityKeyPair();
    const recipientDH = crypto.generateKeyPairSync('x25519');

    const plaintext = Buffer.from('Hello, this is a sealed message!');
    const sealed = sealedService.seal(senderIdentity.publicKey, recipientDH.publicKey, plaintext);

    expect(sealed.ciphertext).toBeDefined();
    expect(sealed.ephemeralPublicKey).toBeDefined();

    const unsealed = sealedService.unseal(recipientDH.privateKey, sealed);
    expect(unsealed.plaintext.toString()).toBe('Hello, this is a sealed message!');
    expect(unsealed.senderIdentityPublicKey).toBeDefined();

    // Verify sender identity matches
    const senderPubSerialized = identityService.serializePublicKey(senderIdentity.publicKey);
    expect(unsealed.senderIdentityPublicKey).toBe(senderPubSerialized);
  });

  it('should not reveal sender identity in the sealed payload', () => {
    const senderIdentity = identityService.generateIdentityKeyPair();
    const recipientDH = crypto.generateKeyPairSync('x25519');

    const senderPubDer = senderIdentity.publicKey.export({ type: 'spki', format: 'der' });
    const plaintext = Buffer.from('Secret content');

    const sealed = sealedService.seal(senderIdentity.publicKey, recipientDH.publicKey, plaintext);

    // The ciphertext should not contain the sender's public key bytes
    const ciphertextHex = sealed.ciphertext.toString('hex');
    const senderDerHex = Buffer.from(senderPubDer).toString('hex');
    expect(ciphertextHex).not.toContain(senderDerHex);

    // The ciphertext should not contain the plaintext
    expect(sealed.ciphertext.includes(plaintext)).toBe(false);
  });

  it('should fail to unseal with wrong recipient key', () => {
    const senderIdentity = identityService.generateIdentityKeyPair();
    const recipientDH = crypto.generateKeyPairSync('x25519');
    const wrongRecipient = crypto.generateKeyPairSync('x25519');

    const plaintext = Buffer.from('Secret');
    const sealed = sealedService.seal(senderIdentity.publicKey, recipientDH.publicKey, plaintext);

    expect(() => {
      sealedService.unseal(wrongRecipient.privateKey, sealed);
    }).toThrow();
  });
});
