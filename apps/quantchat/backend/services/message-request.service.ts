// ============================================================================
// QuantChat — MessageRequestService (QC-F-321)
// ============================================================================
//
// First-contact consent surface. The whoCanMessage gate (QC-F-042/277) is
// binary by design: a stranger either may start a conversation or gets a
// 403 MESSAGE_NOT_ALLOWED dead end. With the default 'friends' setting,
// two brand-new users could never start a first chat at all — the gate was
// right, but there was no livable path around it. This service is that
// path: the sender's first message waits as a PENDING MessageRequest (it
// is NOT a Message and belongs to NO conversation) until the target
// accepts — only then is a real DIRECT conversation created and the
// message delivered as its first Message — or declines, which is
// terminal for the ordered pair.
//
// Eligibility is deliberately narrow (specialist-qc-f-321-buildprep.md):
//   - a request exists ONLY for the 'friends' + not-a-friend denial. A
//     target who chose 'nobody' chose "no one" — that opt-out is never
//     reinterpreted as a requests inbox (403, no row).
//   - a target who blocked the sender gets the same indistinguishable
//     403 MESSAGE_NOT_ALLOWED (a distinct code would turn block into a
//     signal that tells the sender they are blocked), and no row.
//   - pairs the gate would ALLOW never create requests (409
//     MESSAGE_REQUEST_NOT_NEEDED) — consent theatre for an open door
//     would be a lie about what the gate does.
//   - every uncertain read (prefs error, malformed block list) fails
//     closed with 503 UPSTREAM_UNAVAILABLE and no row, mirroring the
//     gate's own doctrine.
//
// The shipped gate is NOT modified by this service: checkCanMessage,
// assertCanMessage, isFriendOf and every default stay exactly as they
// are. Accept never re-runs the gate — the target's Accept IS the
// consent the gate exists to obtain.

import { createAppError } from '@quant/server-core';
import { getPrivacyService, type PrivacyService } from './privacy.service';

/** Longest allowed first message (after trim). A request is an introduction, not an essay. */
export const MAX_REQUEST_MESSAGE_CHARS = 1000;
/** Most simultaneous outgoing PENDING requests one sender may hold. */
export const MAX_PENDING_REQUESTS_OUT = 20;
/** Inbox / sent list page size for Slice 1 (pagination is a later slice). */
export const MESSAGE_REQUEST_LIST_LIMIT = 50;

export type MessageRequestStatusValue = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface MessageRequestParty {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MessageRequestDto {
  id: string;
  senderId: string;
  targetId: string;
  firstMessage: string;
  status: MessageRequestStatusValue;
  conversationId: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface InboxMessageRequestDto {
  id: string;
  sender: MessageRequestParty;
  firstMessage: string;
  createdAt: string;
}

export interface SentMessageRequestDto {
  id: string;
  target: MessageRequestParty;
  firstMessage: string;
  status: MessageRequestStatusValue;
  conversationId: string | null;
  createdAt: string;
  respondedAt: string | null;
}

interface MessageRequestRow {
  id: string;
  senderId: string;
  targetId: string;
  firstMessage: string;
  status: MessageRequestStatusValue;
  conversationId: string | null;
  createdAt: Date;
  respondedAt: Date | null;
  sender?: MessageRequestParty;
  target?: MessageRequestParty;
}

interface UserRow {
  id?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
  deletedAt?: Date | null;
  preferences?: unknown;
}

/**
 * Minimal structural Prisma surface this service needs (fake-prisma
 * testable, PrivacyPrismaLike style). The routes layer passes the real
 * client; the generated client gains the messageRequest delegate from
 * the QC-F-321 schema model.
 */
export interface MessageRequestPrismaLike {
  user: {
    findUnique: (args: unknown) => Promise<UserRow | null>;
  };
  messageRequest: {
    findUnique: (args: unknown) => Promise<MessageRequestRow | null>;
    findMany: (args: unknown) => Promise<MessageRequestRow[]>;
    count: (args: unknown) => Promise<number>;
    create: (args: unknown) => Promise<MessageRequestRow>;
    update: (args: unknown) => Promise<MessageRequestRow>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  conversation: {
    create: (args: unknown) => Promise<{ id: string }>;
  };
  conversationMember: {
    createMany: (args: unknown) => Promise<{ count: number }>;
  };
  message: {
    create: (args: unknown) => Promise<{ id: string }>;
  };
  $transaction: <T>(
    fn: (tx: MessageRequestPrismaLike) => Promise<T>,
  ) => Promise<T>;
}

function toDto(row: MessageRequestRow): MessageRequestDto {
  return {
    id: row.id,
    senderId: row.senderId,
    targetId: row.targetId,
    firstMessage: row.firstMessage,
    status: row.status,
    conversationId: row.conversationId ?? null,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

export class MessageRequestService {
  private readonly privacy: PrivacyService;

  constructor(private readonly prisma: MessageRequestPrismaLike) {
    // The SHARED PrivacyService instance (one cache per prisma client) —
    // never a second instance, so PUT /settings invalidation reaches us.
    this.privacy = getPrivacyService(prisma);
  }

  private async findPairRow(
    senderId: string,
    targetId: string,
  ): Promise<MessageRequestRow | null> {
    return this.prisma.messageRequest.findUnique({
      where: { senderId_targetId: { senderId, targetId } },
    });
  }

  /**
   * Create (or honestly report) a first-contact request. The step order
   * is load-bearing: pair state first (idempotency / terminal decline),
   * then target existence, then the blocked check, then gate
   * eligibility, then the outgoing cap — each failure leaves NO row.
   */
  async createRequest(
    senderId: string,
    targetId: string,
    rawMessage: string,
  ): Promise<{ request: MessageRequestDto; created: boolean }> {
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    if (!message || message.length > MAX_REQUEST_MESSAGE_CHARS) {
      throw createAppError(
        `Message request text must be between 1 and ${MAX_REQUEST_MESSAGE_CHARS} characters`,
        400,
        'BAD_REQUEST',
      );
    }
    if (senderId === targetId) {
      throw createAppError(
        'You cannot send a message request to yourself',
        400,
        'BAD_REQUEST',
      );
    }

    const existing = await this.findPairRow(senderId, targetId);
    if (existing) {
      if (existing.status === 'PENDING') {
        // Idempotent: the FIRST text stays the record; a repeat send
        // never silently rewrites the pending introduction.
        return { request: toDto(existing), created: false };
      }
      if (existing.status === 'DECLINED') {
        throw createAppError(
          'Your request was declined — you cannot send another one',
          403,
          'MESSAGE_REQUEST_DECLINED',
        );
      }
      // ACCEPTED: the pair already has a conversation; the gate now
      // allows a direct create, so a request is never needed again.
      throw createAppError(
        'A conversation already exists for this pair',
        409,
        'MESSAGE_REQUEST_NOT_NEEDED',
      );
    }

    const targetRow = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, deletedAt: true },
    });
    if (!targetRow || targetRow.deletedAt != null) {
      throw createAppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Blocked check runs in THIS service (not only inside the gate): a
    // blocked sender must not reach the target's Requests inbox either.
    const blockedVerdict = await this.privacy.checkBlockedBy(targetId, senderId);
    if (blockedVerdict === 'blocked') {
      // Indistinguishable from an ordinary denial on purpose.
      throw createAppError(
        'This user is not accepting new messages',
        403,
        'MESSAGE_NOT_ALLOWED',
      );
    }
    if (blockedVerdict === 'unavailable') {
      throw createAppError(
        'Privacy preferences are temporarily unavailable',
        503,
        'UPSTREAM_UNAVAILABLE',
      );
    }

    const { prefs, source } = await this.privacy.resolve(targetId);
    if (source === 'error' || source === 'missing') {
      // 'missing' cannot happen after the row check above; if it ever
      // does, the honest answer is the same fail-closed 503.
      throw createAppError(
        'Privacy preferences are temporarily unavailable',
        503,
        'UPSTREAM_UNAVAILABLE',
      );
    }
    if (prefs.whoCanMessage === 'everyone') {
      throw createAppError(
        'This user accepts direct messages — no request is needed',
        409,
        'MESSAGE_REQUEST_NOT_NEEDED',
      );
    }
    if (prefs.whoCanMessage === 'nobody') {
      throw createAppError(
        'This user is not accepting new messages',
        403,
        'MESSAGE_NOT_ALLOWED',
      );
    }
    // 'friends': a friend never needs a request.
    if (await this.privacy.isFriendOf(targetId, senderId)) {
      throw createAppError(
        'You can already message this user directly',
        409,
        'MESSAGE_REQUEST_NOT_NEEDED',
      );
    }

    const pendingOut = await this.prisma.messageRequest.count({
      where: { senderId, status: 'PENDING' },
    });
    if (pendingOut >= MAX_PENDING_REQUESTS_OUT) {
      throw createAppError(
        'Too many pending message requests — wait for responses before sending more',
        429,
        'MESSAGE_REQUEST_LIMIT',
      );
    }

    try {
      const row = await this.prisma.messageRequest.create({
        data: { senderId, targetId, firstMessage: message, status: 'PENDING' },
      });
      return { request: toDto(row), created: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // A concurrent POST for the same pair won the race: answer exactly
      // as if this call had seen that row (never a 500 for a lost race).
      const winner = await this.findPairRow(senderId, targetId);
      if (winner && winner.status === 'PENDING') {
        return { request: toDto(winner), created: false };
      }
      if (winner && winner.status === 'DECLINED') {
        throw createAppError(
          'Your request was declined — you cannot send another one',
          403,
          'MESSAGE_REQUEST_DECLINED',
        );
      }
      throw createAppError(
        'A conversation already exists for this pair',
        409,
        'MESSAGE_REQUEST_NOT_NEEDED',
      );
    }
  }

  /** Pending requests addressed to `userId`, newest first. */
  async listInbox(userId: string): Promise<InboxMessageRequestDto[]> {
    const rows = await this.prisma.messageRequest.findMany({
      where: { targetId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: MESSAGE_REQUEST_LIST_LIMIT,
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      sender: row.sender ?? {
        id: row.senderId,
        username: '',
        displayName: '',
        avatarUrl: null,
      },
      firstMessage: row.firstMessage,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Every request `userId` has sent, newest first, with its true state. */
  async listSent(userId: string): Promise<SentMessageRequestDto[]> {
    const rows = await this.prisma.messageRequest.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: 'desc' },
      take: MESSAGE_REQUEST_LIST_LIMIT,
      include: {
        target: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      target: row.target ?? {
        id: row.targetId,
        username: '',
        displayName: '',
        avatarUrl: null,
      },
      firstMessage: row.firstMessage,
      status: row.status,
      conversationId: row.conversationId ?? null,
      createdAt: row.createdAt.toISOString(),
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
    }));
  }

  private async loadForResponse(
    requestId: string,
    actorId: string,
  ): Promise<MessageRequestRow> {
    const row = await this.prisma.messageRequest.findUnique({
      where: { id: requestId },
    });
    if (!row) {
      throw createAppError('Message request not found', 404, 'MESSAGE_REQUEST_NOT_FOUND');
    }
    if (row.targetId !== actorId) {
      throw createAppError(
        'Only the recipient can respond to a message request',
        403,
        'NOT_REQUEST_RECIPIENT',
      );
    }
    return row;
  }

  /**
   * Accept: consent IS the authorization — the gate is not re-run. One
   * transaction creates the DIRECT conversation (sender OWNER, target
   * MEMBER, mirroring ConversationService.createConversation's shapes),
   * delivers firstMessage as its first Message, and marks the request
   * ACCEPTED with the conversation id. All four writes or none.
   *
   * Concurrency (QC-F-363): the status check above is only a fast path.
   * The transaction's FIRST step is an atomic CAS claim — an updateMany
   * predicated on the row still being PENDING (the QC-F-095 precedent)
   * — so two concurrent accepts can never both create a conversation:
   * exactly one caller claims the row, and the loser writes nothing and
   * is answered from a post-transaction reread with the winner's own
   * conversationId (or 409 when a concurrent decline won). The claim
   * writes ACCEPTED directly: the status enum has no intermediate
   * value, the write is invisible outside the transaction until commit,
   * and any failure below rolls it back to PENDING. Sender liveness is
   * re-checked inside the transaction after the claim — a sender who
   * was deleted after sending gets no conversation (410; the rollback
   * leaves the request PENDING, never a fabricated DECLINED). The claim
   * closes the race for THIS request row only; two opposite-direction
   * rows for the same pair are QC-F-323's dedup slice, not this one's.
   */
  async accept(
    requestId: string,
    actorId: string,
  ): Promise<{ request: MessageRequestDto; conversationId: string }> {
    const row = await this.loadForResponse(requestId, actorId);
    if (row.status === 'ACCEPTED') {
      // Idempotent: the same conversation, never a second one.
      return { request: toDto(row), conversationId: row.conversationId ?? '' };
    }
    if (row.status === 'DECLINED') {
      throw createAppError(
        'This message request is no longer pending',
        409,
        'MESSAGE_REQUEST_NOT_PENDING',
      );
    }

    // One full attempt plus a single retry for the contradictory reread
    // (the claim winner's transaction rolled back, or its ACCEPTED row
    // is not yet visible with a conversationId). On real Postgres the
    // retry is near-unreachable — the claim loser waits on the row lock
    // and reads committed state — but the bound keeps every outcome
    // honest instead of guessing.
    for (let attempt = 0; attempt < 2; attempt++) {
      const now = new Date();
      const updated = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.messageRequest.updateMany({
          where: { id: row.id, status: 'PENDING' },
          data: { status: 'ACCEPTED', respondedAt: now },
        });
        if (claim.count === 0) {
          // A concurrent response won the claim. Write nothing; the
          // caller re-reads the row outside the transaction and answers
          // with its true terminal state.
          return null;
        }

        const sender = await tx.user.findUnique({
          where: { id: row.senderId },
          select: { id: true, deletedAt: true },
        });
        if (!sender || sender.deletedAt != null) {
          // The request was real once; the sender is gone now. The
          // throw rolls the claim back with everything else, so the
          // request stays PENDING and the recipient can still decline
          // it to clear the inbox.
          throw createAppError(
            'The sender of this request is no longer available',
            410,
            'MESSAGE_REQUEST_SENDER_GONE',
          );
        }

        const conversation = await tx.conversation.create({
          data: {
            type: 'DIRECT',
            name: null,
            description: null,
            createdBy: row.senderId,
            lastMessageAt: now,
            metadata: {},
          },
        });
        await tx.conversationMember.createMany({
          data: [
            {
              conversationId: conversation.id,
              userId: row.senderId,
              role: 'OWNER',
              joinedAt: now,
              nickname: null,
              isMuted: false,
              lastReadAt: now,
            },
            {
              conversationId: conversation.id,
              userId: row.targetId,
              role: 'MEMBER',
              joinedAt: now,
              nickname: null,
              isMuted: false,
              lastReadAt: null,
            },
          ],
        });
        await tx.message.create({
          data: {
            conversationId: conversation.id,
            senderId: row.senderId,
            type: 'TEXT',
            content: row.firstMessage,
          },
        });
        // Only the claim winner ever reaches this update, and the claim
        // holds the row until commit — no concurrent writer can move
        // the status in between — so setting conversationId here needs
        // no predicate of its own. status/respondedAt were already
        // written by the claim above and are NOT written again.
        return tx.messageRequest.update({
          where: { id: row.id },
          data: { conversationId: conversation.id },
        });
      });

      if (updated) {
        return {
          request: toDto(updated),
          conversationId: updated.conversationId ?? '',
        };
      }

      // Claim lost: answer from the row's true (committed) state — the
      // winner's conversation is a real success for this caller too.
      const fresh = await this.prisma.messageRequest.findUnique({
        where: { id: row.id },
      });
      if (fresh && fresh.status === 'ACCEPTED' && fresh.conversationId) {
        return { request: toDto(fresh), conversationId: fresh.conversationId };
      }
      if (fresh && fresh.status === 'DECLINED') {
        throw createAppError(
          'This message request is no longer pending',
          409,
          'MESSAGE_REQUEST_NOT_PENDING',
        );
      }
      // Contradictory reread: loop retries the whole accept once.
    }

    throw createAppError(
      'Message request state is temporarily unavailable',
      503,
      'UPSTREAM_UNAVAILABLE',
    );
  }

  /** Decline: terminal for the pair; never creates anything. */
  async decline(
    requestId: string,
    actorId: string,
  ): Promise<{ request: MessageRequestDto }> {
    const row = await this.loadForResponse(requestId, actorId);
    if (row.status === 'DECLINED') {
      return { request: toDto(row) };
    }
    if (row.status === 'ACCEPTED') {
      throw createAppError(
        'This message request is no longer pending',
        409,
        'MESSAGE_REQUEST_NOT_PENDING',
      );
    }

    // QC-F-363: a single conditional update IS the atomic claim — one
    // statement needs no transaction. Whoever claims the PENDING row
    // first owns the terminal state: a concurrent accept can neither be
    // overwritten by this write (DECLINED landing on a live conversation)
    // nor overwrite it (a declined request silently ACCEPTED). The
    // loser is answered from a reread, exactly like accept's.
    for (let attempt = 0; attempt < 2; attempt++) {
      const claim = await this.prisma.messageRequest.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });
      const fresh = await this.prisma.messageRequest.findUnique({
        where: { id: row.id },
      });
      if (claim.count === 1) {
        // updateMany returns no row; re-read our own committed win.
        if (fresh) return { request: toDto(fresh) };
      } else {
        if (fresh && fresh.status === 'DECLINED') {
          // A concurrent decline won — the same terminal truth.
          return { request: toDto(fresh) };
        }
        if (fresh && fresh.status === 'ACCEPTED') {
          throw createAppError(
            'This message request is no longer pending',
            409,
            'MESSAGE_REQUEST_NOT_PENDING',
          );
        }
      }
      // Contradictory reread (row still PENDING — the claim winner's
      // transaction rolled back): retry once, then fail closed below.
    }

    throw createAppError(
      'Message request state is temporarily unavailable',
      503,
      'UPSTREAM_UNAVAILABLE',
    );
  }
}
