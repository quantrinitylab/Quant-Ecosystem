import { describe, it, expect, beforeEach } from 'vitest';
import { CloseFriendsService } from '../services/close-friends.service';

describe('CloseFriendsService', () => {
  let service: CloseFriendsService;

  beforeEach(() => {
    service = new CloseFriendsService();
  });

  describe('add', () => {
    it('should add a user to close friends', () => {
      const friend = service.add('user-1');
      expect(friend.userId).toBe('user-1');
      expect(friend.addedAt).toBeGreaterThan(0);
    });

    it('should not duplicate an existing close friend', () => {
      service.add('user-1');
      service.add('user-1');
      expect(service.getCount()).toBe(1);
    });
  });

  describe('remove', () => {
    it('should remove a close friend', () => {
      service.add('user-1');
      expect(service.remove('user-1')).toBe(true);
      expect(service.isCloseFriend('user-1')).toBe(false);
    });

    it('should return false for non-existent user', () => {
      expect(service.remove('user-1')).toBe(false);
    });
  });

  describe('getList', () => {
    it('should return all close friends', () => {
      service.add('user-1');
      service.add('user-2');
      const list = service.getList();
      expect(list).toHaveLength(2);
    });

    it('should return empty list initially', () => {
      expect(service.getList()).toHaveLength(0);
    });
  });

  describe('isCloseFriend', () => {
    it('should return true for close friend', () => {
      service.add('user-1');
      expect(service.isCloseFriend('user-1')).toBe(true);
    });

    it('should return false for non-close-friend', () => {
      expect(service.isCloseFriend('user-1')).toBe(false);
    });
  });

  describe('getCount', () => {
    it('should return 0 initially', () => {
      expect(service.getCount()).toBe(0);
    });

    it('should return correct count', () => {
      service.add('user-1');
      service.add('user-2');
      service.add('user-3');
      expect(service.getCount()).toBe(3);
    });
  });

  describe('shareToCloseFriends', () => {
    it('should return count of friends shared with', () => {
      service.add('user-1');
      service.add('user-2');
      const result = service.shareToCloseFriends('post-1');
      expect(result.sharedWith).toBe(2);
    });

    it('should return 0 when no close friends', () => {
      const result = service.shareToCloseFriends('post-1');
      expect(result.sharedWith).toBe(0);
    });
  });

  describe('getSuggestions', () => {
    it('should suggest users based on interaction frequency', () => {
      service.recordInteraction('user-a');
      service.recordInteraction('user-a');
      service.recordInteraction('user-b');
      service.recordInteraction('user-b');
      service.recordInteraction('user-b');
      service.recordInteraction('user-c');

      const suggestions = service.getSuggestions(2);
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0]).toBe('user-b');
      expect(suggestions[1]).toBe('user-a');
    });

    it('should not suggest existing close friends', () => {
      service.add('user-a');
      service.recordInteraction('user-a');
      service.recordInteraction('user-a');
      service.recordInteraction('user-b');

      const suggestions = service.getSuggestions(5);
      expect(suggestions).not.toContain('user-a');
      expect(suggestions).toContain('user-b');
    });

    it('should return empty array with no interactions', () => {
      expect(service.getSuggestions(5)).toHaveLength(0);
    });

    it('should respect limit', () => {
      service.recordInteraction('user-a');
      service.recordInteraction('user-b');
      service.recordInteraction('user-c');

      const suggestions = service.getSuggestions(1);
      expect(suggestions).toHaveLength(1);
    });
  });
});
