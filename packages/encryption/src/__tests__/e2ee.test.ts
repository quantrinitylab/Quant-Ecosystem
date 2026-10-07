import { describe, expect, it } from 'vitest';
import { createE2EEManager } from '../e2ee.js';

describe('E2EEManager', () => {
  it('creates manager with encryption enabled by default', () => {
    const manager = createE2EEManager();
    expect(manager.isEnabled()).toBe(true);
    expect(manager.getConfig().defaultOn).toBe(true);
  });

  it('is zero-knowledge by default', () => {
    const manager = createE2EEManager();
    expect(manager.isZeroKnowledge()).toBe(true);
  });

  it('encryption is default-on and cannot be disabled', () => {
    const manager = createE2EEManager({ enabled: false, defaultOn: false });
    expect(manager.isEnabled()).toBe(true);
    expect(manager.getConfig().defaultOn).toBe(true);
  });

  it('generates key pairs', () => {
    const manager = createE2EEManager();
    const keyPair = manager.generateKeyPair();

    expect(keyPair.publicKey).toBeTruthy();
    expect(keyPair.privateKey).toBeTruthy();
    expect(keyPair.algorithm).toBe('aes-256-gcm');
    expect(keyPair.fingerprint).toBeTruthy();
    expect(keyPair.createdAt).toBeInstanceOf(Date);
  });

  it('generates key pairs with specific algorithm', () => {
    const manager = createE2EEManager();
    const keyPair = manager.generateKeyPair('chacha20-poly1305');
    expect(keyPair.algorithm).toBe('chacha20-poly1305');
  });

  it('initializes identity key pair', () => {
    const manager = createE2EEManager();
    expect(manager.getIdentityKeyPair()).toBeNull();

    const keyPair = manager.initializeIdentity();
    expect(manager.getIdentityKeyPair()).toEqual(keyPair);
  });

  it('registers and manages device keys', () => {
    const manager = createE2EEManager();
    const device = manager.registerDevice('device-1', 'MacBook Pro');

    expect(device.deviceId).toBe('device-1');
    expect(device.deviceName).toBe('MacBook Pro');
    expect(device.trusted).toBe(true);
    expect(device.keyPair).toBeTruthy();

    const devices = manager.getDeviceKeys();
    expect(devices).toHaveLength(1);
  });

  it('revokes device keys', () => {
    const manager = createE2EEManager();
    manager.registerDevice('device-1', 'Phone');

    const revoked = manager.revokeDevice('device-1');
    expect(revoked).toBe(true);
    expect(manager.getDeviceKeys()).toHaveLength(0);
  });

  it('trusts and untrusts devices', () => {
    const manager = createE2EEManager();
    manager.registerDevice('device-1', 'Tablet');

    manager.untrustDevice('device-1');
    expect(manager.getDeviceKey('device-1')!.trusted).toBe(false);

    manager.trustDevice('device-1');
    expect(manager.getDeviceKey('device-1')!.trusted).toBe(true);
  });

  it('encrypts and decrypts messages', () => {
    const manager = createE2EEManager();
    const senderKey = manager.generateKeyPair();
    const recipientKey = manager.generateKeyPair();

    const payload = manager.encrypt('Hello, World!', senderKey, recipientKey);
    expect(payload.ciphertext).toBeTruthy();
    expect(payload.nonce).toBeTruthy();
    expect(payload.tag).toBeTruthy();
    expect(payload.senderFingerprint).toBe(senderKey.fingerprint);
    expect(payload.recipientFingerprint).toBe(recipientKey.fingerprint);

    const decrypted = manager.decrypt(payload, recipientKey);
    expect(decrypted).toBe('Hello, World!');
  });

  it('rotates device keys', () => {
    const manager = createE2EEManager();
    const device = manager.registerDevice('device-1', 'Phone');
    const originalFingerprint = device.keyPair.fingerprint;

    const rotated = manager.rotateKey('device-1');
    expect(rotated).not.toBeNull();
    expect(rotated!.keyPair.fingerprint).not.toBe(originalFingerprint);
  });

  it('checks if key needs rotation', () => {
    const manager = createE2EEManager();
    const keyPair = manager.generateKeyPair();

    expect(manager.needsRotation(keyPair)).toBe(false);

    const expiredKey = { ...keyPair, expiresAt: new Date(Date.now() - 1000) };
    expect(manager.needsRotation(expiredKey)).toBe(true);
  });

  it('checks expiry notification', () => {
    const manager = createE2EEManager();
    const soonExpiring = manager.generateKeyPair();
    soonExpiring.expiresAt = new Date(Date.now() + 3 * 86400000);

    expect(manager.shouldNotifyExpiry(soonExpiring)).toBe(true);
  });

  it('encrypts at rest by default', () => {
    const manager = createE2EEManager();
    expect(manager.getConfig().encryptAtRest).toBe(true);
    expect(manager.getConfig().encryptInTransit).toBe(true);
  });

  it('cleans up on destroy', () => {
    const manager = createE2EEManager();
    manager.initializeIdentity();
    manager.registerDevice('d-1', 'Phone');

    manager.destroy();
    expect(manager.getIdentityKeyPair()).toBeNull();
    expect(manager.getDeviceKeys()).toHaveLength(0);
  });
});
