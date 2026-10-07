// ============================================================================
// Realtime - Event Schema Registry
// Validates event payloads against registered Zod schemas
// ============================================================================

import { z, type ZodSchema } from 'zod';

/** Validation result for successful validation */
export interface ValidationSuccess<T = unknown> {
  success: true;
  data: T;
}

/** Validation result for failed validation */
export interface ValidationFailure {
  success: false;
  error: string;
}

/** Union type for validation results */
export type ValidationResult<T = unknown> = ValidationSuccess<T> | ValidationFailure;

// ===== Schemas for EventMap types =====

const MessageNewSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  content: z.string(),
  type: z.string(),
  mediaUrl: z.string().optional(),
  replyToId: z.string().optional(),
});

const MessageTypingSchema = z.object({
  conversationId: z.string(),
  userId: z.string(),
  isTyping: z.boolean(),
});

const MessageReadSchema = z.object({
  conversationId: z.string(),
  userId: z.string(),
  lastReadMessageId: z.string(),
});

const MessageDeletedSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  deletedBy: z.string(),
});

const PresenceUpdateSchema = z.object({
  userId: z.string(),
  status: z.enum(['online', 'away', 'busy', 'offline']),
  activeApp: z.string().optional(),
  lastSeen: z.number().optional(),
});

const PostNewSchema = z.object({
  postId: z.string(),
  userId: z.string(),
  type: z.string(),
  preview: z.string(),
});

const PostInteractionSchema = z.object({
  postId: z.string(),
  userId: z.string(),
  type: z.enum(['like', 'comment', 'share', 'bookmark']),
});

const CallSignalSchema = z.object({
  callId: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  type: z.enum(['offer', 'answer', 'ice_candidate', 'hangup']),
  data: z.unknown(),
});

const CallIncomingSchema = z.object({
  callId: z.string(),
  callerId: z.string(),
  callerName: z.string(),
  callerAvatar: z.string().optional(),
  callType: z.enum(['voice', 'video']),
});

const StreamEventSchema = z.object({
  streamId: z.string(),
  type: z.enum(['start', 'end', 'viewer_join', 'viewer_leave', 'chat']),
  data: z.unknown(),
});

const NotificationNewSchema = z.object({
  notificationId: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  sourceApp: z.string(),
  actionUrl: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const AIChunkSchema = z.object({
  sessionId: z.string(),
  chunk: z.string(),
  done: z.boolean(),
  finishReason: z.string().optional(),
});

const AIDeviceSchema = z.object({
  commandId: z.string(),
  deviceId: z.string(),
  action: z.string(),
  status: z.enum(['pending', 'executing', 'completed', 'failed']),
  result: z.unknown().optional(),
});

// ===== Cross-app event schemas =====

const DocumentUpdatedSchema = z.object({
  documentId: z.string(),
  userId: z.string(),
  title: z.string(),
  changeType: z.enum(['created', 'edited', 'deleted', 'shared']),
  updatedAt: z.number(),
});

const FileSharedSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  sharedBy: z.string(),
  sharedWith: z.array(z.string()),
  permissions: z.enum(['view', 'edit', 'admin']),
});

const CalendarReminderSchema = z.object({
  eventId: z.string(),
  title: z.string(),
  startTime: z.number(),
  reminderMinutes: z.number(),
  attendees: z.array(z.string()).optional(),
});

const PaymentReceivedSchema = z.object({
  paymentId: z.string(),
  amount: z.number(),
  currency: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  description: z.string().optional(),
});

const SearchInvalidateSchema = z.object({
  indexName: z.string(),
  documentIds: z.array(z.string()),
  reason: z.enum(['created', 'updated', 'deleted']),
});

/**
 * EventSchemaRegistry - Central registry mapping event types to Zod schemas.
 *
 * Validates event payloads against registered schemas for type safety
 * at runtime boundaries (WebSocket messages, queue events, etc.).
 */
export class EventSchemaRegistry {
  private schemas: Map<string, ZodSchema> = new Map();

  constructor() {
    this.registerDefaults();
  }

  /**
   * Register a schema for a given event type.
   */
  register(type: string, schema: ZodSchema): void {
    this.schemas.set(type, schema);
  }

  /**
   * Get the schema for a given event type.
   */
  getSchema(type: string): ZodSchema | undefined {
    return this.schemas.get(type);
  }

  /**
   * Validate a payload against the schema for the given event type.
   */
  validate(type: string, payload: unknown): ValidationResult {
    const schema = this.schemas.get(type);
    if (!schema) {
      return { success: false, error: `No schema registered for event type: ${type}` };
    }

    const result = schema.safeParse(payload);
    if (result.success) {
      return { success: true, data: result.data };
    }

    return { success: false, error: result.error.message };
  }

  /**
   * List all registered event types.
   */
  listTypes(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Register default schemas for all known event types.
   */
  private registerDefaults(): void {
    // EventMap types
    this.schemas.set('message:new', MessageNewSchema);
    this.schemas.set('message:typing', MessageTypingSchema);
    this.schemas.set('message:read', MessageReadSchema);
    this.schemas.set('message:deleted', MessageDeletedSchema);
    this.schemas.set('presence:update', PresenceUpdateSchema);
    this.schemas.set('post:new', PostNewSchema);
    this.schemas.set('post:interaction', PostInteractionSchema);
    this.schemas.set('call:signal', CallSignalSchema);
    this.schemas.set('call:incoming', CallIncomingSchema);
    this.schemas.set('stream:event', StreamEventSchema);
    this.schemas.set('notification:new', NotificationNewSchema);
    this.schemas.set('ai:chunk', AIChunkSchema);
    this.schemas.set('ai:device', AIDeviceSchema);

    // Cross-app event types
    this.schemas.set('document:updated', DocumentUpdatedSchema);
    this.schemas.set('file:shared', FileSharedSchema);
    this.schemas.set('calendar:reminder', CalendarReminderSchema);
    this.schemas.set('payment:received', PaymentReceivedSchema);
    this.schemas.set('search:invalidate', SearchInvalidateSchema);
  }
}
