import { describe, it, expect } from 'vitest';
import { APIKeyManager } from './api-key-manager';

describe('APIKeyManager (real SHA-256 key hashing)', () => {
  it('generates a key whose stored hash is a 64-char SHA-256 hex digest', async () => {
    const mgr = new APIKeyManager();
    const apiKey = await mgr.generateKey('ci', 'user-1', [{ resource: '*', actions: ['*'] }]);
    expect(apiKey.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('validateKey succeeds for the issued key (deterministic hash → stable lookup)', async () => {
    const mgr = new APIKeyManager();
    const apiKey = await mgr.generateKey('svc', 'user-1', [
      { resource: 'orders', actions: ['read'] },
    ]);

    const ok = await mgr.validateKey(apiKey.key, { resource: 'orders', action: 'read' });
    expect(ok.valid).toBe(true);
    expect(ok.key?.id).toBe(apiKey.id);

    // Same key validated again must hash identically and resolve to the same entry.
    const again = await mgr.validateKey(apiKey.key);
    expect(again.valid).toBe(true);
    expect(again.key?.id).toBe(apiKey.id);
  });

  it('rejects unknown and revoked keys', async () => {
    const mgr = new APIKeyManager();
    const apiKey = await mgr.generateKey('svc', 'user-1', [{ resource: '*', actions: ['*'] }]);

    expect((await mgr.validateKey('qk_does-not-exist')).valid).toBe(false);

    await mgr.revokeKey(apiKey.id);
    const revoked = await mgr.validateKey(apiKey.key);
    expect(revoked.valid).toBe(false);
  });
});
