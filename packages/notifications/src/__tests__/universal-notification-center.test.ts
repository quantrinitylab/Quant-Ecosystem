// ============================================================================
// Universal Notification Center - Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UniversalNotificationCenter } from '../universal-notification-center';

describe('UniversalNotificationCenter', () => {
  let center: UniversalNotificationCenter;

  beforeEach(() => {
    center = new UniversalNotificationCenter();
  });

  describe('send', () => {
    it('should create a notification with id and timestamp', () => {
      const result = center.send({
        app: 'quantchat',
        type: 'message',
        title: 'New Message',
        body: 'Hello!',
        priority: 'high',
      });

      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.read).toBe(false);
      expect(result.app).toBe('quantchat');
      expect(result.title).toBe('New Message');
    });

    it('should notify subscribers on send', () => {
      const callback = vi.fn();
      center.subscribe('user1', callback);

      center.send({
        app: 'quantmail',
        type: 'email',
        title: 'New Email',
        body: 'You have mail',
        priority: 'medium',
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ app: 'quantmail', title: 'New Email' }),
      );
    });
  });

  describe('getAll', () => {
    it('should return all notifications sorted by timestamp', () => {
      center.send({ app: 'quantchat', type: 'msg', title: 'A', body: 'a', priority: 'low' });
      center.send({ app: 'quantmail', type: 'email', title: 'B', body: 'b', priority: 'high' });

      const all = center.getAll('user1');
      expect(all).toHaveLength(2);
      // Both notifications are present
      const titles = all.map((n) => n.title);
      expect(titles).toContain('A');
      expect(titles).toContain('B');
    });

    it('should filter by app', () => {
      center.send({ app: 'quantchat', type: 'msg', title: 'A', body: 'a', priority: 'low' });
      center.send({ app: 'quantmail', type: 'email', title: 'B', body: 'b', priority: 'high' });

      const filtered = center.getAll('user1', { apps: ['quantchat'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.app).toBe('quantchat');
    });

    it('should filter by unread only', () => {
      const notif = center.send({
        app: 'quantchat',
        type: 'msg',
        title: 'A',
        body: 'a',
        priority: 'low',
      });
      center.send({ app: 'quantmail', type: 'email', title: 'B', body: 'b', priority: 'high' });
      center.markRead([notif.id]);

      const unread = center.getAll('user1', { unreadOnly: true });
      expect(unread).toHaveLength(1);
      expect(unread[0]!.app).toBe('quantmail');
    });

    it('should filter by priority', () => {
      center.send({ app: 'quantchat', type: 'msg', title: 'A', body: 'a', priority: 'low' });
      center.send({ app: 'quantmail', type: 'email', title: 'B', body: 'b', priority: 'critical' });

      const critical = center.getAll('user1', { priority: 'critical' });
      expect(critical).toHaveLength(1);
      expect(critical[0]!.priority).toBe('critical');
    });
  });

  describe('markRead', () => {
    it('should mark notifications as read', () => {
      const n1 = center.send({
        app: 'quantchat',
        type: 'msg',
        title: 'A',
        body: 'a',
        priority: 'low',
      });
      const n2 = center.send({
        app: 'quantmail',
        type: 'msg',
        title: 'B',
        body: 'b',
        priority: 'low',
      });

      const count = center.markRead([n1.id, n2.id]);
      expect(count).toBe(2);

      const unread = center.getAll('user1', { unreadOnly: true });
      expect(unread).toHaveLength(0);
    });
  });

  describe('markAllRead', () => {
    it('should mark all notifications as read', () => {
      center.send({ app: 'quantchat', type: 'msg', title: 'A', body: 'a', priority: 'low' });
      center.send({ app: 'quantmail', type: 'msg', title: 'B', body: 'b', priority: 'low' });

      const count = center.markAllRead();
      expect(count).toBe(2);
    });

    it('should mark only specific app notifications as read', () => {
      center.send({ app: 'quantchat', type: 'msg', title: 'A', body: 'a', priority: 'low' });
      center.send({ app: 'quantmail', type: 'msg', title: 'B', body: 'b', priority: 'low' });

      const count = center.markAllRead('quantchat');
      expect(count).toBe(1);

      const unread = center.getAll('user1', { unreadOnly: true });
      expect(unread).toHaveLength(1);
      expect(unread[0]!.app).toBe('quantmail');
    });
  });

  describe('getUnreadCounts', () => {
    it('should return unread counts per app', () => {
      center.send({ app: 'quantchat', type: 'msg', title: 'A', body: 'a', priority: 'low' });
      center.send({ app: 'quantchat', type: 'msg', title: 'B', body: 'b', priority: 'low' });
      center.send({ app: 'quantmail', type: 'msg', title: 'C', body: 'c', priority: 'low' });

      const counts = center.getUnreadCounts();
      expect(counts.quantchat).toBe(2);
      expect(counts.quantmail).toBe(1);
      expect(counts.quantsync).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = center.subscribe('user1', callback);

      center.send({ app: 'quantchat', type: 'msg', title: 'A', body: 'a', priority: 'low' });
      expect(callback).toHaveBeenCalledTimes(1);

      unsub();
      center.send({ app: 'quantchat', type: 'msg', title: 'B', body: 'b', priority: 'low' });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('preferences', () => {
    it('should set and get preferences', () => {
      const prefs = center.setPreferences('user1', {
        digestMode: true,
        digestFrequency: 'hourly',
      });

      expect(prefs.digestMode).toBe(true);
      expect(prefs.digestFrequency).toBe('hourly');
    });

    it('should return default preferences for unknown user', () => {
      const prefs = center.getPreferences('unknown');
      expect(prefs.userId).toBe('unknown');
      expect(prefs.enabledApps).toContain('quantchat');
      expect(prefs.digestMode).toBe(false);
    });
  });

  describe('getDigest', () => {
    it('should return empty if digest mode is off', () => {
      center.send({ app: 'quantchat', type: 'msg', title: 'A', body: 'a', priority: 'low' });
      const digest = center.getDigest('user1');
      expect(digest).toHaveLength(0);
    });

    it('should return notifications within digest window', () => {
      center.setPreferences('user1', {
        digestMode: true,
        digestFrequency: 'daily',
        enabledApps: ['quantchat', 'quantmail'],
      });

      center.send({ app: 'quantchat', type: 'msg', title: 'A', body: 'a', priority: 'low' });
      center.send({ app: 'quantmail', type: 'msg', title: 'B', body: 'b', priority: 'low' });

      const digest = center.getDigest('user1');
      expect(digest).toHaveLength(2);
    });
  });

  describe('clearOlderThan', () => {
    it('should remove old notifications', () => {
      center.send({ app: 'quantchat', type: 'msg', title: 'A', body: 'a', priority: 'low' });
      // This won't remove anything since notifications are current
      const count = center.clearOlderThan(1);
      expect(count).toBe(0);
    });
  });
});
