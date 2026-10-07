import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceRegistry } from '../core/resource-registry.js';
import type { ResourceEntry } from '../types.js';

describe('ResourceRegistry', () => {
  let registry: ResourceRegistry;

  const createResource = (overrides: Partial<ResourceEntry> = {}): ResourceEntry => ({
    id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'doc',
    ownerId: 'user-1',
    workspaceId: 'ws-1',
    title: 'Test Resource',
    metadata: {},
    aiAccessEnabled: false,
    createdAt: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    registry = new ResourceRegistry();
  });

  describe('registerResource', () => {
    it('registers a resource', () => {
      const resource = createResource({ id: 'res-1' });
      registry.registerResource(resource);
      expect(registry.getResource('res-1')).toEqual(resource);
    });
  });

  describe('getResource', () => {
    it('returns undefined for unknown id', () => {
      expect(registry.getResource('unknown')).toBeUndefined();
    });
  });

  describe('listResources', () => {
    it('filters by workspace', () => {
      registry.registerResource(createResource({ id: 'r1', workspaceId: 'ws-1' }));
      registry.registerResource(createResource({ id: 'r2', workspaceId: 'ws-2' }));
      registry.registerResource(createResource({ id: 'r3', workspaceId: 'ws-1' }));

      const results = registry.listResources('ws-1');
      expect(results).toHaveLength(2);
    });

    it('filters by type', () => {
      registry.registerResource(createResource({ id: 'r1', type: 'doc' }));
      registry.registerResource(createResource({ id: 'r2', type: 'email' }));
      registry.registerResource(createResource({ id: 'r3', type: 'doc' }));

      const results = registry.listResources('ws-1', 'doc');
      expect(results).toHaveLength(2);
    });

    it('filters by ownerId', () => {
      registry.registerResource(createResource({ id: 'r1', ownerId: 'user-1' }));
      registry.registerResource(createResource({ id: 'r2', ownerId: 'user-2' }));

      const results = registry.listResources('ws-1', undefined, 'user-1');
      expect(results).toHaveLength(1);
    });
  });

  describe('transferOwnership', () => {
    it('transfers resource to new owner', () => {
      registry.registerResource(createResource({ id: 'r1', ownerId: 'user-1' }));
      expect(registry.transferOwnership('r1', 'user-2')).toBe(true);
      expect(registry.getResource('r1')?.ownerId).toBe('user-2');
    });

    it('returns false for unknown resource', () => {
      expect(registry.transferOwnership('unknown', 'user-2')).toBe(false);
    });
  });

  describe('AI access toggle', () => {
    it('enables AI access', () => {
      registry.registerResource(createResource({ id: 'r1', aiAccessEnabled: false }));
      registry.setAIAccessToggle('r1', true);
      expect(registry.isAIAccessEnabled('r1')).toBe(true);
    });

    it('disables AI access', () => {
      registry.registerResource(createResource({ id: 'r1', aiAccessEnabled: true }));
      registry.setAIAccessToggle('r1', false);
      expect(registry.isAIAccessEnabled('r1')).toBe(false);
    });

    it('returns false for unknown resource', () => {
      expect(registry.isAIAccessEnabled('unknown')).toBe(false);
      expect(registry.setAIAccessToggle('unknown', true)).toBe(false);
    });
  });

  describe('deleteResource', () => {
    it('deletes a resource', () => {
      registry.registerResource(createResource({ id: 'r1' }));
      expect(registry.deleteResource('r1')).toBe(true);
      expect(registry.getResource('r1')).toBeUndefined();
    });

    it('returns false for unknown resource', () => {
      expect(registry.deleteResource('unknown')).toBe(false);
    });
  });
});
