import { describe, it, expect } from 'vitest';
import { computeSafetyNumber } from '../safety-numbers';
import { IdentityKeyService } from '../identity-key';

describe('computeSafetyNumber', () => {
  const identityService = new IdentityKeyService();

  it('should return a 60-digit numeric fingerprint', () => {
    const alice = identityService.generateIdentityKeyPair();
    const bob = identityService.generateIdentityKeyPair();

    const fingerprint = computeSafetyNumber(alice.publicKey, bob.publicKey);
    expect(fingerprint).toMatch(/^\d{60}$/);
    expect(fingerprint.length).toBe(60);

    // Verify all 2-digit groups are valid (00-99)
    for (let i = 0; i < 60; i += 2) {
      const group = parseInt(fingerprint.slice(i, i + 2), 10);
      expect(group).toBeGreaterThanOrEqual(0);
      expect(group).toBeLessThanOrEqual(99);
    }
  });

  it('should produce the same fingerprint regardless of order', () => {
    const alice = identityService.generateIdentityKeyPair();
    const bob = identityService.generateIdentityKeyPair();

    const fp1 = computeSafetyNumber(alice.publicKey, bob.publicKey);
    const fp2 = computeSafetyNumber(bob.publicKey, alice.publicKey);
    expect(fp1).toBe(fp2);
  });

  it('should produce different fingerprints for different users', () => {
    const alice = identityService.generateIdentityKeyPair();
    const bob = identityService.generateIdentityKeyPair();
    const charlie = identityService.generateIdentityKeyPair();

    const fpAliceBob = computeSafetyNumber(alice.publicKey, bob.publicKey);
    const fpAliceCharlie = computeSafetyNumber(alice.publicKey, charlie.publicKey);
    expect(fpAliceBob).not.toBe(fpAliceCharlie);
  });

  it('should be deterministic for the same keys', () => {
    const alice = identityService.generateIdentityKeyPair();
    const bob = identityService.generateIdentityKeyPair();

    const fp1 = computeSafetyNumber(alice.publicKey, bob.publicKey);
    const fp2 = computeSafetyNumber(alice.publicKey, bob.publicKey);
    expect(fp1).toBe(fp2);
  });
});
