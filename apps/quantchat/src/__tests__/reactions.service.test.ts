import { describe, it, expect, beforeEach } from 'vitest';
import { MessageReactionsService } from '../services/reactions.service';

describe('MessageReactionsService', () => {
  let service: MessageReactionsService;

  beforeEach(() => {
    service = new MessageReactionsService();
  });

  describe('addReaction', () => {
    it('should add a reaction to a message', () => {
      const reaction = service.addReaction('msg-1', 'user-1', '❤️');
      expect(reaction.emoji).toBe('❤️');
      expect(reaction.userId).toBe('user-1');
      expect(reaction.timestamp).toBeGreaterThan(0);
    });

    it('should not duplicate reaction from same user with same emoji', () => {
      const first = service.addReaction('msg-1', 'user-1', '❤️');
      const second = service.addReaction('msg-1', 'user-1', '❤️');
      expect(first).toBe(second);

      const reactions = service.getReactions('msg-1');
      const heart = reactions.find((r) => r.emoji === '❤️');
      expect(heart?.count).toBe(1);
    });

    it('should allow same user to add different emojis', () => {
      service.addReaction('msg-1', 'user-1', '❤️');
      service.addReaction('msg-1', 'user-1', '😂');

      const reactions = service.getReactions('msg-1');
      expect(reactions).toHaveLength(2);
    });

    it('should allow different users to add same emoji', () => {
      service.addReaction('msg-1', 'user-1', '❤️');
      service.addReaction('msg-1', 'user-2', '❤️');

      const reactions = service.getReactions('msg-1');
      const heart = reactions.find((r) => r.emoji === '❤️');
      expect(heart?.count).toBe(2);
      expect(heart?.users).toContain('user-1');
      expect(heart?.users).toContain('user-2');
    });
  });

  describe('removeReaction', () => {
    it('should remove a reaction', () => {
      service.addReaction('msg-1', 'user-1', '❤️');
      const result = service.removeReaction('msg-1', 'user-1', '❤️');
      expect(result).toBe(true);

      const reactions = service.getReactions('msg-1');
      expect(reactions).toHaveLength(0);
    });

    it('should return false for non-existent reaction', () => {
      const result = service.removeReaction('msg-1', 'user-1', '❤️');
      expect(result).toBe(false);
    });

    it('should only remove the specific user reaction', () => {
      service.addReaction('msg-1', 'user-1', '❤️');
      service.addReaction('msg-1', 'user-2', '❤️');

      service.removeReaction('msg-1', 'user-1', '❤️');

      const reactions = service.getReactions('msg-1');
      const heart = reactions.find((r) => r.emoji === '❤️');
      expect(heart?.count).toBe(1);
      expect(heart?.users).toContain('user-2');
    });
  });

  describe('getReactions', () => {
    it('should return empty array for message with no reactions', () => {
      const reactions = service.getReactions('msg-1');
      expect(reactions).toHaveLength(0);
    });

    it('should return reaction summaries grouped by emoji', () => {
      service.addReaction('msg-1', 'user-1', '❤️');
      service.addReaction('msg-1', 'user-2', '❤️');
      service.addReaction('msg-1', 'user-1', '😂');

      const reactions = service.getReactions('msg-1');
      expect(reactions).toHaveLength(2);

      const heart = reactions.find((r) => r.emoji === '❤️');
      expect(heart?.count).toBe(2);

      const laugh = reactions.find((r) => r.emoji === '😂');
      expect(laugh?.count).toBe(1);
    });

    it('should indicate if current user has reacted', () => {
      service.addReaction('msg-1', 'user-1', '❤️');
      service.addReaction('msg-1', 'user-2', '❤️');

      const reactions = service.getReactions('msg-1', 'user-1');
      const heart = reactions.find((r) => r.emoji === '❤️');
      expect(heart?.hasReacted).toBe(true);

      const reactionsOther = service.getReactions('msg-1', 'user-3');
      const heartOther = reactionsOther.find((r) => r.emoji === '❤️');
      expect(heartOther?.hasReacted).toBe(false);
    });
  });

  describe('getMostUsedEmojis', () => {
    it('should return most used emojis for a user', () => {
      service.addReaction('msg-1', 'user-1', '❤️');
      service.addReaction('msg-2', 'user-1', '❤️');
      service.addReaction('msg-3', 'user-1', '❤️');
      service.addReaction('msg-1', 'user-1', '😂');
      service.addReaction('msg-2', 'user-1', '😂');
      service.addReaction('msg-1', 'user-1', '🔥');

      const mostUsed = service.getMostUsedEmojis('user-1', 2);
      expect(mostUsed).toHaveLength(2);
      expect(mostUsed[0]).toBe('❤️');
      expect(mostUsed[1]).toBe('😂');
    });

    it('should return empty array for user with no reactions', () => {
      const mostUsed = service.getMostUsedEmojis('user-1', 5);
      expect(mostUsed).toHaveLength(0);
    });
  });

  describe('getReactionNotifications', () => {
    it('should return notifications for reactions by other users', () => {
      service.addReaction('msg-1', 'user-2', '❤️');
      service.addReaction('msg-1', 'user-3', '😂');

      const notifications = service.getReactionNotifications('user-1');
      expect(notifications).toHaveLength(2);
    });

    it('should not include own reactions in notifications', () => {
      service.addReaction('msg-1', 'user-1', '❤️');
      service.addReaction('msg-1', 'user-2', '😂');

      const notifications = service.getReactionNotifications('user-1');
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.userId).toBe('user-2');
    });
  });
});
