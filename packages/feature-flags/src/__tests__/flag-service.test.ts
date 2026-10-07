import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureFlagService } from '../flag-service';
import { InMemoryFlagStore } from '../flags-store';
import type { FeatureFlag } from '../types';

function createTestFlag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    id: 'flag_test1',
    name: 'test-flag',
    description: 'A test flag',
    enabled: true,
    rules: [],
    percentage: 100,
    variants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('FeatureFlagService', () => {
  let store: InMemoryFlagStore;
  let service: FeatureFlagService;

  beforeEach(() => {
    store = new InMemoryFlagStore();
    service = new FeatureFlagService({ store });
  });

  describe('isEnabled', () => {
    it('returns false when flag does not exist', () => {
      expect(service.isEnabled('nonexistent')).toBe(false);
    });

    it('returns false when flag is disabled', () => {
      store.save(createTestFlag({ enabled: false }));
      expect(service.isEnabled('test-flag')).toBe(false);
    });

    it('returns true when flag is enabled with 100% rollout', () => {
      store.save(createTestFlag({ enabled: true, percentage: 100 }));
      expect(service.isEnabled('test-flag')).toBe(true);
    });

    it('returns false when percentage is 0%', () => {
      store.save(createTestFlag({ enabled: true, percentage: 0 }));
      expect(service.isEnabled('test-flag', { userId: 'user1' })).toBe(false);
    });

    it('returns true when percentage is 100%', () => {
      store.save(createTestFlag({ enabled: true, percentage: 100 }));
      expect(service.isEnabled('test-flag', { userId: 'user1' })).toBe(true);
    });

    it('is deterministic for same userId (same result every call)', () => {
      store.save(createTestFlag({ enabled: true, percentage: 50 }));
      const context = { userId: 'user-stable' };
      const first = service.isEnabled('test-flag', context);
      const second = service.isEnabled('test-flag', context);
      const third = service.isEnabled('test-flag', context);
      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it('matches eq rule correctly', () => {
      store.save(
        createTestFlag({
          enabled: true,
          rules: [{ field: 'role', operator: 'eq', value: 'admin' }],
        }),
      );
      expect(service.isEnabled('test-flag', { userId: 'u1', role: 'admin' })).toBe(true);
      expect(service.isEnabled('test-flag', { userId: 'u1', role: 'user' })).toBe(false);
    });

    it('matches neq rule correctly', () => {
      store.save(
        createTestFlag({
          enabled: true,
          rules: [{ field: 'role', operator: 'neq', value: 'banned' }],
        }),
      );
      expect(service.isEnabled('test-flag', { userId: 'u1', role: 'user' })).toBe(true);
      expect(service.isEnabled('test-flag', { userId: 'u1', role: 'banned' })).toBe(false);
    });

    it('matches in rule correctly', () => {
      store.save(
        createTestFlag({
          enabled: true,
          rules: [{ field: 'role', operator: 'in', value: ['admin', 'moderator'] }],
        }),
      );
      expect(service.isEnabled('test-flag', { userId: 'u1', role: 'admin' })).toBe(true);
      expect(service.isEnabled('test-flag', { userId: 'u1', role: 'user' })).toBe(false);
    });
  });

  describe('getAllFlags', () => {
    it('returns all flags in the store', () => {
      store.save(createTestFlag({ id: 'f1', name: 'flag-1' }));
      store.save(createTestFlag({ id: 'f2', name: 'flag-2' }));
      const flags = service.getAllFlags();
      expect(flags).toHaveLength(2);
    });

    it('returns empty array when no flags exist', () => {
      expect(service.getAllFlags()).toHaveLength(0);
    });
  });

  describe('createFlag', () => {
    it('creates a new flag with defaults', () => {
      const flag = service.createFlag({ name: 'new-flag' });
      expect(flag.name).toBe('new-flag');
      expect(flag.enabled).toBe(false);
      expect(flag.percentage).toBe(100);
      expect(flag.rules).toEqual([]);
      expect(flag.variants).toEqual([]);
      expect(flag.id).toBeDefined();
    });

    it('creates a flag with custom values', () => {
      const flag = service.createFlag({
        name: 'custom-flag',
        enabled: true,
        percentage: 50,
        description: 'Custom description',
      });
      expect(flag.enabled).toBe(true);
      expect(flag.percentage).toBe(50);
      expect(flag.description).toBe('Custom description');
    });
  });

  describe('updateFlag', () => {
    it('updates an existing flag', () => {
      const created = service.createFlag({ name: 'updatable' });
      const updated = service.updateFlag(created.id, { enabled: true, percentage: 75 });
      expect(updated.enabled).toBe(true);
      expect(updated.percentage).toBe(75);
      expect(updated.name).toBe('updatable');
    });

    it('throws when flag does not exist', () => {
      expect(() => service.updateFlag('nonexistent', { enabled: true })).toThrow();
    });
  });

  describe('deleteFlag', () => {
    it('removes a flag from the store', () => {
      const created = service.createFlag({ name: 'deletable' });
      service.deleteFlag(created.id);
      expect(service.getAllFlags()).toHaveLength(0);
    });
  });

  describe('getVariant', () => {
    it('returns null when flag has no variants', () => {
      store.save(createTestFlag({ enabled: true }));
      expect(service.getVariant('test-flag')).toBeNull();
    });

    it('returns a variant value when variants exist', () => {
      store.save(
        createTestFlag({
          enabled: true,
          variants: [
            { name: 'control', value: 'A', weight: 50 },
            { name: 'treatment', value: 'B', weight: 50 },
          ],
        }),
      );
      const result = service.getVariant('test-flag', { userId: 'u1' });
      expect(['A', 'B']).toContain(result);
    });

    it('returns null when flag is disabled', () => {
      store.save(
        createTestFlag({
          enabled: false,
          variants: [{ name: 'v1', value: 'X', weight: 100 }],
        }),
      );
      expect(service.getVariant('test-flag')).toBeNull();
    });
  });
});
