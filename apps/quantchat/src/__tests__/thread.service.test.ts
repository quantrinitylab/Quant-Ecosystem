import { describe, it, expect, beforeEach } from 'vitest';
import { ThreadService } from '../services/thread.service';

describe('ThreadService', () => {
  let service: ThreadService;

  beforeEach(() => {
    service = new ThreadService();
  });

  describe('createThread', () => {
    it('should create a thread for a root message', () => {
      const thread = service.createThread('msg-1', 'conv-1');

      expect(thread.id).toBeDefined();
      expect(thread.rootMessageId).toBe('msg-1');
      expect(thread.conversationId).toBe('conv-1');
      expect(thread.replyCount).toBe(0);
      expect(thread.replies).toHaveLength(0);
    });

    it('should return existing thread if root message already has one', () => {
      const first = service.createThread('msg-1', 'conv-1');
      const second = service.createThread('msg-1', 'conv-1');

      expect(first.id).toBe(second.id);
    });

    it('should create separate threads for different root messages', () => {
      const t1 = service.createThread('msg-1', 'conv-1');
      const t2 = service.createThread('msg-2', 'conv-1');

      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe('addReply', () => {
    it('should add a reply to a thread', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      const reply = service.addReply(thread.id, 'msg-1', 'user-1', 'Hello reply');

      expect(reply.content).toBe('Hello reply');
      expect(reply.userId).toBe('user-1');
      expect(reply.threadId).toBe(thread.id);
      expect(reply.parentId).toBe('msg-1');
    });

    it('should increment reply count', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      service.addReply(thread.id, 'msg-1', 'user-1', 'Reply 1');
      service.addReply(thread.id, 'msg-1', 'user-2', 'Reply 2');

      const updated = service.getThread(thread.id);
      expect(updated?.replyCount).toBe(2);
    });

    it('should track participant IDs', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      service.addReply(thread.id, 'msg-1', 'user-1', 'Reply 1');
      service.addReply(thread.id, 'msg-1', 'user-2', 'Reply 2');
      service.addReply(thread.id, 'msg-1', 'user-1', 'Reply 3');

      const updated = service.getThread(thread.id);
      expect(updated?.participantIds).toContain('user-1');
      expect(updated?.participantIds).toContain('user-2');
      expect(updated?.participantIds).toHaveLength(2);
    });

    it('should throw for non-existent thread', () => {
      expect(() => {
        service.addReply('non-existent', 'msg-1', 'user-1', 'Reply');
      }).toThrow('Thread "non-existent" not found');
    });

    it('should throw for empty content', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      expect(() => {
        service.addReply(thread.id, 'msg-1', 'user-1', '');
      }).toThrow('Reply content cannot be empty');
    });

    it('should trim content', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      const reply = service.addReply(thread.id, 'msg-1', 'user-1', '  Hello  ');
      expect(reply.content).toBe('Hello');
    });
  });

  describe('editReply', () => {
    it('should edit a reply', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      const reply = service.addReply(thread.id, 'msg-1', 'user-1', 'Original');

      const edited = service.editReply(thread.id, reply.id, 'Edited content');
      expect(edited.content).toBe('Edited content');
      expect(edited.editedAt).toBeDefined();
    });

    it('should throw for non-existent reply', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      expect(() => {
        service.editReply(thread.id, 'non-existent', 'New content');
      }).toThrow('Reply "non-existent" not found');
    });

    it('should throw for empty new content', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      const reply = service.addReply(thread.id, 'msg-1', 'user-1', 'Original');
      expect(() => {
        service.editReply(thread.id, reply.id, '');
      }).toThrow('Reply content cannot be empty');
    });
  });

  describe('deleteReply', () => {
    it('should delete a reply', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      const reply = service.addReply(thread.id, 'msg-1', 'user-1', 'To delete');

      const result = service.deleteReply(thread.id, reply.id);
      expect(result).toBe(true);

      const updated = service.getThread(thread.id);
      expect(updated?.replyCount).toBe(0);
    });

    it('should return false for non-existent reply', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      expect(service.deleteReply(thread.id, 'non-existent')).toBe(false);
    });

    it('should return false for non-existent thread', () => {
      expect(service.deleteReply('non-existent', 'reply-1')).toBe(false);
    });
  });

  describe('reactions on replies', () => {
    it('should add reaction to reply', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      const reply = service.addReply(thread.id, 'msg-1', 'user-1', 'React to me');

      const result = service.addReactionToReply(thread.id, reply.id, 'user-2', '❤️');
      expect(result).toBe(true);

      const updated = service.getThread(thread.id);
      const updatedReply = updated?.replies.find((r) => r.id === reply.id);
      expect(updatedReply?.reactions).toHaveLength(1);
    });

    it('should not duplicate reaction', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      const reply = service.addReply(thread.id, 'msg-1', 'user-1', 'React');

      service.addReactionToReply(thread.id, reply.id, 'user-2', '❤️');
      const result = service.addReactionToReply(thread.id, reply.id, 'user-2', '❤️');
      expect(result).toBe(false);
    });

    it('should remove reaction from reply', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      const reply = service.addReply(thread.id, 'msg-1', 'user-1', 'React');

      service.addReactionToReply(thread.id, reply.id, 'user-2', '❤️');
      const result = service.removeReactionFromReply(thread.id, reply.id, 'user-2', '❤️');
      expect(result).toBe(true);

      const updated = service.getThread(thread.id);
      const updatedReply = updated?.replies.find((r) => r.id === reply.id);
      expect(updatedReply?.reactions).toHaveLength(0);
    });
  });

  describe('getReplies', () => {
    it('should return replies sorted by timestamp', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      service.addReply(thread.id, 'msg-1', 'user-1', 'First');
      service.addReply(thread.id, 'msg-1', 'user-2', 'Second');
      service.addReply(thread.id, 'msg-1', 'user-3', 'Third');

      const replies = service.getReplies(thread.id);
      expect(replies).toHaveLength(3);
      expect(replies[0]?.content).toBe('First');
      expect(replies[2]?.content).toBe('Third');
    });

    it('should limit replies', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      service.addReply(thread.id, 'msg-1', 'user-1', 'First');
      service.addReply(thread.id, 'msg-1', 'user-2', 'Second');
      service.addReply(thread.id, 'msg-1', 'user-3', 'Third');

      const replies = service.getReplies(thread.id, 2);
      expect(replies).toHaveLength(2);
    });

    it('should return empty for non-existent thread', () => {
      expect(service.getReplies('non-existent')).toHaveLength(0);
    });
  });

  describe('getThreadByRootMessage', () => {
    it('should find thread by root message', () => {
      const thread = service.createThread('msg-1', 'conv-1');
      const found = service.getThreadByRootMessage('msg-1');
      expect(found?.id).toBe(thread.id);
    });

    it('should return null for unknown root message', () => {
      expect(service.getThreadByRootMessage('unknown')).toBeNull();
    });
  });

  describe('getThreadsForConversation', () => {
    it('should return threads for a conversation sorted by last reply', () => {
      service.createThread('msg-1', 'conv-1');
      service.createThread('msg-2', 'conv-1');
      service.createThread('msg-3', 'conv-2');

      const threads = service.getThreadsForConversation('conv-1');
      expect(threads).toHaveLength(2);
    });
  });

  describe('getThreadCount', () => {
    it('should return correct count', () => {
      service.createThread('msg-1', 'conv-1');
      service.createThread('msg-2', 'conv-1');
      service.createThread('msg-3', 'conv-2');

      expect(service.getThreadCount('conv-1')).toBe(2);
      expect(service.getThreadCount('conv-2')).toBe(1);
      expect(service.getThreadCount('conv-3')).toBe(0);
    });
  });
});
