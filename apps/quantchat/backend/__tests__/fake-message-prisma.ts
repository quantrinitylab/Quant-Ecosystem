// ============================================================================
// Test support — in-memory fake Prisma client for MessageService outbox tests
// Spec: quantchat-launch-readiness, Tasks 11.3 (delivery atomicity) / 11.4 (E2EE send)
//
// A live PostgreSQL is not available in the sandbox, so these tests drive the
// REAL `MessageService` + real `PrismaOutboxService` against a faithful
// in-memory model of the exact Prisma operations the send path issues
// (design Algorithm 2 — "Send message with transactional outbox"):
//
//   prisma.conversationMember.findFirst   (membership / 403 check)
//   prisma.conversationMember.findMany    (active recipient set)
//   prisma.$transaction(async (tx) => {   (interactive transaction)
//       tx.message.create
//       tx.conversation.update
//       tx.messageOutbox.create           (via OutboxService.enqueue)
//   })
//
// The critical property modeled here is TRANSACTIONAL ATOMICITY: `$transaction`
// runs the callback against a STAGING buffer. Writes are flushed to the
// committed store only if the callback resolves; if the callback throws, every
// staged write (message + conversation update + outbox row) is discarded. This
// lets Property 3 (delivery atomicity) genuinely exercise rollback — a failed
// transaction must leave NO message AND NO outbox row.
//
// A failure is induced naturally: `tx.conversation.update` throws a Prisma-style
// P2025 ("record not found") when the conversation row is absent, which happens
// AFTER `tx.message.create` has already staged a row — so the test verifies the
// staged message write is actually rolled back, not merely never attempted.
//
// NOTE: this module is intentionally NOT a `*.test.ts`/`*.spec.ts` file so the
// vitest include glob does not collect it as a suite — it is a shared helper.
// ============================================================================

import type { PrismaClient } from '@prisma/client';

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  mediaUrl: string | null;
  replyToId: string | null;
  metadata: Record<string, unknown>;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutboxRow {
  id: string;
  conversationId: string;
  messageId: string;
  recipientIds: string[];
  attempts: number;
  processedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

interface ConversationRow {
  id: string;
  lastMessageAt: Date | null;
}

interface MemberRow {
  conversationId: string;
  userId: string;
  leftAt: Date | null;
}

interface CommittedStore {
  conversations: Map<string, ConversationRow>;
  members: MemberRow[];
  messages: MessageRow[];
  outbox: OutboxRow[];
}

export interface FakeMessagePrisma {
  conversationMember: {
    findFirst(args: {
      where: { conversationId: string; userId: string; leftAt: null };
    }): Promise<MemberRow | null>;
    findMany(args: {
      where: { conversationId: string; leftAt: null };
      select?: { userId?: boolean };
    }): Promise<Array<{ userId: string }>>;
  };
  $transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T>;
  /** Inspection hook for assertions — not part of the PrismaClient surface. */
  __state: CommittedStore;
}

export interface SeedConversation {
  conversationId: string;
  /** Active member user ids (none have left). */
  memberIds: string[];
  /**
   * When false, the conversation row is NOT created, so `tx.conversation.update`
   * throws inside the transaction and the whole send rolls back. Defaults true.
   */
  exists?: boolean;
}

/**
 * Build a fresh in-memory fake Prisma client. Seed conversations + their active
 * members up front; `exists: false` seeds members (so the 403 membership check
 * passes) but omits the conversation row, forcing an in-transaction failure that
 * must roll back the already-staged message write.
 */
export function createFakeMessagePrisma(seed: SeedConversation[] = []): FakeMessagePrisma {
  const store: CommittedStore = {
    conversations: new Map<string, ConversationRow>(),
    members: [],
    messages: [],
    outbox: [],
  };

  for (const s of seed) {
    if (s.exists !== false) {
      store.conversations.set(s.conversationId, {
        id: s.conversationId,
        lastMessageAt: null,
      });
    }
    for (const userId of s.memberIds) {
      store.members.push({ conversationId: s.conversationId, userId, leftAt: null });
    }
  }

  let idSeq = 0;
  const nextId = (prefix: string): string => `${prefix}_${(idSeq += 1)}`;

  return {
    conversationMember: {
      async findFirst({ where }) {
        const row = store.members.find(
          (m) =>
            m.conversationId === where.conversationId &&
            m.userId === where.userId &&
            m.leftAt === null,
        );
        return row ? { ...row } : null;
      },
      async findMany({ where, select }) {
        const rows = store.members.filter(
          (m) => m.conversationId === where.conversationId && m.leftAt === null,
        );
        if (select?.userId) {
          return rows.map((m) => ({ userId: m.userId }));
        }
        return rows.map((m) => ({ userId: m.userId }));
      },
    },

    async $transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
      // Staging buffer — writes are only flushed to `store` on successful commit.
      const staged = {
        messages: [] as MessageRow[],
        outbox: [] as OutboxRow[],
        conversationUpdates: [] as Array<{ id: string; lastMessageAt: Date }>,
      };

      const tx = {
        message: {
          async create({ data }: { data: Partial<MessageRow> }): Promise<MessageRow> {
            const now = new Date();
            const row: MessageRow = {
              id: nextId('msg'),
              conversationId: data.conversationId as string,
              senderId: data.senderId as string,
              content: data.content as string,
              type: (data.type as string) ?? 'text',
              mediaUrl: (data.mediaUrl as string | null) ?? null,
              replyToId: (data.replyToId as string | null) ?? null,
              metadata: (data.metadata as Record<string, unknown>) ?? {},
              isEdited: false,
              isDeleted: false,
              createdAt: now,
              updatedAt: now,
            };
            staged.messages.push(row);
            return { ...row };
          },
        },
        conversation: {
          async update({
            where,
            data,
          }: {
            where: { id: string };
            data: { lastMessageAt: Date };
          }): Promise<ConversationRow> {
            // Mirror Prisma's behavior: updating a non-existent row throws P2025.
            // This fires AFTER message.create has staged a row, so a thrown error
            // must roll back the staged message — exactly the atomicity guarantee.
            if (!store.conversations.has(where.id)) {
              const err = new Error(
                `An operation failed because it depends on one or more records that were required but not found. Record to update not found.`,
              );
              (err as Error & { code?: string }).code = 'P2025';
              throw err;
            }
            staged.conversationUpdates.push({ id: where.id, lastMessageAt: data.lastMessageAt });
            return { id: where.id, lastMessageAt: data.lastMessageAt };
          },
        },
        messageOutbox: {
          async create({
            data,
          }: {
            data: {
              conversationId: string;
              messageId: string;
              recipientIds: string[];
              createdAt?: Date;
            };
          }): Promise<OutboxRow> {
            const row: OutboxRow = {
              id: nextId('outbox'),
              conversationId: data.conversationId,
              messageId: data.messageId,
              recipientIds: [...data.recipientIds],
              attempts: 0,
              processedAt: null,
              lastError: null,
              createdAt: data.createdAt ?? new Date(),
            };
            staged.outbox.push(row);
            return { ...row };
          },
        },
      };

      const result = await cb(tx);

      // Reached only when the callback resolves: flush staged writes atomically.
      store.messages.push(...staged.messages);
      store.outbox.push(...staged.outbox);
      for (const u of staged.conversationUpdates) {
        const conv = store.conversations.get(u.id);
        if (conv) {
          conv.lastMessageAt = u.lastMessageAt;
        }
      }
      return result;
    },

    __state: store,
  };
}

/** Cast helper — the fake implements exactly the subset MessageService uses. */
export function asPrismaClient(fake: FakeMessagePrisma): PrismaClient {
  return fake as unknown as PrismaClient;
}
