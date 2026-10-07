// ============================================================================
// Notification Fanout - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationFanout } from '../services/notification-fanout';
import { PreferenceService } from '../services/preference-service';

describe('NotificationFanout', () => {
  let fanout: NotificationFanout;
  let preferenceService: PreferenceService;

  beforeEach(() => {
    preferenceService = new PreferenceService();
    fanout = new NotificationFanout(preferenceService);
  });

  describe('fanout', () => {
    it('should route to all recipients with default preferences', () => {
      const result = fanout.fanout({
        type: 'message',
        sourceApp: 'quantchat',
        title: 'New message',
        body: 'Hello!',
        recipientIds: ['user-1', 'user-2'],
        priority: 'high',
      });

      expect(result.totalRecipients).toBe(2);
      expect(result.routedCount).toBe(2);
      expect(result.blockedCount).toBe(0);
      expect(result.eventType).toBe('message');
      expect(result.sourceApp).toBe('quantchat');
    });

    it('should include channels in routing decisions', () => {
      const result = fanout.fanout({
        type: 'message',
        sourceApp: 'quantchat',
        title: 'New message',
        body: 'Hello!',
        recipientIds: ['user-1'],
        priority: 'high',
      });

      const routing = result.routed[0];
      expect(routing).toBeDefined();
      expect(routing!.userId).toBe('user-1');
      expect(routing!.channels.length).toBeGreaterThan(0);
      expect(routing!.blocked).toBe(false);
    });

    it('should block notifications when user has globally disabled', () => {
      preferenceService.updatePreferences('user-1', { globalEnabled: false });

      const result = fanout.fanout({
        type: 'message',
        sourceApp: 'quantchat',
        title: 'New message',
        body: 'Hello!',
        recipientIds: ['user-1'],
        priority: 'normal',
      });

      expect(result.blockedCount).toBe(1);
      expect(result.routedCount).toBe(0);
      const routing = result.routed[0];
      expect(routing!.blocked).toBe(true);
      expect(routing!.reason).toBe('preferences_blocked');
    });

    it('should respect quiet hours blocking', () => {
      // Set quiet hours to all day (always active)
      preferenceService.setQuietHours('user-1', {
        enabled: true,
        startTime: '00:00',
        endTime: '23:59',
        timezone: 'UTC',
        allowCritical: false,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      });

      const result = fanout.fanout({
        type: 'message',
        sourceApp: 'quantchat',
        title: 'New message',
        body: 'Hello!',
        recipientIds: ['user-1'],
        priority: 'normal',
      });

      expect(result.blockedCount).toBe(1);
      expect(result.routed[0]!.blocked).toBe(true);
    });

    it('should override priority to high when user is mentioned', () => {
      const result = fanout.fanout({
        type: 'message',
        sourceApp: 'quantchat',
        title: 'New message',
        body: 'Hey @user-1!',
        recipientIds: ['user-1', 'user-2'],
        priority: 'low',
        mentionedUserIds: ['user-1'],
      });

      const user1Routing = result.routed.find((r) => r.userId === 'user-1');
      const user2Routing = result.routed.find((r) => r.userId === 'user-2');

      expect(user1Routing!.priority).toBe('high');
      expect(user2Routing!.priority).toBe('low');
    });

    it('should not escalate above critical for mentioned users', () => {
      const result = fanout.fanout({
        type: 'alert',
        sourceApp: 'quantchat',
        title: 'Critical alert',
        body: 'System down',
        recipientIds: ['user-1'],
        priority: 'critical',
        mentionedUserIds: ['user-1'],
      });

      expect(result.routed[0]!.priority).toBe('critical');
    });

    it('should handle empty recipient list', () => {
      const result = fanout.fanout({
        type: 'message',
        sourceApp: 'quantchat',
        title: 'Test',
        body: 'Test',
        recipientIds: [],
        priority: 'normal',
      });

      expect(result.totalRecipients).toBe(0);
      expect(result.routedCount).toBe(0);
      expect(result.blockedCount).toBe(0);
    });

    it('should handle mixed recipients (some blocked, some not)', () => {
      preferenceService.updatePreferences('user-2', { globalEnabled: false });

      const result = fanout.fanout({
        type: 'message',
        sourceApp: 'quantchat',
        title: 'New message',
        body: 'Hello!',
        recipientIds: ['user-1', 'user-2', 'user-3'],
        priority: 'high',
      });

      expect(result.totalRecipients).toBe(3);
      expect(result.routedCount).toBe(2);
      expect(result.blockedCount).toBe(1);
    });
  });
});
