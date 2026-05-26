import { describe, it, expect, beforeEach } from 'vitest';
import { PresenceService } from '../services/presence.service';

describe('PresenceService', () => {
  let service: PresenceService;

  beforeEach(() => {
    service = new PresenceService();
  });

  describe('setCursor', () => {
    it('stores cursor info for a user in a document', () => {
      service.setCursor('doc-1', 'user-1', { line: 5, column: 10 }, 'Alice', '#ff0000');

      const cursors = service.getCursors('doc-1');
      expect(cursors).toHaveLength(1);
      expect(cursors[0]).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          name: 'Alice',
          color: '#ff0000',
          position: { line: 5, column: 10 },
        }),
      );
    });

    it('updates cursor position for same user', () => {
      service.setCursor('doc-1', 'user-1', { line: 1, column: 1 });
      service.setCursor('doc-1', 'user-1', { line: 10, column: 5 });

      const cursors = service.getCursors('doc-1');
      expect(cursors).toHaveLength(1);
      expect(cursors[0]!.position).toEqual({ line: 10, column: 5 });
    });
  });

  describe('getCursors', () => {
    it('returns all cursors for a document', () => {
      service.setCursor('doc-1', 'user-1', { line: 1, column: 1 }, 'Alice');
      service.setCursor('doc-1', 'user-2', { line: 3, column: 7 }, 'Bob');
      service.setCursor('doc-1', 'user-3', { line: 5, column: 2 }, 'Carol');

      const cursors = service.getCursors('doc-1');
      expect(cursors).toHaveLength(3);
    });

    it('returns empty array for document with no cursors', () => {
      const cursors = service.getCursors('nonexistent-doc');
      expect(cursors).toEqual([]);
    });
  });

  describe('removeCursor', () => {
    it('removes a user cursor from a document', () => {
      service.setCursor('doc-1', 'user-1', { line: 1, column: 1 });
      service.setCursor('doc-1', 'user-2', { line: 2, column: 2 });

      service.removeCursor('doc-1', 'user-1');

      const cursors = service.getCursors('doc-1');
      expect(cursors).toHaveLength(1);
      expect(cursors[0]!.userId).toBe('user-2');
    });

    it('does nothing when removing non-existent cursor', () => {
      service.removeCursor('doc-1', 'user-1');
      expect(service.getCursors('doc-1')).toEqual([]);
    });
  });

  describe('cleanupStaleCursors', () => {
    it('removes cursors older than maxAgeMs', () => {
      service.setCursor('doc-1', 'user-1', { line: 1, column: 1 }, 'Alice');
      service.setCursor('doc-1', 'user-2', { line: 2, column: 2 }, 'Bob');

      // Manually backdate one cursor's lastUpdated
      const cursors = service.getCursors('doc-1');
      const staleCursor = cursors.find((c) => c.userId === 'user-1');
      staleCursor!.lastUpdated = new Date(Date.now() - 60000); // 60 seconds ago

      const removed = service.cleanupStaleCursors(30000); // 30 second threshold

      expect(removed).toBe(1);
      const remaining = service.getCursors('doc-1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.userId).toBe('user-2');
    });

    it('removes empty doc entries after all cursors are stale', () => {
      service.setCursor('doc-1', 'user-1', { line: 1, column: 1 });

      // Backdate the cursor
      const cursors = service.getCursors('doc-1');
      cursors[0]!.lastUpdated = new Date(Date.now() - 120000);

      const removed = service.cleanupStaleCursors(60000);

      expect(removed).toBe(1);
      expect(service.getCursors('doc-1')).toHaveLength(0);
    });

    it('does not remove fresh cursors', () => {
      service.setCursor('doc-1', 'user-1', { line: 1, column: 1 });
      service.setCursor('doc-2', 'user-2', { line: 2, column: 2 });

      const removed = service.cleanupStaleCursors(60000);

      expect(removed).toBe(0);
      expect(service.getCursors('doc-1')).toHaveLength(1);
      expect(service.getCursors('doc-2')).toHaveLength(1);
    });

    it('handles cleanup across multiple documents', () => {
      service.setCursor('doc-1', 'user-1', { line: 1, column: 1 });
      service.setCursor('doc-2', 'user-2', { line: 2, column: 2 });
      service.setCursor('doc-2', 'user-3', { line: 3, column: 3 });

      // Backdate cursors in both docs
      const doc1Cursors = service.getCursors('doc-1');
      doc1Cursors[0]!.lastUpdated = new Date(Date.now() - 120000);

      const doc2Cursors = service.getCursors('doc-2');
      doc2Cursors[0]!.lastUpdated = new Date(Date.now() - 120000);

      const removed = service.cleanupStaleCursors(60000);

      expect(removed).toBe(2);
      expect(service.getCursors('doc-1')).toHaveLength(0);
      expect(service.getCursors('doc-2')).toHaveLength(1);
      expect(service.getCursors('doc-2')[0]!.userId).toBe('user-3');
    });
  });

  describe('document isolation', () => {
    it('cursors are isolated between different documents', () => {
      service.setCursor('doc-1', 'user-1', { line: 1, column: 1 }, 'Alice');
      service.setCursor('doc-2', 'user-2', { line: 2, column: 2 }, 'Bob');

      const doc1Cursors = service.getCursors('doc-1');
      const doc2Cursors = service.getCursors('doc-2');

      expect(doc1Cursors).toHaveLength(1);
      expect(doc1Cursors[0]!.userId).toBe('user-1');

      expect(doc2Cursors).toHaveLength(1);
      expect(doc2Cursors[0]!.userId).toBe('user-2');
    });

    it('removing cursor from one doc does not affect another', () => {
      service.setCursor('doc-1', 'user-1', { line: 1, column: 1 });
      service.setCursor('doc-2', 'user-1', { line: 2, column: 2 });

      service.removeCursor('doc-1', 'user-1');

      expect(service.getCursors('doc-1')).toHaveLength(0);
      expect(service.getCursors('doc-2')).toHaveLength(1);
    });
  });
});
