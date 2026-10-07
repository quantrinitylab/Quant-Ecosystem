import { describe, it, expect } from 'vitest';
import { PasswordService } from '../crypto/password';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('should hash a password with argon2id', async () => {
    const hash = await service.hash('MySecurePassword123!');
    expect(hash).toBeDefined();
    expect(hash).toContain('$argon2id$');
  });

  it('should verify a correct password', async () => {
    const password = 'CorrectHorse42!';
    const hash = await service.hash(password);
    const result = await service.verify(hash, password);
    expect(result).toBe(true);
  });

  it('should reject a wrong password', async () => {
    const hash = await service.hash('RightPassword');
    const result = await service.verify(hash, 'WrongPassword');
    expect(result).toBe(false);
  });

  it('should produce different hashes for the same password', async () => {
    const password = 'SamePassword123';
    const hash1 = await service.hash(password);
    const hash2 = await service.hash(password);
    expect(hash1).not.toBe(hash2);

    // Both should still verify
    expect(await service.verify(hash1, password)).toBe(true);
    expect(await service.verify(hash2, password)).toBe(true);
  });

  it('should produce different hashes for different passwords', async () => {
    const hash1 = await service.hash('Password1');
    const hash2 = await service.hash('Password2');
    expect(hash1).not.toBe(hash2);
  });

  it('should report needsRehash correctly', async () => {
    const hash = await service.hash('TestPassword');
    // A freshly created hash should not need rehashing
    const needs = service.needsRehash(hash);
    expect(needs).toBe(false);
  });
});
