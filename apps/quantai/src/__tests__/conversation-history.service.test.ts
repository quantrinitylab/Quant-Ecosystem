import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationHistoryService } from '../services/conversation-history.service';
import type { HistoryConversation } from '../services/conversation-history.service';

function createMockConversation(overrides: Partial<HistoryConversation> = {}): HistoryConversation {
  return {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'Test Conversation',
    messages: [
      { id: 'msg-1', role: 'user', content: 'Hello', timestamp: Date.now() },
      { id: 'msg-2', role: 'assistant', content: 'Hi there', timestamp: Date.now() },
    ],
    model: 'gpt-4',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
    archived: false,
    tags: [],
    ...overrides,
  };
}

describe('ConversationHistoryService', () => {
  let service: ConversationHistoryService;

  beforeEach(() => {
    service = new ConversationHistoryService();
  });

  describe('addConversation / getConversation', () => {
    it('adds and retrieves a conversation', () => {
      const conv = createMockConversation({ id: 'conv-1' });
      service.addConversation(conv);
      const found = service.getConversation('conv-1');
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Test Conversation');
    });

    it('returns null for non-existent conversation', () => {
      expect(service.getConversation('fake')).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('deletes a conversation', () => {
      const conv = createMockConversation({ id: 'conv-1' });
      service.addConversation(conv);
      expect(service.deleteConversation('conv-1')).toBe(true);
      expect(service.getConversation('conv-1')).toBeNull();
    });

    it('returns false for non-existent conversation', () => {
      expect(service.deleteConversation('fake')).toBe(false);
    });
  });

  describe('listConversations', () => {
    it('returns all non-archived conversations', () => {
      service.addConversation(createMockConversation({ id: 'c1' }));
      service.addConversation(createMockConversation({ id: 'c2' }));
      service.addConversation(createMockConversation({ id: 'c3', archived: true }));

      const results = service.listConversations();
      expect(results).toHaveLength(2);
    });

    it('filters by query', () => {
      service.addConversation(createMockConversation({ id: 'c1', title: 'TypeScript Help' }));
      service.addConversation(createMockConversation({ id: 'c2', title: 'Python Help' }));

      const results = service.listConversations({ query: 'typescript' });
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('c1');
    });

    it('filters by model', () => {
      service.addConversation(createMockConversation({ id: 'c1', model: 'gpt-4' }));
      service.addConversation(createMockConversation({ id: 'c2', model: 'claude-3' }));

      const results = service.listConversations({ model: 'gpt-4' });
      expect(results).toHaveLength(1);
    });

    it('filters by tag', () => {
      service.addConversation(createMockConversation({ id: 'c1', tags: ['work'] }));
      service.addConversation(createMockConversation({ id: 'c2', tags: ['personal'] }));

      const results = service.listConversations({ tag: 'work' });
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('c1');
    });

    it('filters pinned only', () => {
      service.addConversation(createMockConversation({ id: 'c1', pinned: true }));
      service.addConversation(createMockConversation({ id: 'c2', pinned: false }));

      const results = service.listConversations({ pinnedOnly: true });
      expect(results).toHaveLength(1);
    });

    it('filters archived only', () => {
      service.addConversation(createMockConversation({ id: 'c1', archived: true }));
      service.addConversation(createMockConversation({ id: 'c2', archived: false }));

      const results = service.listConversations({ archivedOnly: true });
      expect(results).toHaveLength(1);
    });

    it('respects limit and offset', () => {
      for (let i = 0; i < 10; i++) {
        service.addConversation(createMockConversation({ id: `c${i}`, updatedAt: Date.now() + i }));
      }

      const page1 = service.listConversations({ limit: 3, offset: 0 });
      expect(page1).toHaveLength(3);

      const page2 = service.listConversations({ limit: 3, offset: 3 });
      expect(page2).toHaveLength(3);
      expect(page2[0]!.id).not.toBe(page1[0]!.id);
    });

    it('sorts by updatedAt descending', () => {
      service.addConversation(createMockConversation({ id: 'old', updatedAt: 1000 }));
      service.addConversation(createMockConversation({ id: 'new', updatedAt: 2000 }));

      const results = service.listConversations();
      expect(results[0]!.id).toBe('new');
    });
  });

  describe('pin / unpin', () => {
    it('pins a conversation', () => {
      service.addConversation(createMockConversation({ id: 'c1' }));
      expect(service.pinConversation('c1')).toBe(true);
      expect(service.getConversation('c1')!.pinned).toBe(true);
    });

    it('unpins a conversation', () => {
      service.addConversation(createMockConversation({ id: 'c1', pinned: true }));
      expect(service.unpinConversation('c1')).toBe(true);
      expect(service.getConversation('c1')!.pinned).toBe(false);
    });

    it('returns false for non-existent conversation', () => {
      expect(service.pinConversation('fake')).toBe(false);
      expect(service.unpinConversation('fake')).toBe(false);
    });
  });

  describe('archive / unarchive', () => {
    it('archives a conversation', () => {
      service.addConversation(createMockConversation({ id: 'c1' }));
      expect(service.archiveConversation('c1')).toBe(true);
      expect(service.getConversation('c1')!.archived).toBe(true);
    });

    it('unarchives a conversation', () => {
      service.addConversation(createMockConversation({ id: 'c1', archived: true }));
      expect(service.unarchiveConversation('c1')).toBe(true);
      expect(service.getConversation('c1')!.archived).toBe(false);
    });
  });

  describe('tags', () => {
    it('adds a tag', () => {
      service.addConversation(createMockConversation({ id: 'c1' }));
      expect(service.addTag('c1', 'work')).toBe(true);
      expect(service.getConversation('c1')!.tags).toContain('work');
    });

    it('does not duplicate tags', () => {
      service.addConversation(createMockConversation({ id: 'c1', tags: ['work'] }));
      service.addTag('c1', 'work');
      expect(service.getConversation('c1')!.tags).toHaveLength(1);
    });

    it('removes a tag', () => {
      service.addConversation(createMockConversation({ id: 'c1', tags: ['work', 'personal'] }));
      expect(service.removeTag('c1', 'work')).toBe(true);
      expect(service.getConversation('c1')!.tags).toEqual(['personal']);
    });
  });

  describe('renameConversation', () => {
    it('renames a conversation', () => {
      service.addConversation(createMockConversation({ id: 'c1' }));
      expect(service.renameConversation('c1', 'New Title')).toBe(true);
      expect(service.getConversation('c1')!.title).toBe('New Title');
    });
  });

  describe('getStats', () => {
    it('returns correct statistics', () => {
      service.addConversation(
        createMockConversation({
          id: 'c1',
          model: 'gpt-4',
          pinned: true,
          messages: [
            { id: 'm1', role: 'user', content: 'Hi', timestamp: 1, tokens: 5 },
            { id: 'm2', role: 'assistant', content: 'Hello', timestamp: 2, tokens: 10 },
          ],
        }),
      );
      service.addConversation(
        createMockConversation({
          id: 'c2',
          model: 'gpt-4',
          archived: true,
          messages: [{ id: 'm3', role: 'user', content: 'Hey', timestamp: 3, tokens: 3 }],
        }),
      );

      const stats = service.getStats();
      expect(stats.totalConversations).toBe(2);
      expect(stats.totalMessages).toBe(3);
      expect(stats.totalTokens).toBe(18);
      expect(stats.averageMessagesPerConversation).toBe(1.5);
      expect(stats.mostUsedModel).toBe('gpt-4');
      expect(stats.pinnedCount).toBe(1);
      expect(stats.archivedCount).toBe(1);
    });

    it('handles empty state', () => {
      const stats = service.getStats();
      expect(stats.totalConversations).toBe(0);
      expect(stats.totalMessages).toBe(0);
      expect(stats.mostUsedModel).toBe('none');
    });
  });

  describe('search', () => {
    it('searches by content', () => {
      service.addConversation(
        createMockConversation({
          id: 'c1',
          messages: [{ id: 'm1', role: 'user', content: 'How does React work?', timestamp: 1 }],
        }),
      );
      service.addConversation(
        createMockConversation({
          id: 'c2',
          messages: [{ id: 'm2', role: 'user', content: 'Tell me about Python', timestamp: 1 }],
        }),
      );

      const results = service.search('react');
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('c1');
    });
  });

  describe('getRecentConversations', () => {
    it('returns limited recent conversations', () => {
      for (let i = 0; i < 15; i++) {
        service.addConversation(createMockConversation({ id: `c${i}`, updatedAt: Date.now() + i }));
      }

      const recent = service.getRecentConversations(5);
      expect(recent).toHaveLength(5);
    });
  });
});
