import type { PrismaClient, Message } from '@prisma/client';
import { Prisma, MessageType } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { StorageClient, resolveStorageConfigFromEnv } from '@quant/storage';
import { PrismaOutboxService, type OutboxService } from './outbox.service';
import { StreakService } from './streak.service';

/**
 * Extract an object storage key from a media URL or raw path.
 */
export function extractStorageKey(mediaUrl: string): string {
  if (!mediaUrl) return '';
  if (mediaUrl.startsWith('s3://')) {
    const parts = mediaUrl.slice(5).split('/');
    parts.shift(); // strip bucket
    return parts.join('/');
  }
  try {
    const parsed = new URL(mediaUrl);
    const pathname = parsed.pathname.replace(/^\/+/, '');
    const bucket =
      process.env.ATTACHMENTS_BUCKET ||
      process.env.R2_BUCKET ||
      process.env.S3_BUCKET ||
      'quantmail-attachments';
    if (pathname.startsWith(`${bucket}/`)) {
      return pathname.slice(bucket.length + 1);
    }
    return pathname || mediaUrl;
  } catch {
    return mediaUrl.replace(/^\/+/, '');
  }
}

/**
 * Map the public (lowercase) message-type string accepted by the API/clients to
 * the Prisma `MessageType` enum stored in Postgres. The HTTP layer validates the
 * incoming value against a lowercase enum; here we translate it to the DB enum so
 * Postgres never rejects a mismatched-case value at insert time. Unknown values
 * fall back to TEXT.
 */
const MESSAGE_TYPE_MAP: Record<string, MessageType> = {
  text: MessageType.TEXT,
  image: MessageType.IMAGE,
  video: MessageType.VIDEO,
  audio: MessageType.AUDIO,
  file: MessageType.FILE,
  sticker: MessageType.STICKER,
  gif: MessageType.GIF,
  location: MessageType.LOCATION,
  contact: MessageType.CONTACT,
  poll: MessageType.POLL,
  system: MessageType.SYSTEM,
  snap_photo: MessageType.IMAGE,
  snap_video: MessageType.VIDEO,
};

export function toMessageType(type?: string): MessageType {
  if (!type) return MessageType.TEXT;
  return MESSAGE_TYPE_MAP[type.toLowerCase()] ?? MessageType.TEXT;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * QC-F-022: this service is a SERVER-SIDE message store — it receives and
 * persists whatever `content` string the caller supplies. It is therefore
 * NOT an end-to-end-encryption path, and it must never pretend to be one.
 *
 * The previous API offered `encryption: 'e2e'` + `recipientPublicKeys`:
 * the caller sent PLAINTEXT to the server, the server generated the
 * session key and encrypted on the server. Anyone with server access (or
 * a server compromise) saw every "E2E" plaintext and session key — the
 * exact thing E2EE exists to prevent. That server-side encryption has
 * been removed entirely (no `encryptForRecipients`, no key handling here).
 *
 * Real E2EE in QuantChat is client-side only: the client encrypts with
 * `@quant/encryption` and the server relays/stores only opaque
 * ciphertext via the zero-knowledge relay (`backend/routes/e2ee.ts`,
 * `backend/lib/e2ee-relay.ts`). A client may also store an already
 * client-encrypted ciphertext string as `content` — the server treats it
 * as opaque text and never sees the plaintext in that flow either.
 *
 * Any caller that still asks THIS service to perform "e2e" encryption
 * (a runtime `encryption` or `recipientPublicKeys` property, which the
 * typed input no longer offers) is rejected fail-closed below, before
 * anything is persisted — never silently downgraded to plaintext storage
 * under an E2EE label, and never "encrypted" on the server.
 */
export const E2EE_REQUIRES_CLIENT_SIDE_CODE = 'E2EE_REQUIRES_CLIENT_SIDE_ENCRYPTION';

export function assertNoServerSideE2eeRequest(input: unknown): void {
  if (!input || typeof input !== 'object') return;
  const extra = input as { encryption?: unknown; recipientPublicKeys?: unknown };
  const asksForE2e = extra.encryption !== undefined && extra.encryption !== null;
  const suppliesKeys =
    extra.recipientPublicKeys !== undefined && extra.recipientPublicKeys !== null;
  if (asksForE2e || suppliesKeys) {
    throw createAppError(
      'End-to-end encryption must happen on the client; this server-side message service never encrypts plaintext. Encrypt with the client E2EE engine and relay/store only ciphertext via the /e2ee relay.',
      400,
      E2EE_REQUIRES_CLIENT_SIDE_CODE,
    );
  }
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
  type?: string;
  mediaUrl?: string;
  replyToId?: string;
  metadata?: Record<string, unknown>;
  disappearMode?: 'off' | 'after_view' | '24h' | '7d' | '30d';
  // QC-F-022: deliberately NO `encryption` / `recipientPublicKeys` fields.
  // See the block comment above — E2EE is client-side only.
}

export class MessageService {
  private readonly outbox: OutboxService;
  private readonly streaks: StreakService;
  private readonly storage: StorageClient | null;

  /**
   * @param prisma  Prisma client used for all persistence.
   * @param outbox  Transactional outbox service. Defaults to a
   *   {@link PrismaOutboxService} bound to the same Prisma client so existing
   *   callers (`new MessageService(prisma)`) keep working unchanged while the
   *   delivery intent is written in the same transaction as the message.
   * @param streaks Streak engine used to update the 1:1 messaging streak after a
   *   message commits (best-effort; never blocks delivery). Defaults to one bound
   *   to the same Prisma client.
   * @param storage Storage client used for minting authentic SigV4 presigned URLs.
   */
  constructor(
    private readonly prisma: PrismaClient,
    outbox?: OutboxService,
    streaks?: StreakService,
    storage?: StorageClient,
  ) {
    this.outbox = outbox ?? new PrismaOutboxService(prisma);
    this.streaks = streaks ?? new StreakService(prisma as never);
    if (storage) {
      this.storage = storage;
    } else {
      const storageConfig = resolveStorageConfigFromEnv();
      if (storageConfig) {
        this.storage = new StorageClient(storageConfig);
      } else {
        // Optional storage: warn at startup, fail 503 on use — never crash boot.
        // eslint-disable-next-line no-console
        console.warn(
          '[quantchat] object storage not configured \u2014 media uploads disabled ' +
            '(set S3/R2 env vars)',
        );
        this.storage = null;
      }
    }
  }

  /** Fail-closed storage guard: 503 STORAGE_NOT_CONFIGURED, never a silent no-op. */
  private requireStorage(): StorageClient {
    if (!this.storage) {
      throw createAppError(
        'Object storage is not configured \u2014 set S3/R2 env vars',
        503,
        'STORAGE_NOT_CONFIGURED',
      );
    }
    return this.storage;
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    // QC-F-022: fail closed before any lookup or persistence if a runtime
    // caller still asks this server-side service to do "e2e" encryption.
    assertNoServerSideE2eeRequest(input);

    const { conversationId, senderId, content, type, mediaUrl, replyToId, metadata, disappearMode } =
      input;

    // Verify user is a member of the conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: senderId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    // QC-F-019: persist the view-once intent the client actually sent.
    // Previously `disappearMode` never reached this service (the route
    // schema stripped it) and snap types collapse to IMAGE/VIDEO in the
    // Prisma enum, so a stored snap carried no marker consumeSnap could
    // recognise — it lived forever as ordinary media. A message is a
    // view-once snap when the client asks for 'after_view' OR uses a snap
    // type; record that in metadata in the exact shape consumeSnap reads
    // (viewOnce/isSnap + duration + snap.durationSec).
    const storedMetadata: Record<string, unknown> = { ...(metadata ?? {}) };
    if (disappearMode) {
      storedMetadata.disappearMode = disappearMode;
    }
    const isSnapType = type === 'snap_photo' || type === 'snap_video';
    if (disappearMode === 'after_view' || isSnapType) {
      const snapMeta = (storedMetadata.snap as Record<string, unknown> | undefined) ?? {};
      const durationSec =
        typeof snapMeta.durationSec === 'number'
          ? snapMeta.durationSec
          : typeof storedMetadata.duration === 'number'
            ? storedMetadata.duration
            : 10;
      storedMetadata.viewOnce = true;
      if (isSnapType) storedMetadata.isSnap = true;
      storedMetadata.duration = durationSec;
      storedMetadata.snap = { ...snapMeta, durationSec };
    }

    // Stored exactly as supplied. If the caller client-encrypted the
    // content before sending, this is opaque ciphertext to the server;
    // otherwise it is ordinary server-stored plaintext (the honest,
    // disclosed non-E2EE path) — never relabelled as E2EE (QC-F-022).
    const storedContent = content;

    // Compute the recipient set: all active conversation members (leftAt: null)
    // except the sender (design Algorithm 2).
    const activeMembers = await this.prisma.conversationMember.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });
    const recipientIds = activeMembers
      .map((m: { userId: string }) => m.userId)
      .filter((userId: string) => userId !== senderId);

    // Persist the Message, bump the conversation's lastMessageAt, and enqueue
    // the delivery intent in a SINGLE interactive transaction so the message and
    // its outbox row commit atomically (Req 7.1, 7.2). The 201 is returned after
    // commit, before any asynchronous fan-out (Req 7.3).
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId,
          content: storedContent,
          type: toMessageType(type),
          mediaUrl: mediaUrl ?? null,
          replyToId: replyToId ?? null,
          metadata: storedMetadata as Prisma.InputJsonValue,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      await this.outbox.enqueue(tx, {
        conversationId,
        messageId: created.id,
        recipientIds,
        createdAt: created.createdAt,
      });

      return created;
    });

    // STREAK (Snapchat-style): a 1:1 conversation has exactly one recipient.
    // Update the pair's streak AFTER commit, best-effort — a streak failure must
    // never fail message delivery, and it runs outside the message transaction.
    if (recipientIds.length === 1) {
      try {
        await this.streaks.recordMessage(senderId, recipientIds[0] as string);
      } catch {
        // Non-critical: the streak will reconcile on the next message.
      }
    }

    return message;
  }

  async getMessages(
    conversationId: string,
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Message>> {
    // QC-F-024: verify the caller is an active member before reading any
    // message content or even the total count (both leaked to any logged-in
    // user before this check existed). Same pattern as sendMessage.
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where: { conversationId, isDeleted: false } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      // QC-F-019: a view-once snap's media must be deliverable ONLY through
      // consumeSnap (which records the view and destroys the stored copy).
      // The list payload previously handed the raw mediaUrl to every fetch,
      // so the media could be copied/replayed forever without ever being
      // consumed. Strip it here; the snap card needs only type + duration.
      data: data.map((msg) => {
        const meta = (msg.metadata as Record<string, unknown> | null) ?? {};
        if (meta.viewOnce || meta.isSnap) {
          return { ...msg, mediaUrl: null };
        }
        return msg;
      }),
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async editMessage(messageId: string, userId: string, content: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    if (message.senderId !== userId) {
      throw createAppError('Only the sender can edit this message', 403, 'NOT_MESSAGE_OWNER');
    }

    // Only allow editing within 15 minutes
    const fifteenMinutes = 15 * 60 * 1000;
    if (Date.now() - message.createdAt.getTime() > fifteenMinutes) {
      throw createAppError(
        'Message can only be edited within 15 minutes',
        400,
        'EDIT_WINDOW_EXPIRED',
      );
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { content, isEdited: true, updatedAt: new Date() },
    });
  }

  async deleteMessage(messageId: string, userId: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    if (message.senderId !== userId) {
      throw createAppError('Only the sender can delete this message', 403, 'NOT_MESSAGE_OWNER');
    }

    // Soft delete
    return this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, updatedAt: new Date() },
    });
  }

  async pinMessage(messageId: string, userId: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    // Verify user is a member of the conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: message.conversationId, userId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { metadata: { ...(message.metadata as object), pinned: true, pinnedBy: userId } },
    });
  }

  async reactToMessage(messageId: string, userId: string, reaction: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    // Verify user is a member of the conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: message.conversationId, userId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    const currentMetadata = (message.metadata as Record<string, unknown>) ?? {};
    const reactions = (currentMetadata['reactions'] as Record<string, string[]>) ?? {};
    const usersForReaction = reactions[reaction] ?? [];

    if (usersForReaction.includes(userId)) {
      // Remove reaction (toggle off)
      reactions[reaction] = usersForReaction.filter((id) => id !== userId);
      if (reactions[reaction]!.length === 0) {
        delete reactions[reaction];
      }
    } else {
      // Add reaction
      reactions[reaction] = [...usersForReaction, userId];
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { metadata: { ...currentMetadata, reactions } },
    });
  }

  async searchMessages(
    userId: string,
    query: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Message>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // Get conversation IDs the user belongs to
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, leftAt: null },
      select: { conversationId: true },
    });

    const conversationIds = memberships.map((m: { conversationId: string }) => m.conversationId);

    // NOTE: A message whose content is CLIENT-side ciphertext (encrypted
    // before it reached this server — QC-F-022) cannot be searched
    // server-side; the blind index (routes/search.ts) covers that case.
    // For now, we exclude messages whose content looks like a ciphertext
    // payload from this plaintext search.
    const where = {
      conversationId: { in: conversationIds },
      isDeleted: false,
      content: { contains: query, mode: 'insensitive' as const },
      NOT: { content: { startsWith: '{"ciphertext"' } },
    };

    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * CH-8 / SEC-1 / SEC-2: Ephemeral view-once media consumption.
   * - Enforces active conversation membership (403 NOT_A_MEMBER).
   * - Excludes sender (sender review does not consume or destroy media).
   * - Enforces per-recipient view-once atomic consumption via snap_views table.
   * - Under concurrent reads, @@unique([messageId, userId]) guarantees race loser
   *   fails closed with HTTP 410 SNAP_CONSUMED.
   */
  async consumeSnap(
    messageId: string,
    userId: string,
  ): Promise<{ mediaUrl: string; duration: number }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    // SEC-1: Enforce active conversation membership check
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: message.conversationId, userId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    const metadata = (message.metadata as Record<string, unknown> | null) ?? {};
    const msgTypeStr = String(message.type);
    const isSnap =
      Boolean(metadata.viewOnce) ||
      Boolean(metadata.isSnap) ||
      msgTypeStr === 'snap_photo' ||
      msgTypeStr === 'snap_video';

    if (!isSnap) {
      throw createAppError('Message is not an ephemeral snap', 400, 'NOT_A_SNAP');
    }

    const snapMeta = (metadata.snap as Record<string, unknown> | undefined) ?? {};
    const duration =
      typeof metadata.duration === 'number'
        ? metadata.duration
        : typeof snapMeta.durationSec === 'number'
          ? snapMeta.durationSec
          : 10;

    // Helper to mint authentic SigV4 presigned view URL (60-second TTL) fail-closed (SEC-4)
    const mintPresignedSnapUrl = async (rawMediaUrl: string): Promise<string> => {
      if (!rawMediaUrl) return '';

      // QC-F-019: the shipped client sends snap media as an inline data URL
      // (there is no working object-storage upload for snaps yet — the
      // upload-url endpoint is simulated). A data URL has no storage key;
      // trying to presign it threw STORAGE_KEY_MISSING / 503 and the snap
      // could never be consumed at all. The inline payload IS the media:
      // deliver it through this one-time path — consumption is recorded
      // first and the stored copy is nulled below, so it is delivered
      // exactly once, never repeatedly from the message list.
      if (rawMediaUrl.startsWith('data:')) return rawMediaUrl;

      // Prefer explicit persisted storageKey if available in metadata, else extract from mediaUrl
      const storageKey =
        typeof metadata.storageKey === 'string' && metadata.storageKey.trim().length > 0
          ? metadata.storageKey.trim()
          : extractStorageKey(rawMediaUrl);

      if (!storageKey) {
        throw createAppError(
          'Cannot determine storage key for ephemeral snap',
          500,
          'STORAGE_KEY_MISSING',
        );
      }

      const storageClient = this.requireStorage();
      try {
        return await storageClient.getSignedUrl(storageKey, 60);
      } catch (error: unknown) {
        throw createAppError(
          `Failed to mint ephemeral presigned URL: ${error instanceof Error ? error.message : 'Storage signing failure'}`,
          500,
          'PRESIGNING_FAILED',
        );
      }
    };

    // SEC-1: Sender exclusion — reviewing your own sent snap does not consume or destroy it,
    // but still delivers an authentic short-lived presigned URL (SEC-4).
    if (message.senderId === userId) {
      const ephemeralMediaUrl = await mintPresignedSnapUrl(message.mediaUrl ?? '');
      return {
        mediaUrl: ephemeralMediaUrl,
        duration,
      };
    }

    // SEC-2: Per-recipient atomic view-once consumption via snapView table
    const snapViewDelegate = this.prisma.snapView;
    if (!snapViewDelegate || typeof snapViewDelegate.create !== 'function') {
      throw createAppError(
        'SnapView storage delegate is unavailable; run prisma migrate + prisma generate',
        500,
        'DATABASE_UNAVAILABLE',
      );
    }

    const existingView = await snapViewDelegate.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });

    if (existingView) {
      throw createAppError(
        'This view-once snap has already been viewed and destroyed',
        410,
        'SNAP_CONSUMED',
      );
    }

    // QC-F-019: resolve the deliverable URL BEFORE recording consumption.
    // The old order created the snapView row first, so a presigning/storage
    // failure (e.g. storage not configured) burned the recipient's only
    // view without ever showing them the media.
    // SEC-4: Mint an authentic SigV4 short-lived presigned view URL (60-second TTL) fail-closed
    // so raw media cannot be retained or fetched indefinitely from storage after consumption.
    const rawMediaUrl = message.mediaUrl ?? '';
    const ephemeralMediaUrl = await mintPresignedSnapUrl(rawMediaUrl);

    try {
      await snapViewDelegate.create({
        data: {
          messageId,
          userId,
        },
      });
    } catch (err: unknown) {
      if (
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') ||
        (err as { code?: string })?.code === 'P2002'
      ) {
        throw createAppError(
          'This view-once snap has already been viewed and destroyed',
          410,
          'SNAP_CONSUMED',
        );
      }
      throw err;
    }

    // Hard delete media payload from S3/storage and mark consumed.
    // Inline data-URL media has no storage object — nulling the DB copy
    // below is its destruction.
    const storageKey = rawMediaUrl.startsWith('data:') ? '' : extractStorageKey(rawMediaUrl);
    if (storageKey) {
      const storageClient = this.requireStorage();
      try {
        await storageClient.delete(storageKey);
      } catch {
        // ignore deletion errors if already removed
      }
    }

    const updatedMetadata = {
      ...metadata,
      consumedAt: new Date().toISOString(),
      consumedBy: userId,
    };

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        mediaUrl: null,
        metadata: updatedMetadata,
      },
    });

    return {
      mediaUrl: ephemeralMediaUrl,
      duration,
    };
  }
}
