// ============================================================================
// Notifications Package - Barrel Export
//
// QM-UIUX-054: the in-memory "engine" facade (NotificationFanout,
// CrossAppDispatcher, InAppNotificationService, PreferenceService and the
// Phase-27 helper services) was deleted. It only computed routing decisions
// in process memory — it never persisted or sent anything — and every app's
// real notification path writes the shared Prisma `Notification` model
// directly (QuantMail QM-UIUX-052, QuantGram, QuantWave). What remains here
// is the push-delivery substrate that QM-UIUX-053 will wire:
// PushNotificationService (FCM/APNs) and WebPushService (VAPID web push).
// ============================================================================

export { PushNotificationService, PushService } from './services/push-service';
export { PushPayloadSchema } from './services/push-service';
export type {
  PushPayload,
  PushPlatform as PushServicePlatform,
  PushResult,
  PushServiceConfig,
} from './services/push-service';

export { WebPushService } from './services/web-push-service';
export type { VapidConfig, WebPushPayload } from './services/web-push-service';

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
