// ============================================================================
// QuantChat — Durable Notification Writer (QC-F-101)
//
// The Prisma `Notification` model (packages/database, table `notifications`)
// is the cross-app inbox row every sibling app writes — QuantMail
// (`inbound-webhook.ts`), QuantGram (`post.service.ts`), QuantWave
// (`notification.service.ts`). QuantChat's backend never wrote it: no
// writer, no list endpoint, and the web `getNotifications()` was a phantom.
// This small service is the single writer, in the codebase's structural-
// prisma style (same as `notifications.ts`'s `PrismaPushClient` — only the
// delegates this service actually calls are declared, so no generated
// Prisma client is needed to type it).
//
// Two write paths:
//   1. `notifyMessageSent` — called by MessageService AFTER commit,
//      best-effort (never blocks/fails delivery), one `createMany` per send.
//   2. `notifySpotlightFeatured` — called by the spotlight GET route when a
//      reel becomes newly featured; DB-deduped so a creator is notified
//      exactly once per reel, ever.
//
// HONESTY (the load-bearing rule, QC-F-101 §2g): title/body are ALWAYS
// generic. Message content — plaintext or client-encrypted ciphertext —
// NEVER lands in a notification row. `body` is literally 'New message'.
// No sender-hydration on the list path either (that is a v2 follow-up).
// ============================================================================
import type { Prisma, PrismaClient } from '@prisma/client';

export interface NotificationCreateInput {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  actionUrl?: string | null;
  sourceApp?: string | null;
  sourceUserId?: string | null;
  sourceEntityId?: string | null;
  // Prisma.InputJsonValue keeps the Json column type-exact; the service
  // constructor takes the real PrismaClient, so no structural widening here.
  data?: Prisma.InputJsonValue;
}

export interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  actionUrl: string | null;
  sourceApp: string | null;
  sourceUserId: string | null;
  sourceEntityId: string | null;
  data: unknown;
  priority: string;
  isRead: boolean;
  readAt: Date | null;
  sentVia: unknown;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Minimal Prisma surface the notification writer needs. Method syntax is
 * intentionally used (bivariant) so a real `PrismaClient` is assignable.
 */
export interface NotificationPrismaLike {
  notification: {
    createMany(args: { data: NotificationCreateInput[] }): Promise<{ count: number }>;
    create(args: { data: NotificationCreateInput }): Promise<NotificationRow>;
    findFirst(args: {
      where?: Record<string, unknown>;
      select?: Record<string, boolean>;
    }): Promise<{ id: string } | null>;
    findMany(args: {
      where?: unknown;
      orderBy?: unknown;
      take?: number;
    }): Promise<NotificationRow[]>;
    findUnique(args: { where: { id: string } }): Promise<NotificationRow | null>;
    update(args: { where: { id: string }; data: unknown }): Promise<NotificationRow>;
    updateMany(args: { where: unknown; data: unknown }): Promise<{ count: number }>;
    count(args: { where: unknown }): Promise<number>;
  };
  user: {
    findUnique(args: {
      where: { id: string };
      select: { displayName: true; username: true; avatarUrl: true };
    }): Promise<{
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
    } | null>;
  };
  conversation: {
    findUnique(args: {
      where: { id: string };
      select: { name: true; type: true };
    }): Promise<{ name: string | null; type: string } | null>;
  };
}

export interface MemberMuteInfo {
  userId: string;
  isMuted: boolean;
  muteUntil: Date | null;
}

export interface MessageNotificationInput {
  senderId: string;
  conversationId: string;
  messageId: string;
  /** Active members (mute fields included); the sender is filtered out here. */
  members: MemberMuteInfo[];
}

const GENERIC_BODY = 'New message';
const FALLBACK_TITLE = 'QuantChat';

function firstNonBlank(...values: Array<string | null | undefined>): string | undefined {
  for (const v of values) {
    if (v && v.trim().length > 0) return v;
  }
  return undefined;
}

export class NotificationService {
  // The constructor takes the real PrismaClient (the codebase's established
  // pattern — a structural interface cannot be satisfied by Prisma's generic
  // delegates, TS2345). Tests pass fakes via `as never`; production passes
  // the decorated client. NotificationPrismaLike below remains the narrow
  // cast type used by the routes' getNotificationPrisma helper.
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Post-commit fan-out for one sent message: exactly one durable row per
   * unmuted recipient, a single `createMany`. The sender never gets a row
   * (self-exclusion), and a muted member whose mute is still active never
   * gets one. All lookups happen inside this method so the caller's
   * post-commit block stays small; a caller wraps this in try/catch —
   * delivery must never depend on inbox rows.
   */
  async notifyMessageSent(input: MessageNotificationInput): Promise<void> {
    const now = new Date();
    const recipientIds = input.members
      .filter((m) => m.userId !== input.senderId)
      .filter((m) => !(m.isMuted && (m.muteUntil === null || m.muteUntil > now)))
      .map((m) => m.userId);
    if (recipientIds.length === 0) return;

    const [sender, conversation] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: input.senderId },
        select: { displayName: true, username: true, avatarUrl: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: { name: true, type: true },
      }),
    ]);

    const senderName =
      firstNonBlank(sender?.displayName, sender?.username) ?? FALLBACK_TITLE;
    // DIRECT: the person is the news. GROUP/CHANNEL: the place is the news,
    // falling back to the person, then to the app name. Never the content.
    const title =
      conversation?.type === 'DIRECT'
        ? senderName
        : (firstNonBlank(conversation?.name) ?? senderName);

    const rows: NotificationCreateInput[] = recipientIds.map((userId) => ({
      userId,
      type: 'message',
      title,
      body: GENERIC_BODY,
      imageUrl: sender?.avatarUrl ?? null,
      // notification-deeplink.ts's MESSAGES mapping, verbatim: /chat/<id>.
      actionUrl: `/chat/${input.conversationId}`,
      sourceApp: 'quantchat',
      sourceUserId: input.senderId,
      sourceEntityId: input.messageId,
      // Ids only — never content, never ciphertext (QC-F-101 §3.2).
      data: {
        conversationId: input.conversationId,
        messageId: input.messageId,
        category: 'MESSAGES',
      },
    }));

    await this.prisma.notification.createMany({ data: rows });
  }

  /**
   * "Your reel is featured" row. DB-deduped on (userId, type,
   * sourceEntityId) so a creator is notified exactly once per reel, ever —
   * this is the only replica-safe guard (each backend instance keeps its own
   * in-memory Spotlight cache). Returns true when a row was created.
   */
  async notifySpotlightFeatured(input: {
    creatorId: string;
    reelId: string;
    thumbnailUrl?: string | null;
  }): Promise<boolean> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId: input.creatorId,
        type: 'spotlight_featured',
        sourceEntityId: input.reelId,
      },
      select: { id: true },
    });
    if (existing) return false;

    await this.prisma.notification.create({
      data: {
        userId: input.creatorId,
        type: 'spotlight_featured',
        title: 'Your reel is featured in Spotlight',
        body: 'Your reel made the Spotlight featured list.',
        imageUrl: input.thumbnailUrl ?? null,
        // /spotlight is a real page; /reels/<id> does not exist (QC-F-101 §2f).
        actionUrl: '/spotlight',
        sourceApp: 'quantchat',
        // System event — no human actor; no invented actor either.
        sourceUserId: null,
        sourceEntityId: input.reelId,
        data: { reelId: input.reelId, category: 'REELS' },
      },
    });
    return true;
  }
}
