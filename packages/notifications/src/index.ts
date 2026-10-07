// ============================================================================
// Notifications Package - Barrel Export
// ============================================================================

export { PushNotificationService, PushService } from './services/push-service';
export { PushPayloadSchema } from './services/push-service';
export type {
  PushPayload,
  PushPlatform as PushServicePlatform,
  PushResult,
  PushServiceConfig,
} from './services/push-service';
export { InAppNotificationService } from './services/in-app-service';
export { EmailDigestService } from './services/email-digest-service';
export { SchedulerService } from './services/scheduler-service';
export { PreferenceService } from './services/preference-service';
export { NotificationFanout } from './services/notification-fanout';
export type { FanoutEvent, RecipientRouting, FanoutResult } from './services/notification-fanout';

// Phase 27 - New services
export { DndService } from './services/dnd-service';
export { BatchService } from './services/batch-service';
export type { BatchConfig } from './services/batch-service';
export { DedupService } from './services/dedup-service';
export { SnoozeService } from './services/snooze-service';
export { WebPushService } from './services/web-push-service';
export type { VapidConfig, WebPushPayload } from './services/web-push-service';

export { UniversalNotificationCenter } from './universal-notification-center';
export type {
  NotificationApp,
  UniversalNotification,
  UniversalNotificationPriority,
  UniversalNotificationPreferences,
  NotificationFilters,
} from './universal-notification-center';

export type {
  NotificationType,
  NotificationPriority,
  DeliveryChannel,
  DeliveryStatus,
  PushPlatform,
  NotificationPayload,
  RichMedia,
  NotificationAction,
  DeepLinkAction,
  DeviceToken,
  PushSendRequest,
  PushDeliveryResult,
  InAppNotification,
  DigestConfig,
  DigestFrequency,
  DigestContent,
  DigestSummary,
  ScheduledNotification,
  RecurrenceRule,
  NotificationGroup,
  NotificationPreferences,
  ChannelPreferences,
  TypePreference,
  QuietHoursConfig,
  NotificationServiceConfig,
  // Phase 27 types
  NotificationUrgency,
  NotificationCategory,
  DndConfig,
  DndSchedule,
  SnoozeDuration,
  SnoozeOptions,
  SnoozedNotification,
  PreviewPrivacy,
  ThreadMuteConfig,
  InlineReplyPayload,
  CrossAppDeepLink,
  ImportantOnlyConfig,
  WebPushSubscription,
  WebPushSendOptions,
  WebPushResult,
  BatchEntry,
  BatchedNotification,
  DedupRecord,
} from './types';

export { CATEGORY_URGENCY } from './types';

export { CrossAppDispatcher } from './services/cross-app-dispatcher';
export type { CrossAppNotification } from './services/cross-app-dispatcher';
