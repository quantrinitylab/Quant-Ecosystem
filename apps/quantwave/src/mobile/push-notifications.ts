// QuantSync - Push Notifications Service
// Mobile push notification management for file sync/cloud storage platform

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
  channel: SyncNotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown>;
  deepLink: string;
  timestamp: number;
  groupKey: string;
  actions: NotificationAction[];
  progressPercent?: number;
}

export interface NotificationAction {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  requiresAuth?: boolean;
}

export type SyncNotificationChannel =
  | 'sync_complete'
  | 'sync_conflict'
  | 'storage_warning'
  | 'file_shared'
  | 'upload_complete'
  | 'download_ready'
  | 'device_connected'
  | 'backup_reminder';

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
  allowSyncConflicts: boolean;
  allowStorageWarnings: boolean;
}

export class PushNotificationService {
  private channels: Map<SyncNotificationChannel, NotificationChannel> = new Map();
  private badgeCount: number = 0;
  private scheduledNotifications: ScheduledNotification[] = [];
  private quietHours: QuietHoursConfig = { enabled: false, startHour: 22, endHour: 7, allowSyncConflicts: true, allowStorageWarnings: true };
  private groupedNotifications: Map<string, NotificationPayload[]> = new Map();

  constructor() {
    this.registerDefaultChannels();
  }

  private registerDefaultChannels(): void {
    const defaults: Array<[SyncNotificationChannel, NotificationChannel]> = [
      ['sync_complete', { id: 'sync_complete', name: 'Sync Complete', importance: 'low', sound: null, vibration: false, badge: false }],
      ['sync_conflict', { id: 'sync_conflict', name: 'Sync Conflicts', importance: 'urgent', sound: 'conflict_alert.wav', vibration: true, badge: true }],
      ['storage_warning', { id: 'storage_warning', name: 'Storage Warnings', importance: 'high', sound: 'storage_alert.wav', vibration: true, badge: true }],
      ['file_shared', { id: 'file_shared', name: 'File Shares', importance: 'default', sound: 'share.wav', vibration: true, badge: true }],
      ['upload_complete', { id: 'upload_complete', name: 'Uploads', importance: 'low', sound: 'upload_done.wav', vibration: false, badge: false }],
      ['download_ready', { id: 'download_ready', name: 'Downloads', importance: 'default', sound: 'download_ready.wav', vibration: false, badge: true }],
      ['device_connected', { id: 'device_connected', name: 'Devices', importance: 'default', sound: 'device.wav', vibration: false, badge: false }],
      ['backup_reminder', { id: 'backup_reminder', name: 'Backup Reminders', importance: 'high', sound: 'backup.wav', vibration: true, badge: true }],
    ];
    defaults.forEach(([key, channel]) => this.channels.set(key, channel));
  }

  public async routeDeepLink(payload: NotificationPayload): Promise<string> {
    const { channel, data } = payload;
    switch (channel) {
      case 'sync_complete': return `/files/${data.folderId}`;
      case 'sync_conflict': return `/files/${data.fileId}/conflicts/${data.conflictId}`;
      case 'storage_warning': return `/settings/storage`;
      case 'file_shared': return `/files/shared/${data.shareId}`;
      case 'upload_complete': return `/files/${data.folderId}/${data.fileId}`;
      case 'download_ready': return `/files/downloads/${data.downloadId}`;
      case 'device_connected': return `/settings/devices/${data.deviceId}`;
      case 'backup_reminder': return `/settings/backup`;
      default: return `/files`;
    }
  }

  public updateBadgeCount(conflicts: number, pendingShares: number, storageAlerts: number): number {
    this.badgeCount = conflicts + pendingShares + storageAlerts;
    return this.badgeCount;
  }

  public getBadgeCount(): number {
    return this.badgeCount;
  }

  public checkStorageThreshold(usedBytes: number, totalBytes: number): NotificationPayload | null {
    const ratio = usedBytes / totalBytes;
    if (ratio >= 0.9) {
      return {
        id: `storage_warn_${Date.now()}`,
        channel: 'storage_warning',
        title: 'Storage Almost Full',
        body: `You're using ${Math.round(ratio * 100)}% of your storage (${this.formatBytes(usedBytes)}/${this.formatBytes(totalBytes)})`,
        data: { usedBytes, totalBytes, ratio },
        deepLink: '/settings/storage',
        timestamp: Date.now(),
        groupKey: 'storage_warnings',
        actions: [{ id: 'manage', label: 'Manage Storage' }, { id: 'upgrade', label: 'Upgrade Plan' }],
      };
    }
    return null;
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  public groupNotification(notification: NotificationPayload): NotificationPayload[] {
    const { groupKey } = notification;
    if (!this.groupedNotifications.has(groupKey)) {
      this.groupedNotifications.set(groupKey, []);
    }
    this.groupedNotifications.get(groupKey)!.push(notification);
    return this.groupedNotifications.get(groupKey)!;
  }

  public scheduleBackupReminder(triggerAt: number): ScheduledNotification {
    const payload: NotificationPayload = {
      id: `backup_reminder_${Date.now()}`,
      channel: 'backup_reminder',
      title: 'Backup Reminder',
      body: 'It has been a while since your last backup',
      data: {},
      deepLink: '/settings/backup',
      timestamp: Date.now(),
      groupKey: 'backup_reminders',
      actions: [{ id: 'backup_now', label: 'Backup Now' }, { id: 'snooze', label: 'Remind Tomorrow' }],
    };
    const scheduled: ScheduledNotification = { id: `sched_${Date.now()}`, payload, triggerAt, repeatInterval: 'weekly', cancelled: false };
    this.scheduledNotifications.push(scheduled);
    return scheduled;
  }

  public buildRichNotification(payload: NotificationPayload): NotificationPayload {
    const actions: NotificationAction[] = [];
    switch (payload.channel) {
      case 'sync_conflict':
        actions.push({ id: 'resolve', label: 'Resolve', requiresAuth: true }, { id: 'keep_local', label: 'Keep Local' }, { id: 'keep_remote', label: 'Keep Remote' });
        break;
      case 'file_shared':
        actions.push({ id: 'view', label: 'View File' }, { id: 'save', label: 'Save to My Files' }, { id: 'decline', label: 'Decline', destructive: true });
        break;
      case 'storage_warning':
        actions.push({ id: 'cleanup', label: 'Clean Up' }, { id: 'upgrade', label: 'Upgrade' });
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
    if (payload.channel === 'sync_conflict' && this.quietHours.allowSyncConflicts) return true;
    if (payload.channel === 'storage_warning' && this.quietHours.allowStorageWarnings) return true;
    return false;
  }

  public setQuietHours(config: QuietHoursConfig): void {
    this.quietHours = config;
  }
}
