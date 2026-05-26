import { describe, it, expect } from 'vitest';
import { FederationModeration } from './moderation.js';

describe('FederationModeration', () => {
  it('blocked instance isBlocked returns true', () => {
    const mod = new FederationModeration();
    mod.blockInstance('evil.example');
    expect(mod.isBlocked('evil.example')).toBe(true);
  });

  it('unblocked instance returns false', () => {
    const mod = new FederationModeration();
    mod.blockInstance('evil.example');
    mod.unblockInstance('evil.example');
    expect(mod.isBlocked('evil.example')).toBe(false);
  });

  it('allowlist-only mode rejects unlisted', () => {
    const mod = new FederationModeration();
    mod.allowInstance('trusted.example');

    expect(mod.isAllowed('trusted.example')).toBe(true);
    expect(mod.isAllowed('untrusted.example')).toBe(false);
  });

  it('activity from blocked domain rejected via checkActivity', () => {
    const mod = new FederationModeration();
    mod.blockInstance('spam.example');

    const result = mod.checkActivity({ actor: 'https://spam.example/users/spammer' });
    expect(result).toBe(false);
  });

  it('empty lists allow all', () => {
    const mod = new FederationModeration();

    expect(mod.isAllowed('any.example')).toBe(true);
    expect(mod.checkActivity({ actor: 'https://any.example/users/someone' })).toBe(true);
  });

  it('checkActivity handles object-typed actor', () => {
    const mod = new FederationModeration();
    mod.blockInstance('spam.example');

    const blockedResult = mod.checkActivity({
      actor: { id: 'https://spam.example/users/spammer' },
    });
    expect(blockedResult).toBe(false);

    const allowedResult = mod.checkActivity({
      actor: { id: 'https://good.example/users/friend' },
    });
    expect(allowedResult).toBe(true);
  });
});
