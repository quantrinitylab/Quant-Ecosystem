import type { PrismaClient, Message } from '@prisma/client';
import { Prisma, MessageType } from '@prisma/client';
import * as crypto from 'node:crypto';
import { createAppError } from '@quant/server-core';
import { PrismaOutboxService, type OutboxService } from './outbox.service';
import { StreakService } from './streak.service';

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
  /**
   * Client-declared disappearing behaviour. `'after_view'` marks the message as a
   * view-once snap. See {@link isEphemeralSend}.
   */
  disappearMode?: string;
}

/**
 * Public (lowercase) API message types that denote view-once snap media.
 *
 * These strings only exist at the HTTP boundary: {@link MESSAGE_TYPE_MAP} folds
 * `snap_photo`/`snap_video` onto the Prisma `IMAGE`/`VIDEO` enum members, because
 * `MessageType` has no snap variants. Anything that needs to know a message was a snap
 * *after* it is persisted must therefore read `metadata`, not `message.type`.
 */
const SNAP_TYPES = new Set(['snap_photo', 'snap_video']);

export function isSnapType(type?: string): boolean {
  return type !== undefined && SNAP_TYPES.has(type.toLowerCase());
}

/**
 * Decide whether a send is view-once, from the values the HTTP layer actually receives:
 * a snap message type, an explicit `disappearMode: 'after_view'`, or metadata the caller
 * set itself.
 *
 * `consumeSnap` detects snaps from persisted metadata alone. Nothing used to WRITE that
 * metadata, so every genuine snap was stored as a plain image and `consumeSnap` answered
 * 400 NOT_A_SNAP — the 410-Gone path was unreachable outside tests that hand-built the
 * metadata themselves. This is the single point where ephemerality is established.
 */
export function isEphemeralSend(input: {
  type?: string;
  disappearMode?: string;
  metadata?: Record<string, unknown>;
}): boolean {
  return (
    isSnapType(input.type) ||
    input.disappearMode === 'after_view' ||
    Boolean(input.metadata?.['viewOnce']) ||
    Boolean(input.metadata?.['isSnap'])
  );
}

export class MessageService {
  private readonly outbox: OutboxService;
  private readonly streaks: StreakService;

  /**
   * @param prisma  Prisma client used for all persistence.
   * @param outbox  Transactional outbox service. Defaults to a
   *   {@link PrismaOutboxService} bound to the same Prisma client so existing
   *   callers (`new MessageService(prisma)`) keep working unchanged while the
   *   delivery intent is written in the same transaction as the message.
   * @param streaks Streak engine used to update the 1:1 messaging streak after a
   *   message commits (best-effort; never blocks delivery). Defaults to one bound
   *   to the same Prisma client.
   */
  constructor(
    private readonly prisma: PrismaClient,
    outbox?: OutboxService,
    streaks?: StreakService,
  ) {
    this.outbox = outbox ?? new PrismaOutboxService(prisma);
    this.streaks = streaks ?? new StreakService(prisma as never);
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
      disappearMode,
    } = input;

    // CH-8: persist view-once intent as metadata at send time. `consumeSnap` reads metadata
    // only (the snap type is folded onto the IMAGE/VIDEO enum on insert), so without this the
    // ephemeral flag never reaches the database and every snap looks like an ordinary image.
    const effectiveMetadata: Record<string, unknown> = { ...(metadata ?? {}) };
    if (isEphemeralSend({ type, disappearMode, metadata })) {
      effectiveMetadata['viewOnce'] = true;
      if (disappearMode !== undefined) effectiveMetadata['disappearMode'] = disappearMode;
    }

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
          metadata: effectiveMetadata as Prisma.InputJsonValue,
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
   * CH-8: Ephemeral view-once media consumption.
   * Returns media payload on first view and immediately marks snap as consumed.
   * Any subsequent access throws HTTP 410 GONE.
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

    const metadata = (message.metadata as Record<string, unknown> | null) ?? {};
    // Snap-ness lives in `metadata`, never in `type`. The wire accepts
    // `snap_photo`/`snap_video`, but MESSAGE_TYPE_MAP above folds them onto the
    // Prisma enum (`IMAGE`/`VIDEO`), which has no snap members — so the two
    // `message.type === 'snap_*'` comparisons this replaces could never be true
    // and TypeScript flagged them as non-overlapping. Removing them is not a
    // behaviour change; leaving them in implied a second, working detection path
    // that a future reader would trust.
    const isSnap = Boolean(metadata.viewOnce) || Boolean(metadata.isSnap);

    if (!isSnap) {
      throw createAppError('Message is not an ephemeral snap', 400, 'NOT_A_SNAP');
    }

    // CH-8 Server-side 410 Gone enforcement
    if (metadata.consumedAt) {
      throw createAppError(
        'This view-once snap has already been viewed and destroyed',
        410,
        'SNAP_CONSUMED',
      );
    }

    // Mark as consumed immediately on the server
    const updatedMetadata = {
      ...metadata,
      consumedAt: new Date().toISOString(),
      consumedBy: userId,
    };

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        metadata: updatedMetadata,
      },
    });

    return {
      mediaUrl: message.mediaUrl ?? '',
      duration: typeof metadata.duration === 'number' ? metadata.duration : 10,
    };
  }
}
