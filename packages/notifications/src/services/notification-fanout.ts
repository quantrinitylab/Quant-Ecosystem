// ============================================================================
// Notifications - Notification Fanout Service
// Routes events to recipients through appropriate channels based on preferences
// ============================================================================

import type { PreferenceService } from './preference-service';
import type { DeliveryChannel, NotificationPriority, NotificationType } from '../types';

/** Fanout event input */
export interface FanoutEvent {
  type: NotificationType;
  sourceApp: string;
  title: string;
  body: string;
  recipientIds: string[];
  priority: NotificationPriority;
  data?: Record<string, unknown>;
  mentionedUserIds?: string[];
}

/** Per-recipient routing decision */
export interface RecipientRouting {
  userId: string;
  channels: DeliveryChannel[];
  priority: NotificationPriority;
  blocked: boolean;
  reason?: string;
}

/** Result of the fanout operation */
export interface FanoutResult {
  eventType: NotificationType;
  sourceApp: string;
  totalRecipients: number;
  routed: RecipientRouting[];
  blockedCount: number;
  routedCount: number;
}

/**
 * NotificationFanout - Routes notification events to recipients.
 *
 * For each recipient:
 * - Checks user preferences via PreferenceService.shouldNotify()
 * - Determines delivery channels via PreferenceService.getChannelsForEvent()
 * - Applies mention detection for priority escalation
 * - Returns per-recipient channel routing decisions
 */
export class NotificationFanout {
  private preferenceService: PreferenceService;

  constructor(preferenceService: PreferenceService) {
    this.preferenceService = preferenceService;
  }

  /**
   * Fan out an event to all recipients, respecting preferences.
   */
  fanout(event: FanoutEvent): FanoutResult {
    const routed: RecipientRouting[] = [];
    let blockedCount = 0;
    let routedCount = 0;

    for (const userId of event.recipientIds) {
      const routing = this.routeForRecipient(userId, event);
      routed.push(routing);

      if (routing.blocked) {
        blockedCount++;
      } else {
        routedCount++;
      }
    }

    return {
      eventType: event.type,
      sourceApp: event.sourceApp,
      totalRecipients: event.recipientIds.length,
      routed,
      blockedCount,
      routedCount,
    };
  }

  /**
   * Determine routing for a single recipient.
   */
  private routeForRecipient(userId: string, event: FanoutEvent): RecipientRouting {
    // Determine effective priority (mentions escalate to high)
    const effectivePriority = this.getEffectivePriority(userId, event);

    // Check if user should be notified at all
    const shouldNotify = this.preferenceService.shouldNotify(userId, event.type, effectivePriority);

    if (!shouldNotify) {
      return {
        userId,
        channels: [],
        priority: effectivePriority,
        blocked: true,
        reason: 'preferences_blocked',
      };
    }

    // Get channels for this event type and priority
    const channels = this.preferenceService.getChannelsForEvent(
      userId,
      event.type,
      effectivePriority,
    );

    if (channels.length === 0) {
      return {
        userId,
        channels: [],
        priority: effectivePriority,
        blocked: true,
        reason: 'no_channels_available',
      };
    }

    return {
      userId,
      channels,
      priority: effectivePriority,
      blocked: false,
    };
  }

  /**
   * Determine effective priority considering mentions.
   * If user is mentioned, priority is escalated to at least 'high'.
   */
  private getEffectivePriority(userId: string, event: FanoutEvent): NotificationPriority {
    if (event.mentionedUserIds && event.mentionedUserIds.includes(userId)) {
      // Mentions always escalate to high (but not above critical)
      if (event.priority === 'critical') {
        return 'critical';
      }
      return 'high';
    }
    return event.priority;
  }
}
