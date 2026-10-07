// ============================================================================
// Saved Search Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SavedSearchService } from './saved-search';
import type { DocumentToMatch } from './saved-search';

describe('SavedSearchService', () => {
  let service: SavedSearchService;

  beforeEach(() => {
    service = new SavedSearchService();
  });

  describe('create', () => {
    it('should create a saved search with defaults', () => {
      const result = service.create({
        userId: 'user-1',
        query: 'project alpha',
      });

      expect(result.id).toBeDefined();
      expect(result.userId).toBe('user-1');
      expect(result.query).toBe('project alpha');
      expect(result.filters).toEqual({});
      expect(result.alertFrequency).toBe('never');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should create a saved search with custom alert frequency', () => {
      const result = service.create({
        userId: 'user-1',
        query: 'urgent',
        alertFrequency: 'immediate',
        filters: { type: 'email' },
      });

      expect(result.alertFrequency).toBe('immediate');
      expect(result.filters).toEqual({ type: 'email' });
    });

    it('should assign unique IDs', () => {
      const a = service.create({ userId: 'user-1', query: 'a' });
      const b = service.create({ userId: 'user-1', query: 'b' });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('get', () => {
    it('should retrieve a saved search by id', () => {
      const created = service.create({ userId: 'user-1', query: 'test' });
      const result = service.get(created.id);
      expect(result).toEqual(created);
    });

    it('should return undefined for non-existent id', () => {
      const result = service.get('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('listByUser', () => {
    it('should list searches for a specific user', () => {
      service.create({ userId: 'user-1', query: 'a' });
      service.create({ userId: 'user-2', query: 'b' });
      service.create({ userId: 'user-1', query: 'c' });

      const results = service.listByUser('user-1');
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.userId === 'user-1')).toBe(true);
    });

    it('should return empty array for user with no saved searches', () => {
      const results = service.listByUser('unknown');
      expect(results).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update the query of a saved search', () => {
      const created = service.create({ userId: 'user-1', query: 'old' });
      const updated = service.update(created.id, { query: 'new' });

      expect(updated?.query).toBe('new');
      expect(updated?.userId).toBe('user-1');
    });

    it('should update the alert frequency', () => {
      const created = service.create({ userId: 'user-1', query: 'test' });
      const updated = service.update(created.id, { alertFrequency: 'daily' });

      expect(updated?.alertFrequency).toBe('daily');
    });

    it('should return undefined for non-existent id', () => {
      const result = service.update('non-existent', { query: 'new' });
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete a saved search', () => {
      const created = service.create({ userId: 'user-1', query: 'test' });
      const result = service.delete(created.id);

      expect(result).toBe(true);
      expect(service.get(created.id)).toBeUndefined();
    });

    it('should return false for non-existent id', () => {
      const result = service.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('matchNewDocument', () => {
    it('should match documents containing all query terms', () => {
      service.create({
        userId: 'user-1',
        query: 'project alpha',
        alertFrequency: 'immediate',
      });

      const doc: DocumentToMatch = {
        id: 'doc-1',
        content: 'Update on Project Alpha progress',
        type: 'email',
      };

      const matches = service.matchNewDocument(doc);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.documentId).toBe('doc-1');
    });

    it('should not match documents missing query terms', () => {
      service.create({
        userId: 'user-1',
        query: 'project alpha',
        alertFrequency: 'immediate',
      });

      const doc: DocumentToMatch = {
        id: 'doc-1',
        content: 'Update on Project Beta',
        type: 'email',
      };

      const matches = service.matchNewDocument(doc);
      expect(matches).toHaveLength(0);
    });

    it('should skip saved searches with alertFrequency "never"', () => {
      service.create({
        userId: 'user-1',
        query: 'project',
        alertFrequency: 'never',
      });

      const doc: DocumentToMatch = {
        id: 'doc-1',
        content: 'project update',
        type: 'email',
      };

      const matches = service.matchNewDocument(doc);
      expect(matches).toHaveLength(0);
    });

    it('should respect type filter', () => {
      service.create({
        userId: 'user-1',
        query: 'meeting',
        alertFrequency: 'daily',
        filters: { type: 'email' },
      });

      const fileDoc: DocumentToMatch = {
        id: 'doc-1',
        content: 'meeting notes',
        type: 'file',
      };

      const emailDoc: DocumentToMatch = {
        id: 'doc-2',
        content: 'meeting invite',
        type: 'email',
      };

      expect(service.matchNewDocument(fileDoc)).toHaveLength(0);
      expect(service.matchNewDocument(emailDoc)).toHaveLength(1);
    });

    it('should match multiple saved searches', () => {
      service.create({
        userId: 'user-1',
        query: 'project',
        alertFrequency: 'immediate',
      });
      service.create({
        userId: 'user-2',
        query: 'update',
        alertFrequency: 'daily',
      });

      const doc: DocumentToMatch = {
        id: 'doc-1',
        content: 'project update for today',
        type: 'email',
      };

      const matches = service.matchNewDocument(doc);
      expect(matches).toHaveLength(2);
    });
  });

  describe('getAlertsDue', () => {
    it('should return immediate alerts always', () => {
      service.create({
        userId: 'user-1',
        query: 'test',
        alertFrequency: 'immediate',
      });

      const due = service.getAlertsDue();
      expect(due).toHaveLength(1);
    });

    it('should not return alerts with frequency "never"', () => {
      service.create({
        userId: 'user-1',
        query: 'test',
        alertFrequency: 'never',
      });

      const due = service.getAlertsDue();
      expect(due).toHaveLength(0);
    });

    it('should return daily alerts that have never been alerted', () => {
      service.create({
        userId: 'user-1',
        query: 'test',
        alertFrequency: 'daily',
      });

      const due = service.getAlertsDue();
      expect(due).toHaveLength(1);
    });

    it('should return weekly alerts that have never been alerted', () => {
      service.create({
        userId: 'user-1',
        query: 'test',
        alertFrequency: 'weekly',
      });

      const due = service.getAlertsDue();
      expect(due).toHaveLength(1);
    });
  });

  describe('markAlerted', () => {
    it('should update lastAlertedAt timestamp', () => {
      const created = service.create({
        userId: 'user-1',
        query: 'test',
        alertFrequency: 'daily',
      });

      service.markAlerted(created.id);
      const updated = service.get(created.id);
      expect(updated?.lastAlertedAt).toBeInstanceOf(Date);
    });
  });
});
