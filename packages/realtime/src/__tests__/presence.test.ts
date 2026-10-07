// ============================================================================
// Presence Manager Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PresenceManager } from '../presence';

describe('PresenceManager', () => {
  let manager: PresenceManager;

  beforeEach(() => {
    manager = new PresenceManager();
  });

  describe('setOnline', () => {
    it('should set user as online', () => {
      manager.setOnline('user1', 'quantchat');
      const presence = manager.getPresence('user1');
      expect(presence).not.toBeNull();
      expect(presence!.status).toBe('online');
      expect(presence!.activeApp).toBe('quantchat');
      expect(presence!.connectedDevices).toBe(1);
    });

    it('should increment connected devices on multiple connections', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setOnline('user1', 'quantmail');
      const presence = manager.getPresence('user1');
      expect(presence!.connectedDevices).toBe(2);
    });

    it('should preserve invisible status', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setStatus('user1', 'invisible');
      manager.setOnline('user1', 'quantmail');
      const presence = manager.getPresence('user1');
      expect(presence!.status).toBe('invisible');
    });
  });

  describe('setOffline', () => {
    it('should decrement devices on disconnect', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setOnline('user1', 'quantmail');
      manager.setOffline('user1');
      const presence = manager.getPresence('user1');
      expect(presence!.connectedDevices).toBe(1);
      expect(presence!.status).not.toBe('offline');
    });

    it('should set offline when last device disconnects', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setOffline('user1');
      const presence = manager.getPresence('user1');
      expect(presence!.status).toBe('offline');
      expect(presence!.connectedDevices).toBe(0);
    });

    it('should do nothing for unknown user', () => {
      manager.setOffline('unknown');
      // No error thrown
    });
  });

  describe('setStatus', () => {
    it('should update user status', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setStatus('user1', 'busy');
      expect(manager.getPresence('user1')!.status).toBe('busy');
    });

    it('should update custom status', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setStatus('user1', 'busy', 'In a meeting');
      expect(manager.getPresence('user1')!.customStatus).toBe('In a meeting');
    });

    it('should do nothing for unknown user', () => {
      manager.setStatus('unknown', 'busy');
      expect(manager.getPresence('unknown')).toBeNull();
    });
  });

  describe('heartbeat', () => {
    it('should update lastActivity', () => {
      manager.setOnline('user1', 'quantchat');
      const before = manager.getPresence('user1')!.lastActivity;
      // Heartbeat updates lastActivity to current time
      manager.heartbeat('user1');
      const after = manager.getPresence('user1')!.lastActivity;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('should reset away status on activity', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setStatus('user1', 'away');
      manager.heartbeat('user1');
      expect(manager.getPresence('user1')!.status).toBe('online');
    });

    it('should update active app', () => {
      manager.setOnline('user1', 'quantchat');
      manager.heartbeat('user1', 'quantmail');
      expect(manager.getPresence('user1')!.activeApp).toBe('quantmail');
    });

    it('should do nothing for unknown user', () => {
      manager.heartbeat('unknown');
      // No error
    });
  });

  describe('getBulkPresence', () => {
    it('should return presence for multiple users', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setOnline('user2', 'quantmail');
      const bulk = manager.getBulkPresence(['user1', 'user2', 'user3']);
      expect(bulk.size).toBe(2);
      expect(bulk.has('user1')).toBe(true);
      expect(bulk.has('user2')).toBe(true);
      expect(bulk.has('user3')).toBe(false);
    });
  });

  describe('getOnline (async)', () => {
    it('should return online users (in-memory)', async () => {
      manager.setOnline('user1', 'quantchat');
      manager.setOnline('user2', 'quantmail');
      const entries = await manager.getOnline();
      expect(entries.length).toBe(2);
    });

    it('should not include offline users', async () => {
      manager.setOnline('user1', 'quantchat');
      manager.setOffline('user1');
      const entries = await manager.getOnline();
      expect(entries.length).toBe(0);
    });
  });

  describe('subscriptions', () => {
    it('should subscribe to presence changes', () => {
      const handler = vi.fn();
      manager.setOnline('user1', 'quantchat');
      manager.onPresenceChange('user1', handler);
      manager.setStatus('user1', 'busy');
      expect(handler).toHaveBeenCalled();
    });

    it('should unsubscribe from presence changes', () => {
      const handler = vi.fn();
      manager.setOnline('user1', 'quantchat');
      const unsub = manager.onPresenceChange('user1', handler);
      unsub();
      manager.setStatus('user1', 'busy');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should support user-to-user subscriptions', () => {
      manager.setOnline('user1', 'quantchat');
      const unsub = manager.subscribe('user2', 'user1');
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('should enforce max subscriptions', () => {
      const smallManager = new PresenceManager({ maxSubscriptionsPerUser: 2 });
      smallManager.subscribe('user1', 'target1');
      smallManager.subscribe('user1', 'target2');
      expect(() => {
        smallManager.subscribe('user1', 'target3');
      }).toThrow('Maximum presence subscriptions reached');
    });
  });

  describe('getOnlineCount', () => {
    it('should count online users', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setOnline('user2', 'quantmail');
      manager.setOnline('user3', 'quantchat');
      manager.setStatus('user3', 'away');
      expect(manager.getOnlineCount()).toBe(3);
    });

    it('should not count offline users', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setOffline('user1');
      expect(manager.getOnlineCount()).toBe(0);
    });
  });

  describe('getOnlineInApp', () => {
    it('should return users online in specific app', () => {
      manager.setOnline('user1', 'quantchat');
      manager.setOnline('user2', 'quantmail');
      manager.setOnline('user3', 'quantchat');
      const chatUsers = manager.getOnlineInApp('quantchat');
      expect(chatUsers).toContain('user1');
      expect(chatUsers).toContain('user3');
      expect(chatUsers).not.toContain('user2');
    });
  });

  describe('cleanup', () => {
    it('should mark inactive users as away', () => {
      const fastManager = new PresenceManager({
        awayTimeoutMs: 100,
        offlineTimeoutMs: 200,
      });
      fastManager.setOnline('user1', 'quantchat');
      // Manually set lastActivity to past
      const state = fastManager.getPresence('user1')!;
      state.lastActivity = Date.now() - 150;
      fastManager.cleanup();
      expect(fastManager.getPresence('user1')!.status).toBe('away');
    });

    it('should mark long-inactive users as offline', () => {
      const fastManager = new PresenceManager({
        awayTimeoutMs: 50,
        offlineTimeoutMs: 100,
      });
      fastManager.setOnline('user1', 'quantchat');
      const state = fastManager.getPresence('user1')!;
      state.lastActivity = Date.now() - 200;
      state.status = 'away';
      fastManager.cleanup();
      expect(fastManager.getPresence('user1')!.status).toBe('offline');
    });
  });

  describe('Redis ZSET integration (mocked)', () => {
    it('should call ZADD on setOnline', () => {
      const mockRedis = {
        zadd: vi.fn().mockResolvedValue(1),
        hmset: vi.fn().mockResolvedValue('OK'),
        zrem: vi.fn().mockResolvedValue(1),
        hset: vi.fn().mockResolvedValue(1),
        publish: vi.fn().mockResolvedValue(1),
        zrangebyscore: vi.fn().mockResolvedValue([]),
        zremrangebyscore: vi.fn().mockResolvedValue(0),
        hgetall: vi.fn().mockResolvedValue({}),
      };
      const redisManager = new PresenceManager({ redis: mockRedis as never });
      redisManager.setOnline('user1', 'quantchat');
      expect(mockRedis.zadd).toHaveBeenCalled();
      expect(mockRedis.hmset).toHaveBeenCalled();
    });

    it('should call ZREM on setOffline', () => {
      const mockRedis = {
        zadd: vi.fn().mockResolvedValue(1),
        hmset: vi.fn().mockResolvedValue('OK'),
        zrem: vi.fn().mockResolvedValue(1),
        hset: vi.fn().mockResolvedValue(1),
        publish: vi.fn().mockResolvedValue(1),
        zrangebyscore: vi.fn().mockResolvedValue([]),
        zremrangebyscore: vi.fn().mockResolvedValue(0),
        hgetall: vi.fn().mockResolvedValue({}),
      };
      const redisManager = new PresenceManager({ redis: mockRedis as never });
      redisManager.setOnline('user1', 'quantchat');
      redisManager.setOffline('user1');
      expect(mockRedis.zrem).toHaveBeenCalledWith('presence:active', 'user1');
    });

    it('should call ZADD on heartbeat', () => {
      const mockRedis = {
        zadd: vi.fn().mockResolvedValue(1),
        hmset: vi.fn().mockResolvedValue('OK'),
        zrem: vi.fn().mockResolvedValue(1),
        hset: vi.fn().mockResolvedValue(1),
        publish: vi.fn().mockResolvedValue(1),
        zrangebyscore: vi.fn().mockResolvedValue([]),
        zremrangebyscore: vi.fn().mockResolvedValue(0),
        hgetall: vi.fn().mockResolvedValue({}),
      };
      const redisManager = new PresenceManager({ redis: mockRedis as never });
      redisManager.setOnline('user1', 'quantchat');
      mockRedis.zadd.mockClear();
      redisManager.heartbeat('user1');
      expect(mockRedis.zadd).toHaveBeenCalled();
    });

    it('should use ZRANGEBYSCORE for getOnline', async () => {
      const mockRedis = {
        zadd: vi.fn().mockResolvedValue(1),
        hmset: vi.fn().mockResolvedValue('OK'),
        zrem: vi.fn().mockResolvedValue(1),
        hset: vi.fn().mockResolvedValue(1),
        publish: vi.fn().mockResolvedValue(1),
        zrangebyscore: vi.fn().mockResolvedValue(['user1', 'user2']),
        zremrangebyscore: vi.fn().mockResolvedValue(0),
        hgetall: vi
          .fn()
          .mockResolvedValue({ status: 'online', app: 'quantchat', lastSeen: '1000' }),
      };
      const redisManager = new PresenceManager({ redis: mockRedis as never });
      const entries = await redisManager.getOnline();
      expect(mockRedis.zrangebyscore).toHaveBeenCalled();
      expect(entries).toHaveLength(2);
    });

    it('should use ZREMRANGEBYSCORE on cleanup', () => {
      const mockRedis = {
        zadd: vi.fn().mockResolvedValue(1),
        hmset: vi.fn().mockResolvedValue('OK'),
        zrem: vi.fn().mockResolvedValue(1),
        hset: vi.fn().mockResolvedValue(1),
        publish: vi.fn().mockResolvedValue(1),
        zrangebyscore: vi.fn().mockResolvedValue([]),
        zremrangebyscore: vi.fn().mockResolvedValue(0),
        hgetall: vi.fn().mockResolvedValue({}),
      };
      const redisManager = new PresenceManager({ redis: mockRedis as never });
      redisManager.cleanup();
      expect(mockRedis.zremrangebyscore).toHaveBeenCalled();
    });
  });
});
