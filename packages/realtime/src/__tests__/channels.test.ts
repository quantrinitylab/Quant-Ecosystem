// ============================================================================
// Channel Manager Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelManager } from '../channels';

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  describe('createChannel', () => {
    it('should create a new channel', () => {
      const channel = manager.createChannel({ name: 'room1', type: 'public' });
      expect(channel.name).toBe('room1');
      expect(channel.type).toBe('public');
      expect(channel.members.size).toBe(0);
    });

    it('should return existing channel if already exists', () => {
      const ch1 = manager.createChannel({ name: 'room1', type: 'public' });
      const ch2 = manager.createChannel({ name: 'room1', type: 'private' });
      expect(ch1).toBe(ch2);
    });
  });

  describe('join', () => {
    it('should add a member to a channel', () => {
      manager.createChannel({ name: 'room1', type: 'public' });
      const result = manager.join('room1', 'user1');
      expect(result).toBe(true);
      expect(manager.isMember('room1', 'user1')).toBe(true);
    });

    it('should return false for non-existent channel', () => {
      const result = manager.join('nonexistent', 'user1');
      expect(result).toBe(false);
    });

    it('should enforce max members', () => {
      manager.createChannel({ name: 'room1', type: 'public', maxMembers: 2 });
      manager.join('room1', 'user1');
      manager.join('room1', 'user2');
      const result = manager.join('room1', 'user3');
      expect(result).toBe(false);
    });

    it('should track user channels', () => {
      manager.createChannel({ name: 'room1', type: 'public' });
      manager.createChannel({ name: 'room2', type: 'public' });
      manager.join('room1', 'user1');
      manager.join('room2', 'user1');
      expect(manager.getUserChannels('user1')).toContain('room1');
      expect(manager.getUserChannels('user1')).toContain('room2');
    });
  });

  describe('leave', () => {
    it('should remove a member from a channel', () => {
      manager.createChannel({ name: 'room1', type: 'public' });
      manager.join('room1', 'user1');
      manager.leave('room1', 'user1');
      expect(manager.isMember('room1', 'user1')).toBe(false);
    });

    it('should destroy empty non-persistent channels', () => {
      manager.createChannel({ name: 'room1', type: 'public' });
      manager.join('room1', 'user1');
      manager.leave('room1', 'user1');
      expect(manager.getChannel('room1')).toBeUndefined();
    });

    it('should keep persistent channels even when empty', () => {
      manager.createChannel({ name: 'room1', type: 'public', persistent: true });
      manager.join('room1', 'user1');
      manager.leave('room1', 'user1');
      expect(manager.getChannel('room1')).toBeDefined();
    });

    it('should return false for non-existent channel', () => {
      expect(manager.leave('nonexistent', 'user1')).toBe(false);
    });
  });

  describe('leaveAll', () => {
    it('should remove user from all channels', () => {
      manager.createChannel({ name: 'room1', type: 'public', persistent: true });
      manager.createChannel({ name: 'room2', type: 'public', persistent: true });
      manager.join('room1', 'user1');
      manager.join('room2', 'user1');
      manager.leaveAll('user1');
      expect(manager.isMember('room1', 'user1')).toBe(false);
      expect(manager.isMember('room2', 'user1')).toBe(false);
    });

    it('should handle user with no channels', () => {
      manager.leaveAll('unknown-user');
      // No error thrown
    });
  });

  describe('broadcastToChannel', () => {
    it('should notify channel handlers', () => {
      manager.createChannel({ name: 'room1', type: 'public' });
      const handler = vi.fn();
      manager.subscribe('room1', handler);
      manager.broadcastToChannel('room1', {
        id: 'evt1',
        type: 'message',
        channel: 'room1',
        payload: { text: 'hello' },
        senderId: 'user1',
        timestamp: Date.now(),
      });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should store message in history', () => {
      manager.createChannel({ name: 'room1', type: 'public' });
      manager.broadcastToChannel('room1', {
        id: 'evt1',
        type: 'message',
        channel: 'room1',
        payload: { text: 'hello' },
        senderId: 'user1',
        timestamp: Date.now(),
      });
      const history = manager.getHistory('room1');
      expect(history).toHaveLength(1);
      expect(history[0]!.id).toBe('evt1');
    });

    it('should limit history size', () => {
      manager.createChannel({ name: 'room1', type: 'public', historyLimit: 3 });
      const channel = manager.getChannel('room1')!;
      channel.metadata.historyLimit = 3;
      for (let i = 0; i < 5; i++) {
        manager.broadcastToChannel('room1', {
          id: `evt${i}`,
          type: 'message',
          channel: 'room1',
          payload: { text: `msg${i}` },
          senderId: 'user1',
          timestamp: Date.now(),
        });
      }
      const history = manager.getHistory('room1');
      expect(history.length).toBeLessThanOrEqual(4);
    });

    it('should do nothing for non-existent channel', () => {
      // Should not throw
      manager.broadcastToChannel('nonexistent', {
        id: 'evt1',
        type: 'message',
        channel: 'nonexistent',
        payload: {},
        senderId: 'user1',
        timestamp: Date.now(),
      });
    });
  });

  describe('subscribe', () => {
    it('should return unsubscribe function', () => {
      manager.createChannel({ name: 'room1', type: 'public' });
      const handler = vi.fn();
      const unsub = manager.subscribe('room1', handler);
      manager.broadcastToChannel('room1', {
        id: 'evt1',
        type: 'message',
        channel: 'room1',
        payload: {},
        senderId: 'user1',
        timestamp: Date.now(),
      });
      expect(handler).toHaveBeenCalledTimes(1);
      unsub();
      manager.broadcastToChannel('room1', {
        id: 'evt2',
        type: 'message',
        channel: 'room1',
        payload: {},
        senderId: 'user1',
        timestamp: Date.now(),
      });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMembers', () => {
    it('should return channel members', () => {
      manager.createChannel({ name: 'room1', type: 'public' });
      manager.join('room1', 'user1');
      manager.join('room1', 'user2');
      const members = manager.getMembers('room1');
      expect(members).toHaveLength(2);
    });

    it('should return empty for non-existent channel', () => {
      expect(manager.getMembers('nonexistent')).toHaveLength(0);
    });
  });

  describe('destroyChannel', () => {
    it('should remove channel and clean up members', () => {
      manager.createChannel({ name: 'room1', type: 'public' });
      manager.join('room1', 'user1');
      manager.destroyChannel('room1');
      expect(manager.getChannel('room1')).toBeUndefined();
      expect(manager.getUserChannels('user1')).not.toContain('room1');
    });
  });

  describe('Redis pub/sub integration (mocked)', () => {
    it('should publish to Redis when broadcasting', () => {
      const mockRedis = {
        publish: vi.fn().mockResolvedValue(1),
        sadd: vi.fn().mockResolvedValue(1),
        srem: vi.fn().mockResolvedValue(1),
        del: vi.fn().mockResolvedValue(1),
      };
      const mockRedisSub = {
        subscribe: vi.fn().mockResolvedValue(undefined),
      };

      const redisManager = new ChannelManager({
        redis: mockRedis as never,
        redisSub: mockRedisSub as never,
      });

      redisManager.createChannel({ name: 'room1', type: 'public' });
      redisManager.join('room1', 'user1');
      redisManager.broadcastToChannel('room1', {
        id: 'evt1',
        type: 'message',
        channel: 'room1',
        payload: { text: 'hello' },
        senderId: 'user1',
        timestamp: Date.now(),
      });

      expect(mockRedis.publish).toHaveBeenCalled();
      expect(mockRedis.sadd).toHaveBeenCalled();
    });

    it('should subscribe to Redis channel on join', () => {
      const mockRedis = {
        publish: vi.fn().mockResolvedValue(1),
        sadd: vi.fn().mockResolvedValue(1),
        srem: vi.fn().mockResolvedValue(1),
        del: vi.fn().mockResolvedValue(1),
      };
      const mockRedisSub = {
        subscribe: vi.fn().mockResolvedValue(undefined),
      };

      const redisManager = new ChannelManager({
        redis: mockRedis as never,
        redisSub: mockRedisSub as never,
      });

      redisManager.createChannel({ name: 'room1', type: 'public' });
      redisManager.join('room1', 'user1');

      expect(mockRedisSub.subscribe).toHaveBeenCalledWith('realtime:channel:room1');
    });

    it('should remove member from Redis on leave', () => {
      const mockRedis = {
        publish: vi.fn().mockResolvedValue(1),
        sadd: vi.fn().mockResolvedValue(1),
        srem: vi.fn().mockResolvedValue(1),
        del: vi.fn().mockResolvedValue(1),
      };
      const mockRedisSub = {
        subscribe: vi.fn().mockResolvedValue(undefined),
      };

      const redisManager = new ChannelManager({
        redis: mockRedis as never,
        redisSub: mockRedisSub as never,
      });

      redisManager.createChannel({ name: 'room1', type: 'public', persistent: true });
      redisManager.join('room1', 'user1');
      redisManager.leave('room1', 'user1');

      expect(mockRedis.srem).toHaveBeenCalledWith('realtime:channel:room1:members', 'user1');
    });
  });

  describe('counts', () => {
    it('should track channel count', () => {
      manager.createChannel({ name: 'room1', type: 'public', persistent: true });
      manager.createChannel({ name: 'room2', type: 'public', persistent: true });
      expect(manager.getChannelCount()).toBe(2);
    });

    it('should track connected user count', () => {
      manager.createChannel({ name: 'room1', type: 'public' });
      manager.join('room1', 'user1');
      manager.join('room1', 'user2');
      expect(manager.getConnectedUserCount()).toBe(2);
    });
  });
});
