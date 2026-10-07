import { describe, it, expect, beforeEach } from 'vitest';
import { E2EEManager, createE2EEManager } from '../e2ee.js';
import { createKeyExchange } from '../key-exchange.js';

describe('E2EEManager - Extended Coverage', () => {
  let manager: E2EEManager;

  beforeEach(() => {
    manager = createE2EEManager();
  });

  describe('configuration', () => {
    it('returns a copy of config (not a reference)', () => {
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    it('uses custom algorithm when provided', () => {
      const custom = createE2EEManager({ algorithm: 'xchacha20-poly1305' });
      expect(custom.getConfig().algorithm).toBe('xchacha20-poly1305');
    });

    it('uses custom rotation policy', () => {
      const custom = createE2EEManager({
        keyRotationPolicy: {
          enabled: false,
          intervalDays: 60,
          maxKeyAge: 120,
          autoRotate: false,
          notifyBeforeExpiry: false,
          notifyDays: 14,
        },
      });
      const policy = custom.getRotationPolicy();
      expect(policy.enabled).toBe(false);
      expect(policy.intervalDays).toBe(60);
      expect(policy.autoRotate).toBe(false);
    });
  });

  describe('key pair generation', () => {
    it('generates unique key pairs each time', () => {
      const kp1 = manager.generateKeyPair();
      const kp2 = manager.generateKeyPair();
      expect(kp1.publicKey).not.toBe(kp2.publicKey);
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
      expect(kp1.fingerprint).not.toBe(kp2.fingerprint);
    });

    it('sets expiresAt when rotation is enabled', () => {
      const kp = manager.generateKeyPair();
      expect(kp.expiresAt).toBeInstanceOf(Date);
      expect(kp.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('sets expiresAt to null when rotation is disabled', () => {
      const custom = createE2EEManager({
        keyRotationPolicy: {
          enabled: false,
          intervalDays: 30,
          maxKeyAge: 90,
          autoRotate: false,
          notifyBeforeExpiry: false,
          notifyDays: 7,
        },
      });
      const kp = custom.generateKeyPair();
      expect(kp.expiresAt).toBeNull();
    });

    it('generates key pair with all supported algorithms', () => {
      const algos = ['aes-256-gcm', 'chacha20-poly1305', 'xchacha20-poly1305'] as const;
      for (const algo of algos) {
        const kp = manager.generateKeyPair(algo);
        expect(kp.algorithm).toBe(algo);
      }
    });
  });

  describe('identity management', () => {
    it('returns null before initialization', () => {
      const fresh = createE2EEManager();
      expect(fresh.getIdentityKeyPair()).toBeNull();
    });

    it('initializeIdentity sets and returns identity', () => {
      const kp = manager.initializeIdentity();
      expect(kp).toBeDefined();
      expect(manager.getIdentityKeyPair()).toBe(kp);
    });

    it('re-initializing replaces identity', () => {
      const kp1 = manager.initializeIdentity();
      const kp2 = manager.initializeIdentity();
      expect(kp1).not.toBe(kp2);
      expect(manager.getIdentityKeyPair()).toBe(kp2);
    });
  });

  describe('device management', () => {
    it('registers multiple devices', () => {
      manager.registerDevice('d1', 'Phone');
      manager.registerDevice('d2', 'Laptop');
      manager.registerDevice('d3', 'Tablet');
      expect(manager.getDeviceKeys()).toHaveLength(3);
    });

    it('getDeviceKey returns null for unknown device', () => {
      expect(manager.getDeviceKey('unknown')).toBeNull();
    });

    it('revokeDevice returns false for unknown device', () => {
      expect(manager.revokeDevice('unknown')).toBe(false);
    });

    it('trustDevice returns false for unknown device', () => {
      expect(manager.trustDevice('unknown')).toBe(false);
    });

    it('untrustDevice returns false for unknown device', () => {
      expect(manager.untrustDevice('unknown')).toBe(false);
    });

    it('registered device is trusted by default', () => {
      const device = manager.registerDevice('d1', 'Phone');
      expect(device.trusted).toBe(true);
      expect(device.registeredAt).toBeInstanceOf(Date);
      expect(device.lastActive).toBeInstanceOf(Date);
    });
  });

  describe('encrypt/decrypt', () => {
    it('encrypts and decrypts empty string', () => {
      const sender = manager.generateKeyPair();
      const recipient = manager.generateKeyPair();
      const payload = manager.encrypt('', sender, recipient);
      const decrypted = manager.decrypt(payload, recipient);
      expect(decrypted).toBe('');
    });

    it('encrypts and decrypts unicode text', () => {
      const sender = manager.generateKeyPair();
      const recipient = manager.generateKeyPair();
      const text = 'Hello 🌍 مرحبا 你好';
      const payload = manager.encrypt(text, sender, recipient);
      const decrypted = manager.decrypt(payload, recipient);
      expect(decrypted).toBe(text);
    });

    it('encrypts and decrypts long text', () => {
      const sender = manager.generateKeyPair();
      const recipient = manager.generateKeyPair();
      const text = 'a'.repeat(10000);
      const payload = manager.encrypt(text, sender, recipient);
      const decrypted = manager.decrypt(payload, recipient);
      expect(decrypted).toBe(text);
    });

    it('payload has correct metadata', () => {
      const sender = manager.generateKeyPair();
      const recipient = manager.generateKeyPair();
      const payload = manager.encrypt('test', sender, recipient);

      expect(payload.algorithm).toBe('aes-256-gcm');
      expect(payload.version).toBe(1);
      expect(payload.timestamp).toBeInstanceOf(Date);
      expect(payload.nonce).toMatch(/^nonce-/);
      expect(payload.tag).toMatch(/^tag-/);
    });
  });

  describe('key rotation', () => {
    it('rotateKey returns null for unknown device', () => {
      expect(manager.rotateKey('unknown')).toBeNull();
    });

    it('rotateKey updates lastActive', () => {
      const device = manager.registerDevice('d1', 'Phone');
      const originalTime = device.lastActive.getTime();
      const rotated = manager.rotateKey('d1');
      expect(rotated!.lastActive.getTime()).toBeGreaterThanOrEqual(originalTime);
    });

    it('needsRotation returns false when policy disabled', () => {
      const custom = createE2EEManager({
        keyRotationPolicy: {
          enabled: false,
          intervalDays: 30,
          maxKeyAge: 90,
          autoRotate: false,
          notifyBeforeExpiry: true,
          notifyDays: 7,
        },
      });
      const kp = custom.generateKeyPair();
      expect(custom.needsRotation(kp)).toBe(false);
    });

    it('needsRotation returns false when no expiresAt', () => {
      const kp = manager.generateKeyPair();
      kp.expiresAt = null;
      expect(manager.needsRotation(kp)).toBe(false);
    });

    it('shouldNotifyExpiry returns false when notification disabled', () => {
      const custom = createE2EEManager({
        keyRotationPolicy: {
          enabled: true,
          intervalDays: 30,
          maxKeyAge: 90,
          autoRotate: true,
          notifyBeforeExpiry: false,
          notifyDays: 7,
        },
      });
      const kp = custom.generateKeyPair();
      kp.expiresAt = new Date(Date.now() + 86400000);
      expect(custom.shouldNotifyExpiry(kp)).toBe(false);
    });

    it('shouldNotifyExpiry returns false when no expiresAt', () => {
      const kp = manager.generateKeyPair();
      kp.expiresAt = null;
      expect(manager.shouldNotifyExpiry(kp)).toBe(false);
    });

    it('shouldNotifyExpiry returns false for far future expiry', () => {
      const kp = manager.generateKeyPair();
      kp.expiresAt = new Date(Date.now() + 30 * 86400000);
      expect(manager.shouldNotifyExpiry(kp)).toBe(false);
    });
  });

  describe('getRotationPolicy', () => {
    it('returns a copy of the policy', () => {
      const p1 = manager.getRotationPolicy();
      const p2 = manager.getRotationPolicy();
      expect(p1).toEqual(p2);
      expect(p1).not.toBe(p2);
    });
  });

  describe('destroy', () => {
    it('clears all state', () => {
      manager.initializeIdentity();
      manager.registerDevice('d1', 'Phone');
      manager.registerDevice('d2', 'Laptop');

      manager.destroy();

      expect(manager.getIdentityKeyPair()).toBeNull();
      expect(manager.getDeviceKeys()).toHaveLength(0);
    });

    it('can be called multiple times safely', () => {
      manager.destroy();
      manager.destroy();
      expect(manager.getDeviceKeys()).toHaveLength(0);
    });
  });
});

describe('KeyExchange - Extended Coverage', () => {
  describe('construction', () => {
    it('generates unique identity keys by default', () => {
      const a = createKeyExchange();
      const b = createKeyExchange();
      expect(a.getLocalIdentityKey()).not.toBe(b.getLocalIdentityKey());
    });

    it('registration IDs are within range', () => {
      const exchange = createKeyExchange();
      expect(exchange.getRegistrationId()).toBeGreaterThanOrEqual(0);
      expect(exchange.getRegistrationId()).toBeLessThan(16384);
    });
  });

  describe('pre-key bundles', () => {
    it('generates unique bundles each time', () => {
      const exchange = createKeyExchange();
      const b1 = exchange.generatePreKeyBundle();
      const b2 = exchange.generatePreKeyBundle();
      expect(b1.signedPreKey).not.toBe(b2.signedPreKey);
      expect(b1.oneTimePreKey).not.toBe(b2.oneTimePreKey);
    });

    it('bundle identity key matches local identity', () => {
      const exchange = createKeyExchange('my-key');
      const bundle = exchange.generatePreKeyBundle();
      expect(bundle.identityKey).toBe('my-key');
    });
  });

  describe('session management', () => {
    it('getSession returns null for unknown ID', () => {
      const exchange = createKeyExchange();
      expect(exchange.getSession('unknown')).toBeNull();
    });

    it('getSessionForIdentity returns null for unknown identity', () => {
      const exchange = createKeyExchange();
      expect(exchange.getSessionForIdentity('unknown')).toBeNull();
    });

    it('getAllSessions returns empty array initially', () => {
      const exchange = createKeyExchange();
      expect(exchange.getAllSessions()).toEqual([]);
    });

    it('sessions have correct initial state', () => {
      const alice = createKeyExchange();
      const bob = createKeyExchange();
      const session = alice.establishSession(bob.generatePreKeyBundle());

      expect(session.ratchetState.sendCounter).toBe(0);
      expect(session.ratchetState.receiveCounter).toBe(0);
      expect(session.ratchetState.previousSendCounter).toBe(0);
      expect(session.ratchetState.rootKey).toMatch(/^root-/);
      expect(session.ratchetState.sendingChainKey).toMatch(/^send-/);
      expect(session.ratchetState.receivingChainKey).toMatch(/^recv-/);
    });
  });

  describe('ratchet operations', () => {
    it('advanceRatchet returns null for unknown session', () => {
      const exchange = createKeyExchange();
      expect(exchange.advanceRatchet('unknown')).toBeNull();
    });

    it('receiveRatchet returns null for unknown session', () => {
      const exchange = createKeyExchange();
      expect(exchange.receiveRatchet('unknown')).toBeNull();
    });

    it('advanceRatchet increments message count', () => {
      const alice = createKeyExchange();
      const bob = createKeyExchange();
      const session = alice.establishSession(bob.generatePreKeyBundle());

      alice.advanceRatchet(session.sessionId);
      alice.advanceRatchet(session.sessionId);
      alice.advanceRatchet(session.sessionId);

      const updated = alice.getSession(session.sessionId);
      expect(updated!.messageCount).toBe(3);
    });

    it('receiveRatchet increments message count', () => {
      const alice = createKeyExchange();
      const bob = createKeyExchange();
      const session = alice.establishSession(bob.generatePreKeyBundle());

      alice.receiveRatchet(session.sessionId);
      alice.receiveRatchet(session.sessionId);

      const updated = alice.getSession(session.sessionId);
      expect(updated!.messageCount).toBe(2);
    });

    it('ratchet generates new chain keys on each advance', () => {
      const alice = createKeyExchange();
      const bob = createKeyExchange();
      const session = alice.establishSession(bob.generatePreKeyBundle());

      const r1 = alice.advanceRatchet(session.sessionId);
      const r2 = alice.advanceRatchet(session.sessionId);
      expect(r1!.sendingChainKey).not.toBe(r2!.sendingChainKey);
    });
  });

  describe('closeSession', () => {
    it('returns false for unknown session', () => {
      const exchange = createKeyExchange();
      expect(exchange.closeSession('unknown')).toBe(false);
    });

    it('removes session from all sessions list', () => {
      const alice = createKeyExchange();
      const bob = createKeyExchange();
      const session = alice.establishSession(bob.generatePreKeyBundle());

      expect(alice.getAllSessions()).toHaveLength(1);
      alice.closeSession(session.sessionId);
      expect(alice.getAllSessions()).toHaveLength(0);
    });
  });

  describe('verifyIdentity', () => {
    it('returns false for empty identity key', () => {
      const exchange = createKeyExchange();
      expect(exchange.verifyIdentity('', 'fingerprint')).toBe(false);
    });

    it('returns false for empty fingerprint', () => {
      const exchange = createKeyExchange();
      expect(exchange.verifyIdentity('key', '')).toBe(false);
    });
  });
});
