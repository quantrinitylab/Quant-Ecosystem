import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PresenceService } from '../services/presence.service';

describe('PresenceService', () => {
  let service: PresenceService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new PresenceService({
      awayTimeoutMs: 5000,
      offlineTimeoutMs: 10000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('setOnline', () => {
    it('should set user as online', () => {
      const presence = service.setOnline('user-1');
      expect(presence.status).toBe('online');
      expect(presence.userId).toBe('user-1');
      expect(presence.lastSeen).toBeGreaterThan(0);
    });

    it('should preserve invisible status', () => {
      service.setOnline('user-1');
      service.setStatus('user-1', 'invisible');
      const presence = service.setOnline('user-1');
      expect(presence.status).toBe('invisible');
    });

    it('should set device type', () => {
      const presence = service.setOnline('user-1', 'mobile');
      expect(presence.deviceType).toBe('mobile');
    });
  });

  describe('setOffline', () => {
    it('should set user as offline', () => {
      service.setOnline('user-1');
      const presence = service.setOffline('user-1');
      expect(presence?.status).toBe('offline');
    });

    it('should return null for unknown user', () => {
      expect(service.setOffline('unknown')).toBeNull();
    });
  });

  describe('setStatus', () => {
    it('should update status', () => {
      service.setOnline('user-1');
      const presence = service.setStatus('user-1', 'busy');
      expect(presence?.status).toBe('busy');
    });

    it('should set custom status', () => {
      service.setOnline('user-1');
      const presence = service.setStatus('user-1', 'online', 'In a meeting');
      expect(presence?.customStatus).toBe('In a meeting');
    });

    it('should return null for unknown user', () => {
      expect(service.setStatus('unknown', 'online')).toBeNull();
    });
  });

  describe('setActiveConversation', () => {
    it('should set active conversation', () => {
      service.setOnline('user-1');
      service.setActiveConversation('user-1', 'conv-1');
      const presence = service.getPresence('user-1');
      expect(presence?.activeConversationId).toBe('conv-1');
    });

    it('should clear active conversation with null', () => {
      service.setOnline('user-1');
      service.setActiveConversation('user-1', 'conv-1');
      service.setActiveConversation('user-1', null);
      const presence = service.getPresence('user-1');
      expect(presence?.activeConversationId).toBeUndefined();
    });
  });

  describe('heartbeat', () => {
    it('should update lastSeen', () => {
      service.setOnline('user-1');
      const before = service.getPresence('user-1')?.lastSeen;

      vi.advanceTimersByTime(1000);
      service.heartbeat('user-1');

      const after = service.getPresence('user-1')?.lastSeen;
      expect(after).toBeGreaterThan(before!);
    });

    it('should reset away to online', () => {
      service.setOnline('user-1');
      service.setStatus('user-1', 'away');

      service.heartbeat('user-1');
      expect(service.getPresence('user-1')?.status).toBe('online');
    });
  });

  describe('getPresence', () => {
    it('should return presence for known user', () => {
      service.setOnline('user-1');
      const presence = service.getPresence('user-1');
      expect(presence?.userId).toBe('user-1');
    });

    it('should return null for unknown user', () => {
      expect(service.getPresence('unknown')).toBeNull();
    });
  });

  describe('getBulkPresence', () => {
    it('should return presence for multiple users', () => {
      service.setOnline('user-1');
      service.setOnline('user-2');

      const bulk = service.getBulkPresence(['user-1', 'user-2', 'user-3']);
      expect(bulk.size).toBe(2);
      expect(bulk.has('user-1')).toBe(true);
      expect(bulk.has('user-2')).toBe(true);
    });
  });

  describe('getOnlineUsers', () => {
    it('should return online users', () => {
      service.setOnline('user-1');
      service.setOnline('user-2');
      service.setOnline('user-3');
      service.setStatus('user-3', 'offline');

      const online = service.getOnlineUsers();
      expect(online).toHaveLength(2);
    });

    it('should include busy users', () => {
      service.setOnline('user-1');
      service.setStatus('user-1', 'busy');

      const online = service.getOnlineUsers();
      expect(online).toHaveLength(1);
    });
  });

  describe('subscriptions', () => {
    it('should subscribe and unsubscribe', () => {
      const unsub = service.subscribe('user-1', 'user-2');
      const subscribers = service.getSubscribers('user-2');
      expect(subscribers).toContain('user-1');

      unsub();
      const after = service.getSubscribers('user-2');
      expect(after).not.toContain('user-1');
    });
  });

  describe('onStatusChange', () => {
    it('should notify on status change', () => {
      const changes: string[] = [];
      service.onStatusChange((userId) => changes.push(userId));

      service.setOnline('user-1');
      service.setStatus('user-1', 'busy');

      expect(changes).toContain('user-1');
    });

    it('should allow unsubscribing', () => {
      const changes: string[] = [];
      const unsub = service.onStatusChange((userId) => changes.push(userId));

      service.setOnline('user-1');
      unsub();
      service.setStatus('user-1', 'busy');

      expect(changes).toHaveLength(1);
    });
  });

  describe('cleanup', () => {
    it('should mark inactive users as away', () => {
      service.setOnline('user-1');
      vi.advanceTimersByTime(6000);
      service.cleanup();

      expect(service.getPresence('user-1')?.status).toBe('away');
    });

    it('should mark away users as offline', () => {
      service.setOnline('user-1');
      vi.advanceTimersByTime(6000);
      service.cleanup();

      vi.advanceTimersByTime(6000);
      service.cleanup();

      expect(service.getPresence('user-1')?.status).toBe('offline');
    });
  });

  describe('getLastSeenText', () => {
    it('should return "Online now" for online users', () => {
      service.setOnline('user-1');
      expect(service.getLastSeenText('user-1')).toBe('Online now');
    });

    it('should return "Busy" for busy users', () => {
      service.setOnline('user-1');
      service.setStatus('user-1', 'busy');
      expect(service.getLastSeenText('user-1')).toBe('Busy');
    });

    it('should return "Unknown" for unknown users', () => {
      expect(service.getLastSeenText('unknown')).toBe('Unknown');
    });

    it('should return relative time for offline users', () => {
      service.setOnline('user-1');
      service.setOffline('user-1');
      vi.advanceTimersByTime(120000);

      expect(service.getLastSeenText('user-1')).toBe('2m ago');
    });
  });
});
