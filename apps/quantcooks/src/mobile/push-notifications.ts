// QuantEdits - Push Notifications Service
// Mobile push notification management for document/content editing platform

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
  channel: EditsNotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown>;
  deepLink: string;
  timestamp: number;
  groupKey: string;
  actions: NotificationAction[];
  previewText?: string;
}

export interface NotificationAction {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  requiresAuth?: boolean;
}

export type EditsNotificationChannel =
  | 'document_shared'
  | 'comment_added'
  | 'edit_conflict'
  | 'review_requested'
  | 'suggestion_accepted'
  | 'export_ready'
  | 'collaboration_join'
  | 'version_published';

export interface ScheduledNotification {
  id: string;
  payload: NotificationPayload;
  triggerAt: number;
  repeatInterval?: 'daily' | 'weekly';
  cancelled: boolean;
}

export interface QuietHoursConfig {
  enabled: boolean;
  startHour: number;
  endHour: number;
  allowEditConflicts: boolean;
  allowReviewRequests: boolean;
}

export class PushNotificationService {
  private channels: Map<EditsNotificationChannel, NotificationChannel> = new Map();
  private badgeCount: number = 0;
  private scheduledNotifications: ScheduledNotification[] = [];
  private quietHours: QuietHoursConfig = { enabled: false, startHour: 22, endHour: 8, allowEditConflicts: true, allowReviewRequests: false };
  private groupedNotifications: Map<string, NotificationPayload[]> = new Map();

  constructor() {
    this.registerDefaultChannels();
  }

  private registerDefaultChannels(): void {
    const defaults: Array<[EditsNotificationChannel, NotificationChannel]> = [
      ['document_shared', { id: 'document_shared', name: 'Shared Documents', importance: 'high', sound: 'share_doc.wav', vibration: true, badge: true }],
      ['comment_added', { id: 'comment_added', name: 'Comments', importance: 'default', sound: 'comment.wav', vibration: true, badge: true }],
      ['edit_conflict', { id: 'edit_conflict', name: 'Edit Conflicts', importance: 'urgent', sound: 'conflict_alert.wav', vibration: true, badge: true }],
      ['review_requested', { id: 'review_requested', name: 'Review Requests', importance: 'high', sound: 'review.wav', vibration: true, badge: true }],
      ['suggestion_accepted', { id: 'suggestion_accepted', name: 'Suggestions', importance: 'low', sound: null, vibration: false, badge: false }],
      ['export_ready', { id: 'export_ready', name: 'Exports', importance: 'default', sound: 'export_done.wav', vibration: false, badge: true }],
      ['collaboration_join', { id: 'collaboration_join', name: 'Collaborators', importance: 'default', sound: 'join.wav', vibration: false, badge: false }],
      ['version_published', { id: 'version_published', name: 'Published Versions', importance: 'high', sound: 'published.wav', vibration: true, badge: true }],
    ];
    defaults.forEach(([key, channel]) => this.channels.set(key, channel));
  }

  public async routeDeepLink(payload: NotificationPayload): Promise<string> {
    const { channel, data } = payload;
    switch (channel) {
      case 'document_shared': return `/docs/${data.documentId}`;
      case 'comment_added': return `/docs/${data.documentId}/comments/${data.commentId}`;
      case 'edit_conflict': return `/docs/${data.documentId}/conflicts/${data.conflictId}`;
      case 'review_requested': return `/docs/${data.documentId}/review/${data.reviewId}`;
      case 'suggestion_accepted': return `/docs/${data.documentId}/suggestions`;
      case 'export_ready': return `/docs/${data.documentId}/exports/${data.exportId}`;
      case 'collaboration_join': return `/docs/${data.documentId}`;
      case 'version_published': return `/docs/${data.documentId}/versions/${data.versionId}`;
      default: return `/docs/recent`;
    }
  }

  public updateBadgeCount(pendingReviews: number, unreadComments: number, conflicts: number): number {
    this.badgeCount = pendingReviews + unreadComments + conflicts;
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

  public scheduleReviewReminder(documentId: string, reviewerId: string, triggerAt: number): ScheduledNotification {
    const payload: NotificationPayload = {
      id: `review_reminder_${documentId}`,
      channel: 'review_requested',
      title: 'Review Reminder',
      body: 'You have a pending document review',
      data: { documentId, reviewerId },
      deepLink: `/docs/${documentId}/review`,
      timestamp: Date.now(),
      groupKey: `review_${documentId}`,
      actions: [{ id: 'review_now', label: 'Review Now' }, { id: 'snooze', label: 'Snooze 1hr' }],
    };
    const scheduled: ScheduledNotification = { id: `sched_${Date.now()}`, payload, triggerAt, cancelled: false };
    this.scheduledNotifications.push(scheduled);
    return scheduled;
  }

  public buildRichNotification(payload: NotificationPayload): NotificationPayload {
    const actions: NotificationAction[] = [];
    switch (payload.channel) {
      case 'document_shared':
        actions.push({ id: 'open', label: 'Open' }, { id: 'download', label: 'Download' });
        break;
      case 'comment_added':
        actions.push({ id: 'reply', label: 'Reply' }, { id: 'resolve', label: 'Resolve' });
        break;
      case 'edit_conflict':
        actions.push({ id: 'resolve', label: 'Resolve Now', requiresAuth: true }, { id: 'keep_mine', label: 'Keep Mine' }, { id: 'keep_theirs', label: 'Keep Theirs' });
        break;
      case 'review_requested':
        actions.push({ id: 'approve', label: 'Approve', requiresAuth: true }, { id: 'request_changes', label: 'Request Changes' });
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
    if (payload.channel === 'edit_conflict' && this.quietHours.allowEditConflicts) return true;
    if (payload.channel === 'review_requested' && this.quietHours.allowReviewRequests) return true;
    return false;
  }

  public setQuietHours(config: QuietHoursConfig): void {
    this.quietHours = config;
  }
}
