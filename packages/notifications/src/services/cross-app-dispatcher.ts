// ============================================================================
// Cross-App Notification Dispatcher
// Simplifies notification dispatch from app backends
// ============================================================================

import { NotificationFanout } from './notification-fanout';
import type { FanoutEvent, FanoutResult } from './notification-fanout';
import type { NotificationType, NotificationPriority, DeliveryChannel } from '../types';
import type { PreferenceService } from './preference-service';

/**
 * Minimal interface matching the methods NotificationFanout actually calls
 * on PreferenceService. This avoids unsafe `as never` casts while keeping
 * the default preferences lightweight.
 */
type MinimalPreferenceService = Pick<PreferenceService, 'shouldNotify' | 'getChannelsForEvent'>;

export interface CrossAppNotification {
  type: NotificationType;
  title: string;
  body: string;
  recipientIds: string[];
  priority?: NotificationPriority;
  data?: Record<string, unknown>;
  mentionedUserIds?: string[];
}

/**
 * CrossAppDispatcher provides a simple interface for app backends
 * to dispatch notifications to users across the ecosystem.
 */
export class CrossAppDispatcher {
  private sourceApp: string;
  private fanout: NotificationFanout;

  constructor(sourceApp: string) {
    this.sourceApp = sourceApp;
    // Default preference service that always allows notifications on in_app + push
    const defaultPrefs = {
      shouldNotify: (
        _userId: string,
        _type: NotificationType,
        _priority: NotificationPriority,
      ): boolean => true,
      getChannelsForEvent: (
        _userId: string,
        _type: NotificationType,
        priority: NotificationPriority,
      ): DeliveryChannel[] => {
        if (priority === 'critical') return ['push', 'in_app', 'email'];
        if (priority === 'high') return ['push', 'in_app'];
        return ['in_app'];
      },
    };
    this.fanout = new NotificationFanout(
      defaultPrefs as MinimalPreferenceService as PreferenceService,
    );
  }

  /**
   * Dispatch a notification to recipients.
   */
  dispatch(notification: CrossAppNotification): FanoutResult {
    const event: FanoutEvent = {
      type: notification.type,
      sourceApp: this.sourceApp,
      title: notification.title,
      body: notification.body,
      recipientIds: notification.recipientIds,
      priority: notification.priority || 'normal',
      data: notification.data,
      mentionedUserIds: notification.mentionedUserIds,
    };
    return this.fanout.fanout(event);
  }

  /**
   * Send a message notification.
   */
  notifyNewMessage(
    recipientIds: string[],
    senderName: string,
    preview: string,
    conversationId: string,
  ): FanoutResult {
    return this.dispatch({
      type: 'message',
      title: `New message from ${senderName}`,
      body: preview.slice(0, 100),
      recipientIds,
      priority: 'normal',
      data: { conversationId, senderName },
    });
  }

  /**
   * Send an email notification.
   */
  notifyNewEmail(
    recipientIds: string[],
    senderName: string,
    subject: string,
    emailId: string,
  ): FanoutResult {
    return this.dispatch({
      type: 'message',
      title: `New email from ${senderName}`,
      body: subject,
      recipientIds,
      priority: 'normal',
      data: { emailId, senderName },
    });
  }

  /**
   * Send a mention notification.
   */
  notifyMention(
    recipientIds: string[],
    mentionerName: string,
    context: string,
    sourceUrl?: string,
  ): FanoutResult {
    return this.dispatch({
      type: 'mention',
      title: `${mentionerName} mentioned you`,
      body: context.slice(0, 100),
      recipientIds,
      priority: 'high',
      mentionedUserIds: recipientIds,
      data: { mentionerName, sourceUrl },
    });
  }
}
