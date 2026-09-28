// QuantNeon - Push Notifications Service
// Mobile push notification management for social media/content platform

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
  channel: NeonNotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown>;
  deepLink: string;
  timestamp: number;
  groupKey: string;
  actions: NotificationAction[];
  avatarUrl?: string;
  mediaPreview?: string;
}

export interface NotificationAction {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
}

export type NeonNotificationChannel =
  | 'new_follower'
  | 'post_like'
  | 'post_comment'
  | 'post_share'
  | 'story_mention'
  | 'live_started'
  | 'trending_topic'
  | 'content_milestone';

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
  allowMentions: boolean;
}

export class PushNotificationService {
  private channels: Map<NeonNotificationChannel, NotificationChannel> = new Map();
  private badgeCount: number = 0;
  private scheduledNotifications: ScheduledNotification[] = [];
  private quietHours: QuietHoursConfig = { enabled: false, startHour: 23, endHour: 8, allowLiveStreams: true, allowMentions: true };
  private groupedNotifications: Map<string, NotificationPayload[]> = new Map();

  constructor() {
    this.registerDefaultChannels();
  }

  private registerDefaultChannels(): void {
    const defaults: Array<[NeonNotificationChannel, NotificationChannel]> = [
      ['new_follower', { id: 'new_follower', name: 'New Followers', importance: 'default', sound: 'follow.wav', vibration: true, badge: true }],
      ['post_like', { id: 'post_like', name: 'Likes', importance: 'low', sound: null, vibration: false, badge: true }],
      ['post_comment', { id: 'post_comment', name: 'Comments', importance: 'default', sound: 'comment.wav', vibration: true, badge: true }],
      ['post_share', { id: 'post_share', name: 'Shares', importance: 'default', sound: 'share.wav', vibration: false, badge: true }],
      ['story_mention', { id: 'story_mention', name: 'Story Mentions', importance: 'high', sound: 'mention.wav', vibration: true, badge: true }],
      ['live_started', { id: 'live_started', name: 'Live Streams', importance: 'high', sound: 'live_alert.wav', vibration: true, badge: true }],
      ['trending_topic', { id: 'trending_topic', name: 'Trending', importance: 'low', sound: null, vibration: false, badge: false }],
      ['content_milestone', { id: 'content_milestone', name: 'Milestones', importance: 'high', sound: 'milestone_celebrate.wav', vibration: true, badge: true }],
    ];
    defaults.forEach(([key, channel]) => this.channels.set(key, channel));
  }

  public async routeDeepLink(payload: NotificationPayload): Promise<string> {
    const { channel, data } = payload;
    switch (channel) {
      case 'new_follower': return `/profile/${data.followerId}`;
      case 'post_like': return `/posts/${data.postId}`;
      case 'post_comment': return `/posts/${data.postId}/comments/${data.commentId}`;
      case 'post_share': return `/posts/${data.postId}/shares`;
      case 'story_mention': return `/stories/${data.storyId}?mention=${data.mentionId}`;
      case 'live_started': return `/live/${data.streamId}`;
      case 'trending_topic': return `/explore/trending/${data.topicId}`;
      case 'content_milestone': return `/posts/${data.postId}/insights`;
      default: return `/feed`;
    }
  }

  public updateBadgeCount(newFollowers: number, unreadComments: number, unreadMentions: number): number {
    this.badgeCount = newFollowers + unreadComments + unreadMentions;
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
    const group = this.groupedNotifications.get(groupKey)!;
    group.push(notification);
    return group;
  }

  public buildLikeGroupSummary(postId: string): string {
    const groupKey = `likes_${postId}`;
    const notifications = this.groupedNotifications.get(groupKey) || [];
    const count = notifications.length;
    if (count === 0) return '';
    if (count === 1) return `${notifications[0].data.likerName} liked your post`;
    if (count === 2) return `${notifications[0].data.likerName} and ${notifications[1].data.likerName} liked your post`;
    return `${notifications[0].data.likerName} and ${count - 1} others liked your post`;
  }

  public schedulePostReminder(postId: string, triggerAt: number): ScheduledNotification {
    const payload: NotificationPayload = {
      id: `post_reminder_${postId}`,
      channel: 'content_milestone',
      title: 'Content Check-in',
      body: 'See how your post is performing',
      data: { postId },
      deepLink: `/posts/${postId}/insights`,
      timestamp: Date.now(),
      groupKey: `insights_${postId}`,
      actions: [{ id: 'view', label: 'View Insights' }, { id: 'boost', label: 'Boost Post' }],
    };
    const scheduled: ScheduledNotification = { id: `sched_${Date.now()}`, payload, triggerAt, cancelled: false };
    this.scheduledNotifications.push(scheduled);
    return scheduled;
  }

  public buildRichNotification(payload: NotificationPayload): NotificationPayload {
    const actions: NotificationAction[] = [];
    switch (payload.channel) {
      case 'post_comment':
        actions.push({ id: 'reply', label: 'Reply' }, { id: 'like_comment', label: 'Like' });
        break;
      case 'new_follower':
        actions.push({ id: 'follow_back', label: 'Follow Back' }, { id: 'view_profile', label: 'View Profile' });
        break;
      case 'live_started':
        actions.push({ id: 'join', label: 'Join Now' }, { id: 'remind_later', label: 'Remind Me' });
        break;
      case 'story_mention':
        actions.push({ id: 'view_story', label: 'View Story' }, { id: 'reply', label: 'Reply' });
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
    if (payload.channel === 'live_started' && this.quietHours.allowLiveStreams) return true;
    if (payload.channel === 'story_mention' && this.quietHours.allowMentions) return true;
    return false;
  }

  public setQuietHours(config: QuietHoursConfig): void {
    this.quietHours = config;
  }
}
