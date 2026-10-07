import { describe, expect, it } from 'vitest';
import { createKeyExchange } from '../key-exchange.js';

describe('KeyExchange', () => {
  it('creates with a local identity key', () => {
    const exchange = createKeyExchange();
    expect(exchange.getLocalIdentityKey()).toBeTruthy();
    expect(exchange.getRegistrationId()).toBeGreaterThan(0);
  });

  it('accepts custom identity key', () => {
    const exchange = createKeyExchange('my-identity-key');
    expect(exchange.getLocalIdentityKey()).toBe('my-identity-key');
  });

  it('generates pre-key bundles (X3DH)', () => {
    const exchange = createKeyExchange();
    const bundle = exchange.generatePreKeyBundle();

    expect(bundle.identityKey).toBe(exchange.getLocalIdentityKey());
    expect(bundle.signedPreKey).toBeTruthy();
    expect(bundle.signedPreKeySignature).toBeTruthy();
    expect(bundle.oneTimePreKey).toBeTruthy();
    expect(bundle.registrationId).toBe(exchange.getRegistrationId());
  });

  it('establishes sessions using X3DH protocol', () => {
    const alice = createKeyExchange();
    const bob = createKeyExchange();

    const bobBundle = bob.generatePreKeyBundle();
    const session = alice.establishSession(bobBundle);

    expect(session.established).toBe(true);
    expect(session.establishedAt).toBeInstanceOf(Date);
    expect(session.remoteIdentityKey).toBe(bob.getLocalIdentityKey());
    expect(session.localIdentityKey).toBe(alice.getLocalIdentityKey());
    expect(session.messageCount).toBe(0);
  });

  it('retrieves sessions by ID', () => {
    const alice = createKeyExchange();
    const bob = createKeyExchange();

    const bobBundle = bob.generatePreKeyBundle();
    const session = alice.establishSession(bobBundle);

    const retrieved = alice.getSession(session.sessionId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.sessionId).toBe(session.sessionId);
  });

  it('retrieves sessions by remote identity', () => {
    const alice = createKeyExchange();
    const bob = createKeyExchange();

    const bobBundle = bob.generatePreKeyBundle();
    alice.establishSession(bobBundle);

    const found = alice.getSessionForIdentity(bob.getLocalIdentityKey());
    expect(found).not.toBeNull();
    expect(found!.remoteIdentityKey).toBe(bob.getLocalIdentityKey());
  });

  it('advances ratchet on send', () => {
    const alice = createKeyExchange();
    const bob = createKeyExchange();

    const bobBundle = bob.generatePreKeyBundle();
    const session = alice.establishSession(bobBundle);

    const ratchet = alice.advanceRatchet(session.sessionId);
    expect(ratchet).not.toBeNull();
    expect(ratchet!.sendCounter).toBe(1);

    const ratchet2 = alice.advanceRatchet(session.sessionId);
    expect(ratchet2!.sendCounter).toBe(2);
  });

  it('advances ratchet on receive', () => {
    const alice = createKeyExchange();
    const bob = createKeyExchange();

    const bobBundle = bob.generatePreKeyBundle();
    const session = alice.establishSession(bobBundle);

    const ratchet = alice.receiveRatchet(session.sessionId);
    expect(ratchet).not.toBeNull();
    expect(ratchet!.receiveCounter).toBe(1);
  });

  it('closes sessions', () => {
    const alice = createKeyExchange();
    const bob = createKeyExchange();

    const bobBundle = bob.generatePreKeyBundle();
    const session = alice.establishSession(bobBundle);

    expect(alice.closeSession(session.sessionId)).toBe(true);
    expect(alice.getSession(session.sessionId)).toBeNull();
  });

  it('lists all sessions', () => {
    const alice = createKeyExchange();
    const bob = createKeyExchange();
    const carol = createKeyExchange();

    alice.establishSession(bob.generatePreKeyBundle());
    alice.establishSession(carol.generatePreKeyBundle());

    expect(alice.getAllSessions()).toHaveLength(2);
  });

  it('verifies identity', () => {
    const exchange = createKeyExchange();
    const result = exchange.verifyIdentity('remote-key', 'ABCD:1234');
    expect(result).toBe(true);
  });
});
