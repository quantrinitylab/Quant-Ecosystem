// QuantChat - Push Notifications Service
// Mobile push notification management for messaging platform

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
  channel: ChatNotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown>;
  deepLink: string;
  timestamp: number;
  groupKey: string;
  actions: NotificationAction[];
  mediaUrl?: string;
  senderAvatar?: string;
}

export interface NotificationAction {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  inputPlaceholder?: string;
}

export type ChatNotificationChannel =
  | 'direct_message'
  | 'group_message'
  | 'incoming_call'
  | 'missed_call'
  | 'voice_note'
  | 'reaction'
  | 'typing_indicator'
  | 'message_request';

export interface ScheduledNotification {
  id: string;
  payload: NotificationPayload;
  triggerAt: number;
  repeatInterval?: 'hourly' | 'daily';
  cancelled: boolean;
}

export interface QuietHoursConfig {
  enabled: boolean;
  startHour: number;
  endHour: number;
  allowCalls: boolean;
  allowFavorites: boolean;
  favoriteContacts: string[];
}

export class PushNotificationService {
  private channels: Map<ChatNotificationChannel, NotificationChannel> = new Map();
  private unreadCount: number = 0;
  private scheduledNotifications: ScheduledNotification[] = [];
  private quietHours: QuietHoursConfig = { enabled: false, startHour: 23, endHour: 7, allowCalls: true, allowFavorites: true, favoriteContacts: [] };
  private groupedNotifications: Map<string, NotificationPayload[]> = new Map();
  private mutedConversations: Set<string> = new Set();

  constructor() {
    this.registerDefaultChannels();
  }

  private registerDefaultChannels(): void {
    const defaults: Array<[ChatNotificationChannel, NotificationChannel]> = [
      ['direct_message', { id: 'direct_message', name: 'Direct Messages', importance: 'high', sound: 'message_pop.wav', vibration: true, badge: true }],
      ['group_message', { id: 'group_message', name: 'Group Messages', importance: 'default', sound: 'group_ping.wav', vibration: true, badge: true }],
      ['incoming_call', { id: 'incoming_call', name: 'Incoming Calls', importance: 'urgent', sound: 'ringtone.wav', vibration: true, badge: false }],
      ['missed_call', { id: 'missed_call', name: 'Missed Calls', importance: 'high', sound: 'missed.wav', vibration: false, badge: true }],
      ['voice_note', { id: 'voice_note', name: 'Voice Notes', importance: 'default', sound: 'voice_note.wav', vibration: true, badge: true }],
      ['reaction', { id: 'reaction', name: 'Reactions', importance: 'low', sound: null, vibration: false, badge: false }],
      ['typing_indicator', { id: 'typing_indicator', name: 'Typing Indicators', importance: 'low', sound: null, vibration: false, badge: false }],
      ['message_request', { id: 'message_request', name: 'Message Requests', importance: 'default', sound: 'request.wav', vibration: true, badge: true }],
    ];
    defaults.forEach(([key, channel]) => this.channels.set(key, channel));
  }

  public async routeDeepLink(payload: NotificationPayload): Promise<string> {
    const { channel, data } = payload;
    switch (channel) {
      case 'direct_message': return `/chat/dm/${data.conversationId}#${data.messageId}`;
      case 'group_message': return `/chat/group/${data.groupId}#${data.messageId}`;
      case 'incoming_call': return `/chat/call/${data.callId}/incoming`;
      case 'missed_call': return `/chat/calls/missed/${data.callId}`;
      case 'voice_note': return `/chat/dm/${data.conversationId}?voiceNote=${data.noteId}`;
      case 'reaction': return `/chat/dm/${data.conversationId}#${data.messageId}`;
      case 'message_request': return `/chat/requests/${data.requestId}`;
      default: return `/chat`;
    }
  }

  public updateBadgeCount(unreadDMs: number, unreadGroups: number, missedCalls: number): number {
    this.unreadCount = unreadDMs + unreadGroups + missedCalls;
    return this.unreadCount;
  }

  public getBadgeCount(): number {
    return this.unreadCount;
  }

  public groupNotification(notification: NotificationPayload): NotificationPayload[] {
    const { groupKey } = notification;
    if (!this.groupedNotifications.has(groupKey)) {
      this.groupedNotifications.set(groupKey, []);
    }
    this.groupedNotifications.get(groupKey)!.push(notification);
    return this.groupedNotifications.get(groupKey)!;
  }

  public muteConversation(conversationId: string, duration?: number): void {
    this.mutedConversations.add(conversationId);
    if (duration) {
      setTimeout(() => this.mutedConversations.delete(conversationId), duration);
    }
  }

  public unmuteConversation(conversationId: string): void {
    this.mutedConversations.delete(conversationId);
  }

  public scheduleReminder(conversationId: string, messageId: string, triggerAt: number): ScheduledNotification {
    const payload: NotificationPayload = {
      id: `reminder_${Date.now()}`,
      channel: 'direct_message',
      title: 'Message Reminder',
      body: 'You asked to be reminded about this message',
      data: { conversationId, messageId },
      deepLink: `/chat/dm/${conversationId}#${messageId}`,
      timestamp: Date.now(),
      groupKey: conversationId,
      actions: [{ id: 'view', label: 'View Message' }],
    };
    const scheduled: ScheduledNotification = { id: `sched_${Date.now()}`, payload, triggerAt, cancelled: false };
    this.scheduledNotifications.push(scheduled);
    return scheduled;
  }

  public buildRichNotification(payload: NotificationPayload): NotificationPayload {
    const actions: NotificationAction[] = [];
    switch (payload.channel) {
      case 'direct_message':
        actions.push({ id: 'reply_inline', label: 'Reply', inputPlaceholder: 'Type a message...' }, { id: 'mark_read', label: 'Mark Read' });
        break;
      case 'incoming_call':
        actions.push({ id: 'answer', label: 'Answer' }, { id: 'decline', label: 'Decline', destructive: true }, { id: 'message', label: 'Message' });
        break;
      case 'message_request':
        actions.push({ id: 'accept', label: 'Accept' }, { id: 'block', label: 'Block', destructive: true });
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
    const conversationId = payload.data.conversationId as string;
    if (conversationId && this.mutedConversations.has(conversationId)) return false;
    if (!this.isInQuietHours()) return true;
    if (payload.channel === 'incoming_call' && this.quietHours.allowCalls) return true;
    const senderId = payload.data.senderId as string;
    if (senderId && this.quietHours.allowFavorites && this.quietHours.favoriteContacts.includes(senderId)) return true;
    return false;
  }

  public setQuietHours(config: QuietHoursConfig): void {
    this.quietHours = config;
  }

  public getChannelConfig(channel: ChatNotificationChannel): NotificationChannel | undefined {
    return this.channels.get(channel);
  }
}
