import { describe, it, expect } from 'vitest';
import { SignalSession } from '../signal-session';
import { IdentityKeyService } from '../identity-key';
import { PreKeyBundleService } from '../prekey-bundle';

describe('SignalSession', () => {
  const identityService = new IdentityKeyService();
  const preKeyService = new PreKeyBundleService();

  it('should complete Alice->Bob->Alice round-trip', () => {
    // Setup Bob's identity and bundle
    const bobIdentity = identityService.generateIdentityKeyPair();
    const bobSignedPreKey = preKeyService.generateSignedPreKey(bobIdentity);
    const bobOneTimePreKeys = preKeyService.generateOneTimePreKeys(3);
    const bobBundle = preKeyService.createBundle(bobIdentity, bobSignedPreKey, bobOneTimePreKeys);

    // Alice creates session and initiates
    const aliceIdentity = identityService.generateIdentityKeyPair();
    const aliceSession = new SignalSession();
    const initiatorMessage = aliceSession.initializeAsInitiator(aliceIdentity, bobBundle);

    expect(initiatorMessage.identityPublicKey).toBeDefined();
    expect(initiatorMessage.ephemeralPublicKey).toBeDefined();

    // Bob receives and sets up his session
    const bobSession = new SignalSession();
    const bobOTPK = bobOneTimePreKeys.length > 0 ? bobOneTimePreKeys[0]!.keyPair : null;
    bobSession.initializeAsResponder(
      bobIdentity,
      bobSignedPreKey.keyPair,
      bobOTPK,
      initiatorMessage,
    );

    // Alice sends a message to Bob
    const aliceMessage = Buffer.from('Hello Bob, this is Alice!');
    const encrypted = aliceSession.ratchetEncrypt(aliceMessage);

    expect(encrypted.ciphertext).not.toEqual(aliceMessage);
    expect(encrypted.header).toBeDefined();

    // Bob decrypts Alice's message
    const decrypted = bobSession.ratchetDecrypt(
      encrypted.header,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.authTag,
    );
    expect(decrypted.toString()).toBe('Hello Bob, this is Alice!');

    // Bob sends a reply to Alice
    const bobMessage = Buffer.from('Hello Alice, this is Bob!');
    const bobEncrypted = bobSession.ratchetEncrypt(bobMessage);

    expect(bobEncrypted.ciphertext).not.toEqual(bobMessage);

    // Alice decrypts Bob's reply
    const aliceDecrypted = aliceSession.ratchetDecrypt(
      bobEncrypted.header,
      bobEncrypted.ciphertext,
      bobEncrypted.nonce,
      bobEncrypted.authTag,
    );
    expect(aliceDecrypted.toString()).toBe('Hello Alice, this is Bob!');
  });

  it('should produce ciphertext different from plaintext', () => {
    const bobIdentity = identityService.generateIdentityKeyPair();
    const bobSignedPreKey = preKeyService.generateSignedPreKey(bobIdentity);
    const bobOneTimePreKeys = preKeyService.generateOneTimePreKeys(1);
    const bobBundle = preKeyService.createBundle(bobIdentity, bobSignedPreKey, bobOneTimePreKeys);

    const aliceIdentity = identityService.generateIdentityKeyPair();
    const aliceSession = new SignalSession();
    aliceSession.initializeAsInitiator(aliceIdentity, bobBundle);

    const plaintext = Buffer.from('secret message content');
    const encrypted = aliceSession.ratchetEncrypt(plaintext);

    // Ciphertext must not contain the plaintext
    expect(encrypted.ciphertext.includes(plaintext)).toBe(false);
  });

  it('should encrypt the same message differently each time', () => {
    const bobIdentity = identityService.generateIdentityKeyPair();
    const bobSignedPreKey = preKeyService.generateSignedPreKey(bobIdentity);
    const bobOneTimePreKeys = preKeyService.generateOneTimePreKeys(1);
    const bobBundle = preKeyService.createBundle(bobIdentity, bobSignedPreKey, bobOneTimePreKeys);

    const aliceIdentity = identityService.generateIdentityKeyPair();
    const aliceSession = new SignalSession();
    aliceSession.initializeAsInitiator(aliceIdentity, bobBundle);

    const plaintext = Buffer.from('same message');
    const enc1 = aliceSession.ratchetEncrypt(plaintext);
    const enc2 = aliceSession.ratchetEncrypt(plaintext);

    expect(enc1.ciphertext.equals(enc2.ciphertext)).toBe(false);
  });
});
