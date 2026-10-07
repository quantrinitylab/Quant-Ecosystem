// QuantUbe - Push Notifications Service
// Mobile push notification management for video platform

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
  channel: TubeNotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown>;
  deepLink: string;
  timestamp: number;
  groupKey: string;
  actions: NotificationAction[];
  thumbnailUrl?: string;
}

export interface NotificationAction {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
}

export type TubeNotificationChannel =
  | 'new_upload'
  | 'comment_reply'
  | 'subscriber_milestone'
  | 'live_stream'
  | 'video_processed'
  | 'monetization_update'
  | 'copyright_claim'
  | 'community_post';

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
  allowLiveStreams: boolean;
  allowCopyrightClaims: boolean;
}

export class PushNotificationService {
  private channels: Map<TubeNotificationChannel, NotificationChannel> = new Map();
  private badgeCount: number = 0;
  private scheduledNotifications: ScheduledNotification[] = [];
  private quietHours: QuietHoursConfig = { enabled: false, startHour: 23, endHour: 8, allowLiveStreams: true, allowCopyrightClaims: true };
  private groupedNotifications: Map<string, NotificationPayload[]> = new Map();
  private subscribedChannels: Set<string> = new Set();

  constructor() {
    this.registerDefaultChannels();
  }

  private registerDefaultChannels(): void {
    const defaults: Array<[TubeNotificationChannel, NotificationChannel]> = [
      ['new_upload', { id: 'new_upload', name: 'New Uploads', importance: 'high', sound: 'new_video.wav', vibration: true, badge: true }],
      ['comment_reply', { id: 'comment_reply', name: 'Comment Replies', importance: 'default', sound: 'comment.wav', vibration: true, badge: true }],
      ['subscriber_milestone', { id: 'subscriber_milestone', name: 'Subscriber Milestones', importance: 'high', sound: 'milestone.wav', vibration: true, badge: true }],
      ['live_stream', { id: 'live_stream', name: 'Live Streams', importance: 'high', sound: 'live_now.wav', vibration: true, badge: true }],
      ['video_processed', { id: 'video_processed', name: 'Video Processing', importance: 'default', sound: 'processed.wav', vibration: false, badge: true }],
      ['monetization_update', { id: 'monetization_update', name: 'Monetization', importance: 'default', sound: 'money.wav', vibration: false, badge: true }],
      ['copyright_claim', { id: 'copyright_claim', name: 'Copyright Claims', importance: 'urgent', sound: 'copyright_alert.wav', vibration: true, badge: true }],
      ['community_post', { id: 'community_post', name: 'Community', importance: 'low', sound: null, vibration: false, badge: false }],
    ];
    defaults.forEach(([key, channel]) => this.channels.set(key, channel));
  }

  public async routeDeepLink(payload: NotificationPayload): Promise<string> {
    const { channel, data } = payload;
    switch (channel) {
      case 'new_upload': return `/video/${data.videoId}`;
      case 'comment_reply': return `/video/${data.videoId}/comments/${data.commentId}`;
      case 'subscriber_milestone': return `/channel/${data.channelId}/analytics`;
      case 'live_stream': return `/live/${data.streamId}`;
      case 'video_processed': return `/studio/videos/${data.videoId}`;
      case 'monetization_update': return `/studio/monetization/${data.reportId}`;
      case 'copyright_claim': return `/studio/copyright/${data.claimId}`;
      case 'community_post': return `/channel/${data.channelId}/community/${data.postId}`;
      default: return `/home`;
    }
  }

  public subscribeToChannel(channelId: string): void {
    this.subscribedChannels.add(channelId);
  }

  public unsubscribeFromChannel(channelId: string): void {
    this.subscribedChannels.delete(channelId);
  }

  public isSubscribed(channelId: string): boolean {
    return this.subscribedChannels.has(channelId);
  }

  public updateBadgeCount(newVideos: number, unreadComments: number, pendingClaims: number): number {
    this.badgeCount = newVideos + unreadComments + pendingClaims;
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

  public scheduleUploadReminder(channelId: string, triggerAt: number): ScheduledNotification {
    const payload: NotificationPayload = {
      id: `upload_reminder_${channelId}`,
      channel: 'new_upload',
      title: 'Upload Reminder',
      body: 'Time to upload your next video',
      data: { channelId },
      deepLink: `/studio/upload`,
      timestamp: Date.now(),
      groupKey: `upload_${channelId}`,
      actions: [{ id: 'upload', label: 'Upload Now' }, { id: 'snooze', label: 'Remind Later' }],
    };
    const scheduled: ScheduledNotification = { id: `sched_${Date.now()}`, payload, triggerAt, repeatInterval: 'weekly', cancelled: false };
    this.scheduledNotifications.push(scheduled);
    return scheduled;
  }

  public buildRichNotification(payload: NotificationPayload): NotificationPayload {
    const actions: NotificationAction[] = [];
    switch (payload.channel) {
      case 'new_upload':
        actions.push({ id: 'watch', label: 'Watch Now' }, { id: 'save', label: 'Watch Later' }, { id: 'share', label: 'Share' });
        break;
      case 'comment_reply':
        actions.push({ id: 'reply', label: 'Reply' }, { id: 'like', label: 'Like' });
        break;
      case 'copyright_claim':
        actions.push({ id: 'review', label: 'Review Claim' }, { id: 'dispute', label: 'Dispute' });
        break;
      case 'live_stream':
        actions.push({ id: 'watch', label: 'Watch Live' }, { id: 'remind', label: 'Notify When Available' });
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
    if (payload.channel === 'live_stream' && this.quietHours.allowLiveStreams) return true;
    if (payload.channel === 'copyright_claim' && this.quietHours.allowCopyrightClaims) return true;
    return false;
  }

  public setQuietHours(config: QuietHoursConfig): void {
    this.quietHours = config;
  }
}
