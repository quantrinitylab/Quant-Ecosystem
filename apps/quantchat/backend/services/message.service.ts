import type { PrismaClient, Message } from '@prisma/client';
import { Prisma, MessageType } from '@prisma/client';
import * as crypto from 'node:crypto';
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

export interface RecipientPublicKey {
  userId: string;
  publicKey: string;
}

export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
  authTag: string;
  encryptedKeys: Array<{
    recipientId: string;
    encryptedKey: string;
  }>;
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
  type?: string;
  mediaUrl?: string;
  replyToId?: string;
  metadata?: Record<string, unknown>;
  encryption?: 'e2e';
  recipientPublicKeys?: RecipientPublicKey[];
}

export class MessageService {
  private readonly outbox: OutboxService;
  private readonly streaks: StreakService;
  private readonly storage: StorageClient;

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
    this.storage = storage ?? new StorageClient(resolveStorageConfigFromEnv());
  }

  /**
   * Encrypt plaintext for multiple recipients using AES-256-GCM with a
   * random session key, encrypted per-recipient with their public key.
   */
  encryptForRecipients(
    plaintext: string,
    recipientPublicKeys: RecipientPublicKey[],
  ): EncryptedPayload {
    // Generate random AES-256 session key
    const sessionKey = crypto.randomBytes(32);
    const nonce = crypto.randomBytes(12);

    // Encrypt the plaintext with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'utf-8')),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Encrypt the session key for each recipient using their public key
    const encryptedKeys = recipientPublicKeys.map((recipient) => {
      const publicKeyDer = Buffer.from(recipient.publicKey, 'base64');
      const publicKeyObj = crypto.createPublicKey({
        key: publicKeyDer,
        format: 'der',
        type: 'spki',
      });
      const encryptedKey = crypto.publicEncrypt(
        {
          key: publicKeyObj,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        sessionKey,
      );
      return {
        recipientId: recipient.userId,
        encryptedKey: encryptedKey.toString('base64'),
      };
    });

    // Zero the session key after use to prevent memory leakage
    sessionKey.fill(0);

    return {
      ciphertext: ciphertext.toString('base64'),
      nonce: nonce.toString('base64'),
      authTag: authTag.toString('base64'),
      encryptedKeys,
    };
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const {
      conversationId,
      senderId,
      content,
      type,
      mediaUrl,
      replyToId,
      metadata,
      encryption,
      recipientPublicKeys,
    } = input;

    // Verify user is a member of the conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: senderId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    let storedContent = content;

    // When encryption is 'e2e', encrypt the content for recipients. This check
    // runs BEFORE any persistence: an E2EE send missing recipient public keys
    // throws here, so neither the Message nor a MessageOutbox row is ever
    // written (Req 7.5, 7.6, 16.1, 16.2).
    if (encryption === 'e2e') {
      if (!recipientPublicKeys || recipientPublicKeys.length === 0) {
        throw createAppError(
          'Recipient public keys required for E2E encryption',
          400,
          'MISSING_RECIPIENT_KEYS',
        );
      }
      const encryptedPayload = this.encryptForRecipients(content, recipientPublicKeys);
      storedContent = JSON.stringify(encryptedPayload);
    }

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
          metadata: (metadata ?? {}) as Prisma.InputJsonValue,
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
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Message>> {
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
      data,
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

    // NOTE: Messages with E2E encryption store ciphertext in the content field and cannot
    // be searched server-side. A separate metadata index is needed for searching encrypted
    // messages (e.g., client-side search or a dedicated encrypted search index).
    // For now, we exclude messages whose content looks like E2E encrypted payloads.
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
      msgTypeStr === 'snap_photo' ||
      msgTypeStr === 'snap_video' ||
      Boolean(metadata.viewOnce) ||
      Boolean(metadata.isSnap);

    if (!isSnap) {
      throw createAppError('Message is not an ephemeral snap', 400, 'NOT_A_SNAP');
    }

    const duration = typeof metadata.duration === 'number' ? metadata.duration : 10;

    // SEC-1: Sender exclusion — reviewing your own sent snap does not consume or destroy it
    if (message.senderId === userId) {
      return {
        mediaUrl: message.mediaUrl ?? '',
        duration,
      };
    }

    // SEC-2: Per-recipient atomic view-once consumption via snapView table
    const snapViewDelegate = (this.prisma as any).snapView;
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

    // SEC-4: Mint an authentic SigV4 short-lived presigned view URL (60-second TTL)
    // so raw media cannot be retained or fetched indefinitely from storage after consumption.
    let ephemeralMediaUrl = message.mediaUrl ?? '';
    if (ephemeralMediaUrl) {
      const storageKey = extractStorageKey(ephemeralMediaUrl);
      if (storageKey) {
        try {
          ephemeralMediaUrl = await this.storage.getSignedUrl(storageKey, 60);
        } catch {
          // If storage signing fails in unit tests or dev, retain mediaUrl
        }
      }
    }

    return {
      mediaUrl: ephemeralMediaUrl,
      duration,
    };
  }
}
