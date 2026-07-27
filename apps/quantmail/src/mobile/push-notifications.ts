// QuantMail - Push Notifications Service
// Mobile push notification management for email platform

export interface NotificationChannel {
  id: string;
  name: string;
  importance: 'urgent' | 'high' | 'default' | 'low';
  sound: string | null;
  vibration: boolean;
  badge: boolean;
}

export interface NotificationPayload {
  id: string;
  channel: MailNotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown>;
  deepLink: string;
  timestamp: number;
  groupKey: string;
  actions: NotificationAction[];
  mediaUrl?: string;
}

export interface NotificationAction {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  requiresAuth?: boolean;
}

export type MailNotificationChannel =
  | 'new_email'
  | 'reply'
  | 'mention'
  | 'calendar_invite'
  | 'attachment_ready'
  | 'security_alert'
  | 'newsletter'
  | 'spam_digest';

export interface ScheduledNotification {
  id: string;
  payload: NotificationPayload;
  triggerAt: number;
  repeatInterval?: 'daily' | 'weekly' | 'monthly';
  cancelled: boolean;
}

export interface QuietHoursConfig {
  enabled: boolean;
  startHour: number;
  endHour: number;
  allowUrgent: boolean;
  allowedSenders: string[];
}

export class PushNotificationService {
  private channels: Map<MailNotificationChannel, NotificationChannel> = new Map();
  private badgeCount: number = 0;
  private scheduledNotifications: ScheduledNotification[] = [];
  private quietHours: QuietHoursConfig = {
    enabled: false,
    startHour: 22,
    endHour: 7,
    allowUrgent: true,
    allowedSenders: [],
  };
  private groupedNotifications: Map<string, NotificationPayload[]> = new Map();

  constructor() {
    this.registerDefaultChannels();
  }

  private registerDefaultChannels(): void {
    const defaults: Array<[MailNotificationChannel, NotificationChannel]> = [
      [
        'new_email',
        {
          id: 'new_email',
          name: 'New Emails',
          importance: 'high',
          sound: 'mail_received.wav',
          vibration: true,
          badge: true,
        },
      ],
      [
        'reply',
        {
          id: 'reply',
          name: 'Replies',
          importance: 'high',
          sound: 'reply.wav',
          vibration: true,
          badge: true,
        },
      ],
      [
        'mention',
        {
          id: 'mention',
          name: 'Mentions',
          importance: 'urgent',
          sound: 'mention_alert.wav',
          vibration: true,
          badge: true,
        },
      ],
      [
        'calendar_invite',
        {
          id: 'calendar_invite',
          name: 'Calendar Invites',
          importance: 'default',
          sound: 'calendar.wav',
          vibration: false,
          badge: true,
        },
      ],
      [
        'attachment_ready',
        {
          id: 'attachment_ready',
          name: 'Attachments Ready',
          importance: 'low',
          sound: null,
          vibration: false,
          badge: false,
        },
      ],
      [
        'security_alert',
        {
          id: 'security_alert',
          name: 'Security Alerts',
          importance: 'urgent',
          sound: 'alert_critical.wav',
          vibration: true,
          badge: true,
        },
      ],
      [
        'newsletter',
        {
          id: 'newsletter',
          name: 'Newsletters',
          importance: 'low',
          sound: null,
          vibration: false,
          badge: false,
        },
      ],
      [
        'spam_digest',
        {
          id: 'spam_digest',
          name: 'Spam Digest',
          importance: 'low',
          sound: null,
          vibration: false,
          badge: false,
        },
      ],
    ];
    defaults.forEach(([key, channel]) => this.channels.set(key, channel));
  }

  public async routeDeepLink(payload: NotificationPayload): Promise<string> {
    const { channel, data } = payload;
    switch (channel) {
      case 'new_email':
        return `/mail/inbox/${data.emailId}`;
      case 'reply':
        return `/mail/thread/${data.threadId}#${data.messageId}`;
      case 'mention':
        return `/mail/thread/${data.threadId}?highlight=${data.mentionId}`;
      case 'calendar_invite':
        return `/calendar/event/${data.eventId}`;
      case 'attachment_ready':
        return `/mail/inbox/${data.emailId}/attachments`;
      case 'security_alert':
        return `/settings/security/alerts/${data.alertId}`;
      case 'newsletter':
        return `/mail/newsletters/${data.emailId}`;
      case 'spam_digest':
        return `/mail/spam`;
      default:
        return `/mail/inbox`;
    }
  }

  public updateBadgeCount(unreadEmails: number, unreadMentions: number): number {
    this.badgeCount = unreadEmails + unreadMentions;
    return this.badgeCount;
  }

  public getBadgeCount(): number {
    return this.badgeCount;
  }

  public groupNotification(notification: NotificationPayload): NotificationPayload[] {
    const { groupKey } = notification;
    if (!this.groupedNotifications.has(groupKey)) {
      this.groupedNotifications.set(groupKey, []);
    }
    this.groupedNotifications.get(groupKey)!.push(notification);
    return this.groupedNotifications.get(groupKey)!;
  }

  public scheduleNotification(
    payload: NotificationPayload,
    triggerAt: number,
    repeatInterval?: 'daily' | 'weekly' | 'monthly',
  ): ScheduledNotification {
    const scheduled: ScheduledNotification = {
      id: `sched_${crypto.randomUUID()}`,
      payload,
      triggerAt,
      repeatInterval,
      cancelled: false,
    };
    this.scheduledNotifications.push(scheduled);
    return scheduled;
  }

  public cancelScheduledNotification(id: string): boolean {
    const notification = this.scheduledNotifications.find((n) => n.id === id);
    if (notification) {
      notification.cancelled = true;
      return true;
    }
    return false;
  }

  public buildRichNotification(payload: NotificationPayload): NotificationPayload {
    const actions: NotificationAction[] = [];
    switch (payload.channel) {
      case 'new_email':
        actions.push(
          { id: 'reply', label: 'Reply' },
          { id: 'archive', label: 'Archive' },
          { id: 'delete', label: 'Delete', destructive: true },
        );
        break;
      case 'calendar_invite':
        actions.push(
          { id: 'accept', label: 'Accept' },
          { id: 'decline', label: 'Decline', destructive: true },
          { id: 'tentative', label: 'Maybe' },
        );
        break;
      case 'security_alert':
        actions.push(
          { id: 'review', label: 'Review Now', requiresAuth: true },
          { id: 'dismiss', label: 'Dismiss' },
        );
        break;
    }
    return { ...payload, actions };
  }

  public isInQuietHours(): boolean {
    if (!this.quietHours.enabled) return false;
    const hour = new Date().getHours();
    if (this.quietHours.startHour > this.quietHours.endHour) {
      return hour >= this.quietHours.startHour || hour < this.quietHours.endHour;
    }
    return hour >= this.quietHours.startHour && hour < this.quietHours.endHour;
  }

  public shouldDeliverNotification(payload: NotificationPayload): boolean {
    if (!this.isInQuietHours()) return true;
    const channel = this.channels.get(payload.channel);
    if (channel?.importance === 'urgent' && this.quietHours.allowUrgent) return true;
    return false;
  }

  public setQuietHours(config: QuietHoursConfig): void {
    this.quietHours = config;
  }

  public getChannelConfig(channel: MailNotificationChannel): NotificationChannel | undefined {
    return this.channels.get(channel);
  }

  public clearNotificationGroup(groupKey: string): void {
    this.groupedNotifications.delete(groupKey);
  }
}
