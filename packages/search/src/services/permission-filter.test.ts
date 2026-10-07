// ============================================================================
// Permission Filter - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionFilter } from './permission-filter';
import type { SearchResultWithPermissions, UserPermissions } from './permission-filter';

describe('PermissionFilter', () => {
  let filter: PermissionFilter;

  beforeEach(() => {
    filter = new PermissionFilter();
  });

  const makeResult = (
    overrides: Partial<SearchResultWithPermissions> = {},
  ): SearchResultWithPermissions => ({
    id: 'doc-1',
    ownerUserId: 'owner-1',
    visibility: 'public',
    score: 0.9,
    document: { title: 'Test' },
    ...overrides,
  });

  const makePermissions = (overrides: Partial<UserPermissions> = {}): UserPermissions => ({
    userId: 'user-1',
    isAdmin: false,
    ...overrides,
  });

  describe('public documents', () => {
    it('should allow access to public documents', () => {
      const results = [makeResult({ visibility: 'public' })];
      const perms = makePermissions();

      const filtered = filter.filterResults(results, 'user-1', perms);

      expect(filtered).toHaveLength(1);
    });

    it('should allow access to public documents from other users', () => {
      const results = [makeResult({ visibility: 'public', ownerUserId: 'other-user' })];
      const perms = makePermissions();

      const filtered = filter.filterResults(results, 'user-1', perms);

      expect(filtered).toHaveLength(1);
    });
  });

  describe('private documents', () => {
    it('should block private documents from other users', () => {
      const results = [makeResult({ visibility: 'private', ownerUserId: 'other-user' })];
      const perms = makePermissions();

      const filtered = filter.filterResults(results, 'user-1', perms);

      expect(filtered).toHaveLength(0);
    });

    it('should allow owner to see their own private documents', () => {
      const results = [makeResult({ visibility: 'private', ownerUserId: 'user-1' })];
      const perms = makePermissions();

      const filtered = filter.filterResults(results, 'user-1', perms);

      expect(filtered).toHaveLength(1);
    });

    it('should allow admin to see private documents', () => {
      const results = [makeResult({ visibility: 'private', ownerUserId: 'other-user' })];
      const perms = makePermissions({ isAdmin: true });

      const filtered = filter.filterResults(results, 'admin-1', perms);

      expect(filtered).toHaveLength(1);
    });
  });

  describe('shared documents', () => {
    it('should allow access to shared documents for listed users', () => {
      const results = [
        makeResult({
          visibility: 'shared',
          ownerUserId: 'other-user',
          sharedWith: ['user-1', 'user-2'],
        }),
      ];
      const perms = makePermissions();

      const filtered = filter.filterResults(results, 'user-1', perms);

      expect(filtered).toHaveLength(1);
    });

    it('should block shared documents for unlisted users', () => {
      const results = [
        makeResult({
          visibility: 'shared',
          ownerUserId: 'other-user',
          sharedWith: ['user-2', 'user-3'],
        }),
      ];
      const perms = makePermissions();

      const filtered = filter.filterResults(results, 'user-1', perms);

      expect(filtered).toHaveLength(0);
    });

    it('should block shared documents with empty sharedWith list', () => {
      const results = [
        makeResult({
          visibility: 'shared',
          ownerUserId: 'other-user',
          sharedWith: [],
        }),
      ];
      const perms = makePermissions();

      const filtered = filter.filterResults(results, 'user-1', perms);

      expect(filtered).toHaveLength(0);
    });

    it('should allow owner to see their shared documents', () => {
      const results = [
        makeResult({
          visibility: 'shared',
          ownerUserId: 'user-1',
          sharedWith: ['user-2'],
        }),
      ];
      const perms = makePermissions();

      const filtered = filter.filterResults(results, 'user-1', perms);

      expect(filtered).toHaveLength(1);
    });
  });

  describe('mixed results', () => {
    it('should correctly filter a mix of visibility levels', () => {
      const results = [
        makeResult({ id: 'doc-1', visibility: 'public', ownerUserId: 'other' }),
        makeResult({ id: 'doc-2', visibility: 'private', ownerUserId: 'other' }),
        makeResult({
          id: 'doc-3',
          visibility: 'shared',
          ownerUserId: 'other',
          sharedWith: ['user-1'],
        }),
        makeResult({
          id: 'doc-4',
          visibility: 'shared',
          ownerUserId: 'other',
          sharedWith: ['user-2'],
        }),
        makeResult({ id: 'doc-5', visibility: 'private', ownerUserId: 'user-1' }),
      ];
      const perms = makePermissions();

      const filtered = filter.filterResults(results, 'user-1', perms);

      expect(filtered).toHaveLength(3);
      expect(filtered.map((r) => r.id)).toEqual(['doc-1', 'doc-3', 'doc-5']);
    });
  });
});
