import { describe, it, expect, beforeEach } from 'vitest';
import { EmailAliasesService } from '../services/email-aliases.service';

describe('EmailAliasesService', () => {
  let service: EmailAliasesService;

  beforeEach(() => {
    service = new EmailAliasesService();
  });

  describe('createAlias', () => {
    it('creates an alias with correct full address', () => {
      const alias = service.createAlias('user-1', 'shopping', 'alice@quant.email');

      expect(alias.id).toBeDefined();
      expect(alias.userId).toBe('user-1');
      expect(alias.alias).toBe('shopping');
      expect(alias.fullAddress).toBe('alice+shopping@quant.email');
      expect(alias.targetAddress).toBe('alice@quant.email');
      expect(alias.createdAt).toBeInstanceOf(Date);
      expect(alias.isActive).toBe(true);
    });

    it('throws error for invalid base address', () => {
      expect(() => service.createAlias('user-1', 'test', 'invalid-address')).toThrow(
        'Invalid base address',
      );
    });

    it('allows multiple aliases for same user', () => {
      service.createAlias('user-1', 'shopping', 'alice@quant.email');
      service.createAlias('user-1', 'newsletters', 'alice@quant.email');

      const aliases = service.listAliases('user-1');
      expect(aliases).toHaveLength(2);
    });
  });

  describe('resolveAlias', () => {
    it('resolves a plus-address to the target address', () => {
      service.createAlias('user-1', 'shopping', 'alice@quant.email');

      const result = service.resolveAlias('alice+shopping@quant.email');

      expect(result).not.toBeNull();
      expect(result!.targetAddress).toBe('alice@quant.email');
      expect(result!.alias).toBe('shopping');
    });

    it('resolves unknown plus-address by parsing the format', () => {
      const result = service.resolveAlias('bob+unknown@quant.email');

      expect(result).not.toBeNull();
      expect(result!.targetAddress).toBe('bob@quant.email');
      expect(result!.alias).toBe('unknown');
    });

    it('returns null for addresses without plus sign', () => {
      const result = service.resolveAlias('alice@quant.email');
      expect(result).toBeNull();
    });

    it('returns null for malformed addresses', () => {
      const result = service.resolveAlias('no-at-sign');
      expect(result).toBeNull();
    });
  });

  describe('listAliases', () => {
    it('returns only aliases for the given user', () => {
      service.createAlias('user-1', 'shopping', 'alice@quant.email');
      service.createAlias('user-2', 'work', 'bob@quant.email');
      service.createAlias('user-1', 'newsletters', 'alice@quant.email');

      const aliases = service.listAliases('user-1');
      expect(aliases).toHaveLength(2);
      expect(aliases.every((a) => a.userId === 'user-1')).toBe(true);
    });

    it('returns empty array for user with no aliases', () => {
      const aliases = service.listAliases('no-aliases-user');
      expect(aliases).toHaveLength(0);
    });
  });

  describe('deleteAlias', () => {
    it('deactivates an alias owned by the user', () => {
      const alias = service.createAlias('user-1', 'shopping', 'alice@quant.email');
      const result = service.deleteAlias('user-1', alias.id);

      expect(result).toBe(true);
    });

    it('returns false when alias does not exist', () => {
      const result = service.deleteAlias('user-1', 'nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when user does not own the alias', () => {
      const alias = service.createAlias('user-1', 'shopping', 'alice@quant.email');
      const result = service.deleteAlias('user-2', alias.id);

      expect(result).toBe(false);
    });
  });
});
