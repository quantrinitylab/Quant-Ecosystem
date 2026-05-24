// ============================================================================
// Database Schema - Notifications (Cross-ecosystem)
// ============================================================================

/** Notification schema */
export interface NotificationSchema {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  imageUrl: string | null;
  actionUrl: string | null;
  sourceApp: string;
  sourceUserId: string | null;
  sourceEntityId: string | null;
  sourceEntityType: string | null;
  data: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  channel: NotificationChannel;
  isRead: boolean;
  readAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  sentVia: ('push' | 'email' | 'sms' | 'in_app')[];
  deliveredAt: string | null;
  clickedAt: string | null;
  groupKey: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Notification types */
export type NotificationType =
  | 'message_received'
  | 'message_reaction'
  | 'email_received'
  | 'mention'
  | 'like'
  | 'comment'
  | 'follow'
  | 'follow_request'
  | 'share'
  | 'repost'
  | 'tag'
  | 'story_view'
  | 'match'
  | 'super_like'
  | 'video_upload_complete'
  | 'live_stream_start'
  | 'subscription'
  | 'ad_approved'
  | 'ad_rejected'
  | 'ai_response_ready'
  | 'device_alert'
  | 'security_alert'
  | 'payment'
  | 'system_update'
  | 'achievement'
  | 'reminder';

/** Notification channels */
export type NotificationChannel =
  | 'messages'
  | 'social'
  | 'email'
  | 'media'
  | 'dating'
  | 'ads'
  | 'ai'
  | 'security'
  | 'system';

/** Push notification subscription */
export interface PushSubscriptionSchema {
  id: string;
  userId: string;
  endpoint: string;
  keys: PushKeys;
  platform: 'web' | 'ios' | 'android';
  deviceId: string;
  isActive: boolean;
  subscribedChannels: NotificationChannel[];
  createdAt: string;
  updatedAt: string;
}

/** Push notification keys */
export interface PushKeys {
  p256dh: string;
  auth: string;
}

/** Notification preference per channel */
export interface NotificationPreferenceSchema {
  id: string;
  userId: string;
  channel: NotificationChannel;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  inAppEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  frequency: 'instant' | 'hourly' | 'daily' | 'weekly';
  createdAt: string;
  updatedAt: string;
}

/** Notification group (batched notifications) */
export interface NotificationGroupSchema {
  id: string;
  userId: string;
  groupKey: string;
  type: NotificationType;
  title: string;
  body: string;
  count: number;
  actorIds: string[];
  lastNotificationAt: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Activity log for audit trail */
export interface ActivityLogSchema {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  app: string;
  createdAt: string;
}

export const NOTIFICATIONS_TABLE = {
  tableName: 'notifications',
  columns: [
    { name: 'id', type: 'UUID', primaryKey: true },
    { name: 'user_id', type: 'UUID', nullable: false, references: 'users(id)' },
    { name: 'type', type: 'VARCHAR(30)', nullable: false },
    { name: 'title', type: 'VARCHAR(200)', nullable: false },
    { name: 'body', type: 'TEXT', nullable: false },
    { name: 'image_url', type: 'TEXT', nullable: true },
    { name: 'action_url', type: 'TEXT', nullable: true },
    { name: 'source_app', type: 'VARCHAR(20)', nullable: false },
    { name: 'source_user_id', type: 'UUID', nullable: true },
    { name: 'data', type: "JSONB DEFAULT '{}'", nullable: false },
    { name: 'priority', type: "VARCHAR(10) DEFAULT 'normal'", nullable: false },
    { name: 'channel', type: 'VARCHAR(20)', nullable: false },
    { name: 'is_read', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'read_at', type: 'TIMESTAMPTZ', nullable: true },
    { name: 'group_key', type: 'VARCHAR(100)', nullable: true },
    { name: 'expires_at', type: 'TIMESTAMPTZ', nullable: true },
    { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
  ],
  indexes: [
    { name: 'idx_notifications_user', columns: ['user_id', 'created_at'] },
    { name: 'idx_notifications_unread', columns: ['user_id', 'is_read'] },
    { name: 'idx_notifications_type', columns: ['type'] },
    { name: 'idx_notifications_group', columns: ['group_key'] },
    { name: 'idx_notifications_expires', columns: ['expires_at'] },
  ],
} as const;
