import { describe, it, expect, beforeEach } from 'vitest';
import { SecretManager, InMemoryVaultAdapter } from './secret-manager';

describe('SecretManager', () => {
  let manager: SecretManager;
  let adapter: InMemoryVaultAdapter;

  beforeEach(() => {
    adapter = new InMemoryVaultAdapter();
    manager = new SecretManager(adapter, 'test-actor');
  });

  describe('getSecret', () => {
    it('should retrieve a secret from the vault', async () => {
      await adapter.set('db-password', 'secret123');
      const result = await manager.getSecret('db-password');
      expect(result).toBe('secret123');
    });

    it('should return null for non-existent secrets', async () => {
      const result = await manager.getSecret('non-existent');
      expect(result).toBeNull();
    });

    it('should log the access', async () => {
      await manager.getSecret('api-key');
      const logs = manager.auditAccess('api-key');
      expect(logs.length).toBe(1);
      expect(logs[0]!.action).toBe('read');
      expect(logs[0]!.actor).toBe('test-actor');
    });
  });

  describe('rotateSecret', () => {
    it('should update the secret value', async () => {
      await adapter.set('token', 'old-value');
      await manager.rotateSecret('token', 'new-value');
      const result = await manager.getSecret('token');
      expect(result).toBe('new-value');
    });

    it('should log the rotation', async () => {
      await manager.rotateSecret('key', 'value');
      const logs = manager.auditAccess('key');
      expect(logs.some((l) => l.action === 'rotate')).toBe(true);
    });
  });

  describe('auditAccess', () => {
    it('should return all access logs when no key specified', async () => {
      await manager.getSecret('key1');
      await manager.getSecret('key2');
      const allLogs = manager.auditAccess();
      expect(allLogs.length).toBe(2);
    });

    it('should filter by key when specified', async () => {
      await manager.getSecret('key1');
      await manager.getSecret('key2');
      const filtered = manager.auditAccess('key1');
      expect(filtered.length).toBe(1);
      expect(filtered[0]!.key).toBe('key1');
    });
  });

  describe('validateNoSecretsInEnv', () => {
    it('should detect leaked passwords in env vars', () => {
      const result = manager.validateNoSecretsInEnv({
        DB_PASSWORD: 'password=mysecret123',
      });
      expect(result.clean).toBe(false);
      expect(result.leaks.length).toBeGreaterThan(0);
    });

    it('should detect AWS access keys', () => {
      const result = manager.validateNoSecretsInEnv({
        AWS_KEY: 'aws_access_key_id=AKIAIOSFODNN7EXAMPLE',
      });
      expect(result.clean).toBe(false);
    });

    it('should detect GitHub tokens', () => {
      const result = manager.validateNoSecretsInEnv({
        GH_TOKEN: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh',
      });
      expect(result.clean).toBe(false);
    });

    it('should pass for clean env vars', () => {
      const result = manager.validateNoSecretsInEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        HOST: '0.0.0.0',
      });
      expect(result.clean).toBe(true);
      expect(result.leaks.length).toBe(0);
    });

    it('should detect private keys', () => {
      const result = manager.validateNoSecretsInEnv({
        CERT: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
      });
      expect(result.clean).toBe(false);
    });
  });

  describe('deleteSecret', () => {
    it('should remove the secret from the vault', async () => {
      await adapter.set('temp-key', 'temp-value');
      await manager.deleteSecret('temp-key');
      const result = await manager.getSecret('temp-key');
      expect(result).toBeNull();
    });
  });

  describe('listSecrets', () => {
    it('should list all secret keys', async () => {
      await adapter.set('key1', 'val1');
      await adapter.set('key2', 'val2');
      const keys = await manager.listSecrets();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });
  });
});
