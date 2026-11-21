import type { PrismaClient, Message } from '@prisma/client';
import { Prisma, MessageType } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { StorageClient, resolveStorageConfigFromEnv } from '@quant/storage';
import { assertMediaUrlAllowed } from '../lib/media-url';
import { PrismaOutboxService, type OutboxService } from './outbox.service';
import { StreakService } from './streak.service';
import { getPrivacyService, type PrivacyService } from './privacy.service';

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
 * QC-F-329: a snap's persisted mediaUrl is sender-controlled, so the storage
 * key derived from it is too. The only ownership fact the system actually
 * issues is the upload key shape (MediaService.generateUploadUrl:
 * `${userId}/${mediaId}/${filename}`); there is no durable media registry
 * to look up (MediaService keeps an in-memory map, and the Prisma `Media`
 * table has no writers). Ownership is therefore structural: the derived
 * key's first segment must be the message sender's own id. The URL host is
 * deliberately NOT checked — presign/delete always act on the server's own
 * bucket via StorageClient; only the key chooses the object.
 */
export function snapMediaKeyOwnedBy(mediaUrl: string, ownerId: string): boolean {
  const key = extractStorageKey(mediaUrl);
  if (!key) return false;
  return key.split('/')[0] === ownerId;
}

/**
 * QC-F-274: message `metadata` keys that only the server may write.
 *
 * The send schema accepts `metadata` as an open record, and before this fix
 * `sendMessage` persisted it verbatim — so a sender could pre-forge state
 * that backend consumers trust: fake `reactions` attributed to other users,
 * `pinned`/`pinnedBy`, a fabricated `storyReply`, view-once flags
 * (`viewOnce`/`isSnap`) that push an ordinary message into the snap
 * pipeline, a `storageKey` that steered consumeSnap's presign key
 * selection, `deliveries` bookkeeping, and ephemeral-timer
 * state (`viewedAt`, `consumedAt`, `consumedBy`, plus the screenshot-event
 * keys `system`/`event`/`screenshotBy`/`targetMessageId`).
 *
 * Every key below has a server-side writer (react/pin, the snap branch of
 * sendMessage itself, DeliveryService, DisappearingService, consumeSnap)
 * or, for `storageKey`, must never exist from a client at all. They are
 * stripped from client-supplied metadata at the single persistence choke
 * point; trusted server-side callers use `SendMessageInput.serverMetadata`
 * instead, which the REST route schema never accepts.
 */
export const RESERVED_METADATA_KEYS: ReadonlySet<string> = new Set([
  'reactions',
  'pinned',
  'pinnedBy',
  'storyReply',
  'viewOnce',
  'isSnap',
  'duration',
  'disappearMode',
  'storageKey',
  'deliveries',
  'viewedAt',
  'consumedAt',
  'consumedBy',
  'system',
  'event',
  'screenshotBy',
  'targetMessageId',
]);

/** Longest legitimate snap duration a client may request: 24h in seconds. */
const MAX_SNAP_DURATION_SEC = 86_400;

/**
 * QC-F-274: sanitize client-supplied message metadata before persistence.
 *
 * Reserved server-owned keys (RESERVED_METADATA_KEYS) are dropped. All
 * other keys pass through verbatim — this is deliberately NOT a strict
 * allowlist (free-form keys such as `caption` are legitimate client data).
 *
 * `snap` is the one legitimate client key that carries server-trusted
 * data, so it is sanitized rather than stripped: only a plain object with
 * a finite `durationSec` in (0, 86400] survives, rebuilt as exactly
 * `{ durationSec }` so no nested key can be smuggled through it. An
 * invalid `snap` is dropped entirely and the snap branch of sendMessage
 * falls back to its default duration.
 */
export function sanitizeClientMetadata(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (RESERVED_METADATA_KEYS.has(key)) continue;
    if (key === 'snap') {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const durationSec = (value as Record<string, unknown>).durationSec;
        if (
          typeof durationSec === 'number' &&
          Number.isFinite(durationSec) &&
          durationSec > 0 &&
          durationSec <= MAX_SNAP_DURATION_SEC
        ) {
          out.snap = { durationSec };
        }
      }
      continue;
    }
    out[key] = value;
  }
  return out;
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
 * QC-F-518: getMessages result. `historyHidden` is true exactly when the
 * QC-F-518 cutoff actually applied to THIS caller (a HIDDEN group/channel
 * bounding the page at the caller's joinedAt) — clients use it to say
 * "earlier messages are hidden" honestly instead of implying the group
 * is empty. It never carries a count of hidden messages: their number
 * is itself part of what is hidden.
 */
export type MessagePageResult = PaginatedResult<Message> & { historyHidden: boolean };

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
  // QC-F-067: server-side generated replies (auto-reply service) are stored
  // with the AI flag set so clients can label them and the auto-reply
  // trigger itself can refuse to reply to them (loop prevention). The REST
  // route schema does not accept this from clients — only trusted
  // server-side callers set it.
  isAIGenerated?: boolean;
  // QC-F-274: server-owned metadata (currently only the stories reply
  // route's `storyReply`) merged OVER the sanitized client metadata, so a
  // server key always wins. Like `isAIGenerated`, the REST route schema
  // does not accept this from clients — only trusted server-side callers
  // set it.
  serverMetadata?: Record<string, unknown>;
  // QC-F-022: deliberately NO `encryption` / `recipientPublicKeys` fields.
  // See the block comment above — E2EE is client-side only.
}

export class MessageService {
  private readonly outbox: OutboxService;
  private readonly streaks: StreakService;
  private readonly storage: StorageClient | null;
  private readonly privacy: PrivacyService;

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
   * @param privacy Privacy/block resolver for the QC-F-359 send gate.
   *   Defaults to the shared {@link getPrivacyService} instance bound to
   *   the same Prisma client (the ConversationService pattern), so
   *   existing callers keep working unchanged.
   */
  constructor(
    private readonly prisma: PrismaClient,
    outbox?: OutboxService,
    streaks?: StreakService,
    storage?: StorageClient,
    privacy?: PrivacyService,
  ) {
    this.outbox = outbox ?? new PrismaOutboxService(prisma);
    this.streaks = streaks ?? new StreakService(prisma as never);
    this.privacy = privacy ?? getPrivacyService(prisma);
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

  /**
   * QC-F-359: blocked-pair gate for an EXISTING conversation.
   *
   * QC-F-317 shipped the block writer plus gates for NEW conversations
   * (checkCanMessage) and 1:1 call initiation, but the send path of a
   * conversation that already exists was never gated: a user who blocked
   * the person they were chatting with kept receiving that person's
   * messages in the very same thread (and could keep sending to them).
   * This gate closes that hole at the single durable choke point — every
   * sendMessage caller (REST, story-reply, voice-notes sink, auto-reply
   * delivery) is bound by it.
   *
   * Scope and semantics (band):
   * - DIRECT conversations only. Group/channel moderation is a
   *   different system (QC-F-224/F-227); the conversation ROW's `type`
   *   is the only authority — never a recipient-count proxy.
   * - Both directions: the peer having blocked the sender AND the
   *   sender having blocked the peer each stop the send (WhatsApp
   *   parity — a blocker cannot send either, until they unblock).
   * - A 'blocked' verdict anywhere wins over an 'unavailable' verdict
   *   anywhere: a real block must never hide behind a 503. Only when no
   *   direction is blocked does an 'unavailable' verdict fail the send
   *   closed with 503 UPSTREAM_UNAVAILABLE — a block list that cannot
   *   be read (malformed prefs, failed read, missing delegate) is never
   *   treated as "nobody blocked".
   * - The conversation type itself is fail-closed: a missing row or a
   *   failed lookup answers 503, never a guessed GROUP skip.
   * - The error message is deliberately neutral — it never says WHICH
   *   direction is blocked (the peer must not learn they were blocked).
   * - Only the block verdict gates here. whoCanMessage category prefs
   *   deliberately do NOT gate existing conversations (QC-F-042's doc:
   *   they guard initiation only) — QC-F-359 case G3 pins that.
   *
   * QC-F-353 (media albums): `sendAlbum` does NOT route through
   * sendMessage, so it MUST call this helper itself (with its own
   * active-member list) or album sends would reopen this hole.
   */
  private async assertDirectSendNotBlocked(
    conversationId: string,
    senderId: string,
    activeMembers: Array<{ userId: string }>,
  ): Promise<void> {
    let conversationType: unknown;
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true },
      });
      if (!conversation) {
        throw new Error('conversation row missing for blocked-send gate');
      }
      conversationType = conversation.type;
    } catch {
      throw createAppError(
        'Privacy preferences are temporarily unavailable',
        503,
        'UPSTREAM_UNAVAILABLE',
      );
    }

    if (conversationType !== 'DIRECT') return;

    const peerIds = activeMembers
      .map((m) => m.userId)
      .filter((userId) => userId !== senderId);
    if (peerIds.length === 0) return;

    let sawUnavailable = false;
    for (const peerId of peerIds) {
      const peerBlockedSender = await this.privacy.checkBlockedBy(peerId, senderId);
      if (peerBlockedSender === 'blocked') {
        throw createAppError(
          'You cannot send messages in this conversation',
          403,
          'USER_BLOCKED',
        );
      }
      if (peerBlockedSender === 'unavailable') sawUnavailable = true;

      const senderBlockedPeer = await this.privacy.checkBlockedBy(senderId, peerId);
      if (senderBlockedPeer === 'blocked') {
        throw createAppError(
          'You cannot send messages in this conversation',
          403,
          'USER_BLOCKED',
        );
      }
      if (senderBlockedPeer === 'unavailable') sawUnavailable = true;
    }

    if (sawUnavailable) {
      throw createAppError(
        'Privacy preferences are temporarily unavailable',
        503,
        'UPSTREAM_UNAVAILABLE',
      );
    }
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    // QC-F-022: fail closed before any lookup or persistence if a runtime
    // caller still asks this server-side service to do "e2e" encryption.
    assertNoServerSideE2eeRequest(input);

    const {
      conversationId,
      senderId,
      content,
      type,
      mediaUrl,
      replyToId,
      metadata,
      disappearMode,
      isAIGenerated,
      serverMetadata,
    } = input;

    // Verify user is a member of the conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: senderId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    // Compute the active-member set NOW (design Algorithm 2): the
    // QC-F-359 gate below needs the peer set, and the same list is
    // reused after the gates to derive recipientIds — one query, not
    // two. Sender is filtered out at the recipient-derivation step.
    const activeMembers = await this.prisma.conversationMember.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });

    // QC-F-359: blocked-pair gate — immediately after membership,
    // BEFORE any media validation, so a blocked sender learns nothing
    // from media-validation errors (no MEDIA_URL_NOT_OWNED oracle) and
    // no storage/media work happens for a send that must not exist.
    // No Message row, no outbox row, no streak, no lastMessageAt bump
    // on a blocked send: the gate throws before the transaction.
    await this.assertDirectSendNotBlocked(conversationId, senderId, activeMembers);

    // QC-F-329: bind a snap's storage mediaUrl to its sender BEFORE
    // anything is persisted. Without this, a member could store a snap
    // pointing at any storage key and later have consumeSnap presign it
    // (sender review) and hard-delete it (recipient consume). Only
    // snap-intent sends are bound here; ordinary media is QC-F-330's
    // surface, and `data:` URLs — the shipped client's only real snap
    // path — carry no storage key and are never bound.
    const isSnapSend =
      disappearMode === 'after_view' || type === 'snap_photo' || type === 'snap_video';
    if (isSnapSend && mediaUrl && !mediaUrl.startsWith('data:')) {
      if (!snapMediaKeyOwnedBy(mediaUrl, senderId)) {
        throw createAppError(
          'Snap media must reference the sender’s own upload',
          400,
          'MEDIA_URL_NOT_OWNED',
        );
      }
    }

    // QC-F-330: NON-snap media is rendered from the stored URL by other
    // members' browsers (thread/discover), so it must be own-storage or
    // inline data — never an arbitrary host (viewer IP/open-time leak +
    // post-delivery content swap). Snap sends are NOT gated here: the
    // QC-F-329 branch above owns them (a snap's stored URL is never
    // browser-loaded; consumeSnap mediates it). Every sendMessage caller
    // is bound, including the voice-notes sink (type 'audio').
    if (!isSnapSend && mediaUrl) {
      assertMediaUrlAllowed(mediaUrl, {
        ownerId: senderId,
        allowData: ['image/', 'video/', 'audio/'],
      });
    }

    // QC-F-019: persist the view-once intent the client actually sent.
    // Previously `disappearMode` never reached this service (the route
    // schema stripped it) and snap types collapse to IMAGE/VIDEO in the
    // Prisma enum, so a stored snap carried no marker consumeSnap could
    // recognise — it lived forever as ordinary media. A message is a
    // view-once snap when the client asks for 'after_view' OR uses a snap
    // type; record that in metadata in the exact shape consumeSnap reads
    // (viewOnce/isSnap + duration + snap.durationSec).
    // QC-F-274: client metadata is sanitized first (reserved server-owned
    // keys stripped, `snap` rebuilt to just its validated durationSec);
    // trusted server metadata is merged over it so the server always wins.
    const storedMetadata: Record<string, unknown> = {
      ...sanitizeClientMetadata(metadata),
      ...(serverMetadata ?? {}),
    };
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

    // Recipient set: the active members computed above (for the
    // QC-F-359 gate), minus the sender (design Algorithm 2).
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
          isAIGenerated: isAIGenerated ?? false,
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
  ): Promise<MessagePageResult> {
    // QC-F-024: verify the caller is an active member before reading any
    // message content or even the total count (both leaked to any logged-in
    // user before this check existed). Same pattern as sendMessage.
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    // QC-F-518: a HIDDEN group/channel bounds this member's history at
    // their own joinedAt — messages created before they joined are not
    // theirs to read. DIRECT conversations are never bounded (both
    // members are present from creation; the setting is rejected there
    // at write time). There is deliberately NO role exemption: a member
    // added later as ADMIN is bounded by the same joinedAt, otherwise
    // "add as admin" would be a one-step history leak. The cutoff is
    // part of the where for BOTH the page and the count — a total that
    // still counted pre-join messages would leak their number.
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, historyVisibility: true },
    });
    const joinedAt = (membership as { joinedAt?: Date }).joinedAt;
    const historyCutoff =
      conversation?.historyVisibility === 'HIDDEN' &&
      conversation.type !== 'DIRECT' &&
      joinedAt
        ? joinedAt
        : null;

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const where = {
      conversationId,
      isDeleted: false,
      ...(historyCutoff ? { createdAt: { gte: historyCutoff } } : {}),
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
      historyHidden: historyCutoff !== null,
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
      select: { conversationId: true, joinedAt: true },
    });

    const conversationIds = memberships.map((m: { conversationId: string }) => m.conversationId);

    // QC-F-518: search must not become a side door around the history
    // cutoff. A HIDDEN group/channel bounds this member's search results
    // at their own joinedAt, exactly as getMessages bounds the feed —
    // otherwise a new member could recover pre-join content one keyword
    // at a time. The bound is per conversation: unbound conversations
    // keep the original single `in:` clause byte-for-byte, and when NO
    // conversation is bound the where below is identical to the pre-fix
    // shape. DIRECT conversations are never bound (see getMessages).
    const conversations = await this.prisma.conversation.findMany({
      where: { id: { in: conversationIds } },
      select: { id: true, type: true, historyVisibility: true },
    });
    const joinedAtByConversation = new Map<string, Date>();
    for (const m of memberships as Array<{ conversationId: string; joinedAt?: Date }>) {
      if (m.joinedAt) joinedAtByConversation.set(m.conversationId, m.joinedAt);
    }
    const historyBounds = new Map<string, Date>();
    for (const conv of conversations as Array<{
      id: string;
      type: string;
      historyVisibility?: string;
    }>) {
      if (conv.historyVisibility !== 'HIDDEN' || conv.type === 'DIRECT') continue;
      const joinedAt = joinedAtByConversation.get(conv.id);
      if (joinedAt) historyBounds.set(conv.id, joinedAt);
    }

    // NOTE: A message whose content is CLIENT-side ciphertext (encrypted
    // before it reached this server — QC-F-022) cannot be searched
    // server-side; the blind index (routes/search.ts) covers that case.
    // For now, we exclude messages whose content looks like a ciphertext
    // payload from this plaintext search.
    const commonWhere = {
      isDeleted: false,
      content: { contains: query, mode: 'insensitive' as const },
      NOT: { content: { startsWith: '{"ciphertext"' } },
    };
    const where =
      historyBounds.size === 0
        ? { conversationId: { in: conversationIds }, ...commonWhere }
        : {
            OR: [
              ...(conversationIds.some((id) => !historyBounds.has(id))
                ? [
                    {
                      conversationId: {
                        in: conversationIds.filter((id) => !historyBounds.has(id)),
                      },
                      ...commonWhere,
                    },
                  ]
                : []),
              ...[...historyBounds.entries()].map(([id, joinedAt]) => ({
                conversationId: id,
                createdAt: { gte: joinedAt },
                ...commonWhere,
              })),
            ],
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

    // QC-F-329: fail closed before ANY presign/delete: a non-data snap may
    // only ever touch the sender's own storage namespace. This one gate
    // covers the sender-review mint, the recipient mint, and the recipient
    // hard-delete below — none of them may run for a foreign key, and no
    // recipient view is burned for a forged row. Rows persisted before the
    // send-bind existed (including the ownerless legacy `snaps/` shape)
    // are refused here too — there is no proof tying them to their sender,
    // so there is no grandfathering.
    const rawMediaUrlForGate = message.mediaUrl ?? '';
    if (rawMediaUrlForGate && !rawMediaUrlForGate.startsWith('data:')) {
      if (!snapMediaKeyOwnedBy(rawMediaUrlForGate, message.senderId)) {
        throw createAppError(
          'Snap media is not owned by its sender',
          403,
          'SNAP_MEDIA_NOT_OWNED',
        );
      }
    }

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

      // QC-F-274: the storage key is ALWAYS derived from the persisted
      // mediaUrl. A `metadata.storageKey` is never honoured here: before
      // the send-path sanitize existed it was fully sender-controlled, and
      // rows persisted before this fix may still carry a forged one — this
      // sender-review/consume path must not let stored client data choose
      // which bucket object gets presigned (the delete path below already
      // derived from mediaUrl only).
      const storageKey = extractStorageKey(rawMediaUrl);

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
