import { describe, expect, it } from 'vitest';
import { EncryptedKeyVault } from '../encrypted-key-vault.js';

describe('EncryptedKeyVault', () => {
  it('stores and retrieves a key with real encryption', () => {
    const vault = new EncryptedKeyVault();
    const originalKey = 'sk-test-abc123xyz789';

    vault.storeKey('user-1', 'openai', originalKey);
    const retrieved = vault.retrieveKey('user-1', 'openai');

    expect(retrieved).toBe(originalKey);
  });

  it('encrypts the stored value (encrypted differs from plaintext)', () => {
    const vault = new EncryptedKeyVault();
    const originalKey = 'sk-live-secret-key-value';

    const entry = vault.storeKey('user-1', 'openai', originalKey);

    expect(entry.encryptedKey).not.toBe(originalKey);
    expect(entry.encryptedKey).toContain(':');
    expect(entry.iv).toBeTruthy();
    expect(entry.algorithm).toBe('aes-256-gcm');
  });

  it('lists keys without exposing the encrypted value', () => {
    const vault = new EncryptedKeyVault();
    vault.storeKey('user-1', 'openai', 'sk-openai-key');
    vault.storeKey('user-1', 'anthropic', 'sk-anthropic-key');

    const keys = vault.listKeys('user-1');

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toHaveProperty('encryptedKey');
    expect(keys[1]).not.toHaveProperty('encryptedKey');
    expect(keys[0]!.provider).toBe('openai');
    expect(keys[1]!.provider).toBe('anthropic');
  });

  it('deletes a key successfully', () => {
    const vault = new EncryptedKeyVault();
    vault.storeKey('user-1', 'openai', 'sk-key-to-delete');

    const result = vault.deleteKey('user-1', 'openai');
    expect(result).toBe(true);
    expect(vault.listKeys('user-1')).toHaveLength(0);
  });

  it('rotates a key and retrieves the new value', () => {
    const vault = new EncryptedKeyVault();
    vault.storeKey('user-1', 'openai', 'sk-old-key');

    const newEntry = vault.rotateKey('user-1', 'openai', 'sk-new-key');
    const retrieved = vault.retrieveKey('user-1', 'openai');

    expect(retrieved).toBe('sk-new-key');
    expect(newEntry.provider).toBe('openai');
  });

  it('throws when retrieving a non-existent key', () => {
    const vault = new EncryptedKeyVault();

    expect(() => vault.retrieveKey('user-1', 'openai')).toThrow('No keys found for user');
  });

  it('throws when retrieving from unknown provider', () => {
    const vault = new EncryptedKeyVault();
    vault.storeKey('user-1', 'openai', 'sk-key');

    expect(() => vault.retrieveKey('user-1', 'anthropic')).toThrow(
      'No key found for provider: anthropic',
    );
  });

  it('returns false when deleting a non-existent key', () => {
    const vault = new EncryptedKeyVault();

    expect(vault.deleteKey('user-1', 'openai')).toBe(false);
  });

  it('overwrites existing provider key on re-store', () => {
    const vault = new EncryptedKeyVault();
    vault.storeKey('user-1', 'openai', 'sk-first');
    vault.storeKey('user-1', 'openai', 'sk-second');

    const retrieved = vault.retrieveKey('user-1', 'openai');
    expect(retrieved).toBe('sk-second');
    expect(vault.listKeys('user-1')).toHaveLength(1);
  });

  it('isolates keys between users', () => {
    const vault = new EncryptedKeyVault();
    vault.storeKey('user-1', 'openai', 'sk-user1-key');
    vault.storeKey('user-2', 'openai', 'sk-user2-key');

    expect(vault.retrieveKey('user-1', 'openai')).toBe('sk-user1-key');
    expect(vault.retrieveKey('user-2', 'openai')).toBe('sk-user2-key');
  });
});
