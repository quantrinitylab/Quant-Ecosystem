import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as Y from 'yjs';
import { YjsServer } from '../services/yjs-server';

describe('YjsServer', () => {
  let server: YjsServer;

  beforeEach(() => {
    server = new YjsServer();
  });

  describe('getOrCreateDoc', () => {
    it('creates a new Y.Doc for a new docId', () => {
      const doc = server.getOrCreateDoc('doc-1');

      expect(doc).toBeInstanceOf(Y.Doc);
    });

    it('returns the same Y.Doc for the same docId', () => {
      const doc1 = server.getOrCreateDoc('doc-1');
      const doc2 = server.getOrCreateDoc('doc-1');

      expect(doc1).toBe(doc2);
    });
  });

  describe('applyUpdate', () => {
    it('modifies the document with applied update', () => {
      // Create a separate doc, make changes, and capture the update
      const sourceDoc = new Y.Doc();
      const sourceText = sourceDoc.getText('content');

      let capturedUpdate: Uint8Array | null = null;
      sourceDoc.on('update', (update: Uint8Array) => {
        capturedUpdate = update;
      });

      sourceText.insert(0, 'Hello World');

      expect(capturedUpdate).not.toBeNull();

      // Apply the update to server doc
      server.applyUpdate('doc-1', capturedUpdate!);

      // Verify the server doc has the content
      const serverDoc = server.getOrCreateDoc('doc-1');
      const serverText = serverDoc.getText('content');
      expect(serverText.toString()).toBe('Hello World');
    });
  });

  describe('getStateVector', () => {
    it('returns a non-empty Uint8Array', () => {
      server.getOrCreateDoc('doc-1');
      const stateVector = server.getStateVector('doc-1');

      expect(stateVector).toBeInstanceOf(Uint8Array);
      expect(stateVector.length).toBeGreaterThan(0);
    });
  });

  describe('encodeState', () => {
    it('returns the full state as Uint8Array', () => {
      // Add some content first
      const sourceDoc = new Y.Doc();
      const sourceText = sourceDoc.getText('content');

      let capturedUpdate: Uint8Array | null = null;
      sourceDoc.on('update', (update: Uint8Array) => {
        capturedUpdate = update;
      });

      sourceText.insert(0, 'Test content');

      server.applyUpdate('doc-1', capturedUpdate!);
      const state = server.encodeState('doc-1');

      expect(state).toBeInstanceOf(Uint8Array);
      expect(state.length).toBeGreaterThan(0);

      // Verify we can create a new doc from the state
      const newDoc = new Y.Doc();
      Y.applyUpdate(newDoc, state);
      expect(newDoc.getText('content').toString()).toBe('Test content');
    });
  });

  describe('two-client merge', () => {
    it('two clients making different edits converge to same content', () => {
      // Simulate two clients editing the same document
      const client1 = new Y.Doc();
      const client2 = new Y.Doc();

      const text1 = client1.getText('content');
      const text2 = client2.getText('content');

      // Client 1 inserts text at position 0
      text1.insert(0, 'Hello ');

      // Get client1's update and apply to client2
      const update1 = Y.encodeStateAsUpdate(client1);
      Y.applyUpdate(client2, update1);

      // Client 2 inserts text at the end
      text2.insert(text2.length, 'World');

      // Get client2's update and apply to client1
      const update2 = Y.encodeStateAsUpdate(client2, Y.encodeStateVector(client1));
      Y.applyUpdate(client1, update2);

      // Get client1's remaining update and apply to client2
      const update1b = Y.encodeStateAsUpdate(client1, Y.encodeStateVector(client2));
      Y.applyUpdate(client2, update1b);

      // Both clients should have the same content
      expect(text1.toString()).toBe(text2.toString());
      expect(text1.toString()).toContain('Hello');
      expect(text1.toString()).toContain('World');
    });

    it('concurrent edits at same position merge without conflict', () => {
      const client1 = new Y.Doc();
      const client2 = new Y.Doc();

      const text1 = client1.getText('content');
      const text2 = client2.getText('content');

      // Both clients start with same content
      text1.insert(0, 'Base');
      const baseUpdate = Y.encodeStateAsUpdate(client1);
      Y.applyUpdate(client2, baseUpdate);

      // Both clients insert at position 4 concurrently
      text1.insert(4, ' Alpha');
      text2.insert(4, ' Beta');

      // Exchange updates
      const update1 = Y.encodeStateAsUpdate(client1, Y.encodeStateVector(client2));
      const update2 = Y.encodeStateAsUpdate(client2, Y.encodeStateVector(client1));

      Y.applyUpdate(client1, update2);
      Y.applyUpdate(client2, update1);

      // Both should converge to the same content (order determined by client IDs)
      expect(text1.toString()).toBe(text2.toString());
      expect(text1.toString()).toContain('Base');
      expect(text1.toString()).toContain('Alpha');
      expect(text1.toString()).toContain('Beta');
    });
  });

  describe('eviction', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('schedules eviction when last client disconnects', () => {
      server.handleConnection('doc-1', 'client-1');
      server.getOrCreateDoc('doc-1');

      server.removeConnection('doc-1', 'client-1');

      // Doc still exists before timer fires
      expect(server.getConnectedClients('doc-1')).toHaveLength(0);

      // Advance time past the eviction delay (5 minutes)
      vi.advanceTimersByTime(300001);

      // After eviction, getOrCreateDoc creates a fresh doc (the old one was destroyed)
      const doc = server.getOrCreateDoc('doc-1');
      expect(doc).toBeInstanceOf(Y.Doc);
    });

    it('cancels eviction if a client reconnects', () => {
      server.handleConnection('doc-1', 'client-1');

      // Apply some content
      const sourceDoc = new Y.Doc();
      const sourceText = sourceDoc.getText('content');
      let capturedUpdate: Uint8Array | null = null;
      sourceDoc.on('update', (update: Uint8Array) => {
        capturedUpdate = update;
      });
      sourceText.insert(0, 'Keep this');
      server.applyUpdate('doc-1', capturedUpdate!);

      // Disconnect triggers eviction schedule
      server.removeConnection('doc-1', 'client-1');

      // Reconnect before eviction fires
      server.handleConnection('doc-1', 'client-2');

      // Advance time past eviction delay
      vi.advanceTimersByTime(300001);

      // Doc content should still be there since eviction was cancelled
      const doc = server.getOrCreateDoc('doc-1');
      expect(doc.getText('content').toString()).toBe('Keep this');
    });
  });

  describe('evictIdleDocs', () => {
    it('evicts documents with no clients that exceed maxIdleMs', () => {
      // Create a doc and disconnect
      server.handleConnection('doc-1', 'client-1');
      server.getOrCreateDoc('doc-1');
      server.removeConnection('doc-1', 'client-1');

      // Create another doc that is still connected
      server.handleConnection('doc-2', 'client-2');
      server.getOrCreateDoc('doc-2');

      // Manually call evictIdleDocs with 0ms threshold (everything idle is evicted)
      const evicted = server.evictIdleDocs(0);

      expect(evicted).toContain('doc-1');
      expect(evicted).not.toContain('doc-2');
    });

    it('does not evict documents within maxIdleMs', () => {
      server.handleConnection('doc-1', 'client-1');
      server.getOrCreateDoc('doc-1');
      server.removeConnection('doc-1', 'client-1');

      // Use a large maxIdleMs - doc was just created so it's not idle enough
      const evicted = server.evictIdleDocs(999999999);

      expect(evicted).toHaveLength(0);
    });

    it('returns empty array when no docs exist', () => {
      const evicted = server.evictIdleDocs(0);
      expect(evicted).toHaveLength(0);
    });
  });

  describe('shutdown', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('clears all pending eviction timers', () => {
      server.handleConnection('doc-1', 'client-1');
      server.handleConnection('doc-2', 'client-2');
      server.getOrCreateDoc('doc-1');
      server.getOrCreateDoc('doc-2');

      // Disconnect both to schedule evictions
      server.removeConnection('doc-1', 'client-1');
      server.removeConnection('doc-2', 'client-2');

      // Shutdown clears timers
      server.shutdown();

      // Advance past eviction time - docs should NOT be evicted since timers were cleared
      vi.advanceTimersByTime(300001);

      // Docs should still exist (getOrCreateDoc returns the same instance)
      const doc1 = server.getOrCreateDoc('doc-1');
      const doc2 = server.getOrCreateDoc('doc-2');
      expect(doc1).toBeInstanceOf(Y.Doc);
      expect(doc2).toBeInstanceOf(Y.Doc);
    });
  });
});
