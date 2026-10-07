import { describe, it, expect } from 'vitest';
import { EncryptedBackupService } from '../encrypted-backup';

describe('EncryptedBackupService', () => {
  const backupService = new EncryptedBackupService();

  it('should create and restore a backup with correct passphrase', async () => {
    const passphrase = 'my-secure-passphrase-2024!';
    const data = Buffer.from('important keys and chat history data');

    const backup = await backupService.createBackup(passphrase, data);

    expect(backup.salt).toBeDefined();
    expect(backup.nonce).toBeDefined();
    expect(backup.ciphertext).toBeDefined();
    expect(backup.authTag).toBeDefined();
    expect(backup.version).toBe(1);

    const restored = await backupService.restoreBackup(passphrase, backup);
    expect(restored.toString()).toBe('important keys and chat history data');
  });

  it('should fail to restore with wrong passphrase', async () => {
    const data = Buffer.from('secret data');
    const backup = await backupService.createBackup('correct-passphrase', data);

    await expect(backupService.restoreBackup('wrong-passphrase', backup)).rejects.toThrow();
  });

  it('should produce different ciphertext for same data with different passphrases', async () => {
    const data = Buffer.from('same data');
    const backup1 = await backupService.createBackup('passphrase-1', data);
    const backup2 = await backupService.createBackup('passphrase-2', data);

    expect(backup1.ciphertext).not.toBe(backup2.ciphertext);
    expect(backup1.salt).not.toBe(backup2.salt);
  });

  it('should include all required backup fields', async () => {
    const data = Buffer.from('data to backup');
    const backup = await backupService.createBackup('passphrase', data);

    // Verify base64 encoding
    expect(() => Buffer.from(backup.salt, 'base64')).not.toThrow();
    expect(() => Buffer.from(backup.nonce, 'base64')).not.toThrow();
    expect(() => Buffer.from(backup.ciphertext, 'base64')).not.toThrow();
    expect(() => Buffer.from(backup.authTag, 'base64')).not.toThrow();

    // Verify sizes
    expect(Buffer.from(backup.salt, 'base64').length).toBe(16);
    expect(Buffer.from(backup.nonce, 'base64').length).toBe(12);
    expect(Buffer.from(backup.authTag, 'base64').length).toBe(16);
  });
});
