// ============================================================================
// Notifications Package - Type Definitions
// ============================================================================

/** Notification type categories */
export type NotificationType =
  | 'message'
  | 'mention'
  | 'comment'
  | 'like'
  | 'follow'
  | 'share'
  | 'system'
  | 'alert'
  | 'reminder'
  | 'promotion'
  | 'update'
  | 'security'
  | 'billing'
  | 'achievement'
  | 'invitation';

/** Priority levels for notification delivery */
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

/** Delivery channels */
export type DeliveryChannel = 'push' | 'in_app' | 'email' | 'sms' | 'webhook';

/** Notification delivery status */
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'read';

/** Push notification platform */
export type PushPlatform = 'fcm' | 'apns' | 'web_push';

/** Core notification payload */
export interface NotificationPayload {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  recipientId: string;
  senderId?: string;
  channels: DeliveryChannel[];
  data?: Record<string, unknown>;
  richMedia?: RichMedia;
  actions?: NotificationAction[];
  deepLink?: DeepLinkAction;
  groupId?: string;
  threadId?: string;
  expiresAt?: number;
  createdAt: number;
  scheduledFor?: number;
}

/** Rich media attachment */
export interface RichMedia {
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  alt?: string;
}

/** Notification action button */
export interface NotificationAction {
  id: string;
  label: string;
  type: 'open_url' | 'deep_link' | 'dismiss' | 'reply' | 'custom';
  value: string;
  icon?: string;
}

/** Deep link action */
export interface DeepLinkAction {
  screen: string;
  params: Record<string, unknown>;
  fallbackUrl?: string;
}

/** Device registration for push notifications */
export interface DeviceToken {
  id: string;
  userId: string;
  token: string;
  platform: PushPlatform;
  deviceId: string;
  deviceName?: string;
  osVersion?: string;
  appVersion?: string;
  registeredAt: number;
  lastActiveAt: number;
  isActive: boolean;
}

/** Push notification send request */
export interface PushSendRequest {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  badge?: number;
  sound?: string;
  image?: string;
  ttl?: number;
  collapseKey?: string;
}

/** Push delivery result */
export interface PushDeliveryResult {
  id: string;
  userId: string;
  deviceId: string;
  platform: PushPlatform;
  status: DeliveryStatus;
  sentAt: number;
  deliveredAt?: number;
  error?: string;
  messageId?: string;
}

/** In-app notification */
export interface InAppNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  recipientId: string;
  senderId?: string;
  read: boolean;
  readAt?: number;
  dismissed: boolean;
  dismissedAt?: number;
  richMedia?: RichMedia;
  actions?: NotificationAction[];
  deepLink?: DeepLinkAction;
  groupId?: string;
  createdAt: number;
  expiresAt?: number;
}

/** Email digest configuration */
export interface DigestConfig {
  id: string;
  userId: string;
  frequency: DigestFrequency;
  enabledTypes: NotificationType[];
  preferredTime: string; // HH:mm format
  timezone: string;
  lastSentAt?: number;
  nextScheduledAt?: number;
  isActive: boolean;
}

/** Digest frequency options */
export type DigestFrequency = 'realtime' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'never';

/** Digest content */
export interface DigestContent {
  id: string;
  userId: string;
  frequency: DigestFrequency;
  period: { start: number; end: number };
  notifications: InAppNotification[];
  summary: DigestSummary;
  generatedAt: number;
}

/** Digest summary */
export interface DigestSummary {
  totalNotifications: number;
  byType: Record<string, number>;
  highlights: string[];
  unreadCount: number;
}

/** Scheduled notification */
export interface ScheduledNotification {
  id: string;
  payload: NotificationPayload;
  scheduledFor: number;
  timezone: string;
  recurrence?: RecurrenceRule;
  status: 'scheduled' | 'processing' | 'sent' | 'cancelled' | 'failed';
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttemptAt?: number;
}

/** Recurrence rule for scheduled notifications */
export interface RecurrenceRule {
  pattern: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
  interval?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  endAfterOccurrences?: number;
  endDate?: number;
}

/** Notification group for batching */
export interface NotificationGroup {
  id: string;
  type: NotificationType;
  recipientId: string;
  notifications: InAppNotification[];
  count: number;
  lastUpdatedAt: number;
  summary: string;
  collapsed: boolean;
}

/** User notification preferences */
export interface NotificationPreferences {
  userId: string;
  globalEnabled: boolean;
  channels: ChannelPreferences;
  typePreferences: Map<NotificationType, TypePreference>;
  quietHours: QuietHoursConfig;
  digest: DigestConfig;
  updatedAt: number;
}

/** Per-channel preference */
export interface ChannelPreferences {
  push: { enabled: boolean; sound: boolean; badge: boolean; vibrate: boolean };
  in_app: { enabled: boolean; popup: boolean; sound: boolean };
  email: { enabled: boolean; frequency: DigestFrequency };
  sms: { enabled: boolean; criticalOnly: boolean };
  webhook: { enabled: boolean; url?: string };
}

/** Per-type notification preference */
export interface TypePreference {
  enabled: boolean;
  channels: DeliveryChannel[];
  priority: NotificationPriority;
  muted: boolean;
  muteUntil?: number;
}

/** Quiet hours configuration */
export interface QuietHoursConfig {
  enabled: boolean;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  timezone: string;
  allowCritical: boolean;
  daysOfWeek: number[]; // 0-6 (Sun-Sat)
}

/** Notification service configuration */
export interface NotificationServiceConfig {
  maxRetries: number;
  retryDelayMs: number;
  batchSize: number;
  rateLimitPerUser: number;
  rateLimitWindowMs: number;
  defaultTtlMs: number;
  enableDigest: boolean;
  enableScheduling: boolean;
}

// ============================================================================
// Phase 27 - Enhanced Notification Types
// ============================================================================

/** Notification urgency levels per category */
export type NotificationUrgency = 'critical' | 'high' | 'normal' | 'low' | 'background';

/** Notification category for urgency mapping */
export type NotificationCategory =
  | 'message'
  | 'mention'
  | 'security'
  | 'billing'
  | 'social'
  | 'system'
  | 'marketing';

/** Default urgency per category */
export const CATEGORY_URGENCY: Record<NotificationCategory, NotificationUrgency> = {
  security: 'critical',
  billing: 'high',
  mention: 'high',
  message: 'normal',
  social: 'low',
  system: 'normal',
  marketing: 'background',
};

/** DND (Do Not Disturb) schedule configuration */
export interface DndConfig {
  enabled: boolean;
  schedule: DndSchedule[];
  timezone: string;
  allowCritical: boolean;
}

/** A single DND schedule block */
export interface DndSchedule {
  daysOfWeek: number[]; // 0-6 (Sun-Sat)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/** Snooze duration presets */
export type SnoozeDuration = '15min' | '1hr' | 'tomorrow' | 'next_active';

/** Snooze options for a notification */
export interface SnoozeOptions {
  duration: SnoozeDuration;
  customMs?: number;
}

/** Snoozed notification record */
export interface SnoozedNotification {
  notificationId: string;
  userId: string;
  snoozedAt: number;
  resumeAt: number;
  duration: SnoozeDuration;
}

/** Notification preview privacy level */
export type PreviewPrivacy = 'hidden' | 'subject' | 'full';

/** Per-thread mute configuration */
export interface ThreadMuteConfig {
  threadId: string;
  userId: string;
  mutedAt: number;
  muteUntil?: number; // undefined = indefinite
}

/** Inline reply payload */
export interface InlineReplyPayload {
  notificationId: string;
  threadId: string;
  sourceApp: string;
  replyText: string;
  userId: string;
  timestamp: number;
}

/** Cross-app deep link schema */
export interface CrossAppDeepLink {
  app: string;
  screen: string;
  params: Record<string, unknown>;
  fallbackUrl?: string;
}

/** Important-only mode filter */
export interface ImportantOnlyConfig {
  enabled: boolean;
  minUrgency: NotificationUrgency;
}

/** Web Push VAPID subscription */
export interface WebPushSubscription {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  deviceId: string;
  registeredAt: number;
  isActive: boolean;
}

/** Web Push send options */
export interface WebPushSendOptions {
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  topic?: string;
}

/** Web Push result */
export interface WebPushResult {
  success: boolean;
  endpoint: string;
  statusCode?: number;
  error?: string;
}

/** Batch notification entry */
export interface BatchEntry {
  id: string;
  notification: NotificationPayload;
  addedAt: number;
}

/** Batched notification summary */
export interface BatchedNotification {
  id: string;
  type: NotificationType;
  recipientId: string;
  title: string;
  body: string;
  count: number;
  notifications: NotificationPayload[];
  createdAt: number;
  windowStart: number;
  windowEnd: number;
}

/** Dedup record */
export interface DedupRecord {
  notificationId: string;
  userId: string;
  deliveredToDevices: string[];
  firstDeliveredAt: number;
}
