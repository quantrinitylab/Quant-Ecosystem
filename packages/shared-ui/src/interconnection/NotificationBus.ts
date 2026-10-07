// ============================================================================
// Quant Ecosystem - Real-Time Unified Notification Bus
// ============================================================================

import type { CoreQuantAppId, UnifiedNotificationItem, AppNotificationBadgeCount } from './types';

export class NotificationBus {
  private static instance: NotificationBus | null = null;
  private notifications: UnifiedNotificationItem[] = [];
  private listeners: Set<(items: UnifiedNotificationItem[]) => void> = new Set();
  private wsConnection: WebSocket | null = null;

  private constructor() {
    this.seedInitialNotifications();
    this.initRealtimeConnection();
  }

  public static getInstance(): NotificationBus {
    if (!NotificationBus.instance) {
      NotificationBus.instance = new NotificationBus();
    }
    return NotificationBus.instance;
  }

  private seedInitialNotifications(): void {
    const now = Date.now();
    this.notifications = [
      {
        id: 'notif-1',
        app: 'quantmail',
        title: 'New Contract from Acme Corp',
        body: 'Sarah Connor attached contract_nda_final.pdf for your immediate signature.',
        timestamp: now - 300000,
        read: false,
        severity: 'important',
        category: 'message',
        deepLink: 'https://mail.quant.network/inbox/notif-1',
        actions: [
          { actionId: 'open_mail', label: 'Review & Sign', primary: true },
          { actionId: 'archive', label: 'Archive' },
        ],
      },
      {
        id: 'notif-2',
        app: 'quantgram',
        title: 'Elena commented on your Reel',
        body: '"The AI lighting workflow you demonstrated here is incredible! 🔥"',
        timestamp: now - 900000,
        read: false,
        severity: 'normal',
        category: 'social_reaction',
        mediaThumbnailUrl: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=100',
        deepLink: 'https://gram.quant.network/reel/202',
        actions: [
          { actionId: 'view_reel', label: 'View Reel', primary: true },
          { actionId: 'reply_comment', label: 'Quick Reply' },
        ],
      },
      {
        id: 'notif-3',
        app: 'quantchat',
        title: 'Quant Team Standup Live Audio Stage',
        body: 'Arjun started a voice discussion in #engineering. 8 team members joined.',
        timestamp: now - 1800000,
        read: false,
        severity: 'normal',
        category: 'message',
        deepLink: 'https://chat.quant.network/channel/engineering',
        actions: [{ actionId: 'join_audio', label: 'Join Room', primary: true }],
      },
      {
        id: 'notif-4',
        app: 'quantai',
        title: 'QuantAI Autonomous Agent Task Finished',
        body: 'Full codebase security audit completed. 0 critical vulnerabilities found.',
        timestamp: now - 3600000,
        read: true,
        severity: 'low',
        category: 'task_complete',
        deepLink: 'https://ai.quant.network/canvas/task-audit',
        actions: [{ actionId: 'view_canvas', label: 'Open Canvas', primary: true }],
      },
      {
        id: 'notif-5',
        app: 'quantads',
        title: 'Ad Campaign Budget Threshold Met',
        body: 'Fall Launch Campaign achieved 4.2x ROAS. 100k impressions reached.',
        timestamp: now - 7200000,
        read: true,
        severity: 'low',
        category: 'system',
        deepLink: 'https://ads.quant.network/campaigns/fall',
      },
    ];
  }

  private initRealtimeConnection(): void {
    if (typeof window === 'undefined') return;

    try {
      const wsUrl =
        window.location.protocol === 'https:'
          ? 'wss://ws.quant.network/notifications'
          : 'ws://localhost:4000/notifications';

      // Connect or reconnect gracefully
      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.onmessage = (event) => {
        try {
          const item: UnifiedNotificationItem = JSON.parse(event.data);
          this.pushNotification(item);
        } catch {
          // ignore invalid websocket frames
        }
      };

      this.wsConnection.onerror = () => {
        // Fallback to polling or quiet mode in dev
      };
    } catch {
      // Offline mode
    }
  }

  public pushNotification(item: UnifiedNotificationItem): void {
    this.notifications.unshift(item);
    this.notifySubscribers();
  }

  public getNotifications(appFilter?: CoreQuantAppId): UnifiedNotificationItem[] {
    if (!appFilter) return this.notifications;
    return this.notifications.filter((n) => n.app === appFilter);
  }

  public getBadgeSummary(): AppNotificationBadgeCount[] {
    const map = new Map<CoreQuantAppId, { unreadCount: number; hasUrgent: boolean }>();

    for (const notif of this.notifications) {
      if (!notif.read) {
        const curr = map.get(notif.app) || { unreadCount: 0, hasUrgent: false };
        curr.unreadCount++;
        if (notif.severity === 'important' || notif.severity === 'critical') {
          curr.hasUrgent = true;
        }
        map.set(notif.app, curr);
      }
    }

    const result: AppNotificationBadgeCount[] = [];
    map.forEach((val, app) => {
      result.push({ app, unreadCount: val.unreadCount, hasUrgent: val.hasUrgent });
    });
    return result;
  }

  public getTotalUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  public markAsRead(id: string): void {
    const item = this.notifications.find((n) => n.id === id);
    if (item) {
      item.read = true;
      this.notifySubscribers();
    }
  }

  public markAllAsRead(appId?: CoreQuantAppId): void {
    this.notifications.forEach((n) => {
      if (!appId || n.app === appId) {
        n.read = true;
      }
    });
    this.notifySubscribers();
  }

  public subscribe(callback: (items: UnifiedNotificationItem[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.notifications);

    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifySubscribers(): void {
    this.listeners.forEach((cb) => cb([...this.notifications]));
  }
}
