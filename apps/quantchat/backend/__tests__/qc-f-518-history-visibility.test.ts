// ===========================================================================
// QC-F-518 — Group history visibility regression tests
// ===========================================================================
//
// Until this fix, adding a member to a group handed them the ENTIRE prior
// record unconditionally: MessageService.getMessages/searchMessages and
// ChannelService.getMessages bounded reads only by membership, never by
// the member's joinedAt, and the Conversation model had no way to even
// express a different choice.
//
// These tests run the REAL services against one shared in-memory,
// WHERE-AWARE Prisma fake with stable module-level identities. The fake
// honours conversationId / isDeleted / content-contains / createdAt-gte /
// OR clauses, so a service that forgets the cutoff actually leaks rows
// here — the negative control (same file against pre-fix services) fails
// on exactly the leak assertions (T-518-1/2/6), the toggle tests
// (T-518-11/13, routes file) and the rejoin test (T-518-10, P2002).
// ===========================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The services only need the Prisma enum *values* at runtime; stub them
// the same way conversation.service.test.ts does (values match the
// schema). HistoryVisibility is a TYPE-only import in the services, so
// it needs no runtime entry here.
vi.mock('@prisma/client', () => ({
  Prisma: {},
  PrismaClient: class {
    constructor(..._args: unknown[]) {}
  },
  ConversationType: { DIRECT: 'DIRECT', GROUP: 'GROUP', CHANNEL: 'CHANNEL' },
  ConversationRole: { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
  MessageType: { SYSTEM: 'SYSTEM', TEXT: 'TEXT' },
}));

import { ConversationService } from '../services/conversation.service';
import { MessageService } from '../services/message.service';
import { ChannelService } from '../services/channel.service';

// ---- Stable identities + clock -------------------------------------------
const OWNER = 'user_owner';
const FOUNDER = 'user_founder';
const LATE = 'user_late';
const LATE_ADMIN = 'user_late_admin';
const OUTSIDER = 'user_outsider';

const T0 = new Date('2026-01-01T00:00:00.000Z');
const T1 = new Date('2026-01-01T01:00:00.000Z'); // pre-join message
const T2 = new Date('2026-01-01T02:00:00.000Z'); // LATE joins here
const T3 = new Date('2026-01-01T03:00:00.000Z'); // post-join message

// ---- Row shapes ------------------------------------------------------------
interface ConvRow {
  id: string;
  type: string;
  name: string | null;
  description: string | null;
  createdBy: string;
  historyVisibility: string;
  isArchived: boolean;
  lastMessageAt: Date | null;
  metadata: Record<string, unknown>;
}
interface MemberRow {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  leftAt: Date | null;
  joinedAt: Date;
  isMuted: boolean;
  lastReadAt: Date | null;
}
interface MsgRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  mediaUrl: string | null;
  metadata: Record<string, unknown>;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---- WHERE matcher for messages -------------------------------------------
function matchMsg(row: MsgRow, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === 'OR') {
      const clauses = cond as Array<Record<string, unknown>>;
      if (!clauses.some((c) => matchMsg(row, c))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (matchMsg(row, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (key === 'conversationId') {
      if (typeof cond === 'string') {
        if (row.conversationId !== cond) return false;
      } else if (!((cond as { in: string[] }).in ?? []).includes(row.conversationId)) {
        return false;
      }
      continue;
    }
    if (key === 'id') {
      if (typeof cond === 'string') {
        if (row.id !== cond) return false;
      } else if ((cond as { lt?: string }).lt !== undefined) {
        if (!(row.id < (cond as { lt: string }).lt)) return false;
      }
      continue;
    }
    if (key === 'isDeleted') {
      if (row.isDeleted !== cond) return false;
      continue;
    }
    if (key === 'content') {
      const c = cond as { contains?: string; mode?: string; startsWith?: string };
      if (c.contains !== undefined) {
        const hay = c.mode === 'insensitive' ? row.content.toLowerCase() : row.content;
        const needle = c.mode === 'insensitive' ? c.contains.toLowerCase() : c.contains;
        if (!hay.includes(needle)) return false;
      }
      if (c.startsWith !== undefined && !row.content.startsWith(c.startsWith)) return false;
      continue;
    }
    if (key === 'createdAt') {
      // Prisma equality form (`createdAt: <Date>`, used by the channel
      // cursor's tie-break clause) means exact timestamp equality — the
      // {gte}/{lt} object form is handled below.
      if (cond instanceof Date) {
        if (row.createdAt.getTime() !== cond.getTime()) return false;
        continue;
      }
      const c = cond as { gte?: Date; lt?: Date };
      if (c.gte !== undefined && !(row.createdAt >= c.gte)) return false;
      if (c.lt !== undefined && !(row.createdAt < c.lt)) return false;
      continue;
    }
    // Unknown keys are ignored by design of this harness (select/include
    // never reach the message matcher).
  }
  return true;
}

function sortMessages(rows: MsgRow[], orderBy: unknown): MsgRow[] {
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Array<
    Record<string, string>
  >;
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const field = Object.keys(k)[0] as 'createdAt' | 'id';
      const dir = k[field] === 'desc' ? -1 : 1;
      const av = a[field] instanceof Date ? (a[field] as Date).getTime() : String(a[field]);
      const bv = b[field] instanceof Date ? (b[field] as Date).getTime() : String(b[field]);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
    }
    return 0;
  });
}

// ---- The shared fake --------------------------------------------------------
function makeFake() {
  const conversations = new Map<string, ConvRow>();
  const members: MemberRow[] = [];
  const messages: MsgRow[] = [];
  let seq = 0;
  const nextId = (p: string) => `${p}-${(seq += 1)}`;

  const prisma = {
    conversation: {
      async findUnique({ where }: { where: { id: string } }) {
        const row = conversations.get(where.id);
        return row ? { ...row } : null;
      },
      async findMany({ where }: { where?: { id?: { in: string[] } } }) {
        const ids = where?.id?.in;
        return [...conversations.values()]
          .filter((c) => !ids || ids.includes(c.id))
          .map((c) => ({ ...c }));
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row: ConvRow = {
          id: nextId('conv'),
          type: data.type as string,
          name: (data.name as string | null) ?? null,
          description: (data.description as string | null) ?? null,
          createdBy: data.createdBy as string,
          historyVisibility: (data.historyVisibility as string) ?? 'VISIBLE',
          isArchived: false,
          lastMessageAt: (data.lastMessageAt as Date) ?? null,
          metadata: (data.metadata as Record<string, unknown>) ?? {},
        };
        conversations.set(row.id, row);
        return { ...row };
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = conversations.get(where.id);
        if (!row) throw new Error('P2025');
        Object.assign(row, data);
        return { ...row };
      },
    },
    conversationMember: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        const row = members.find(
          (m) =>
            m.conversationId === where.conversationId &&
            (where.userId === undefined || m.userId === where.userId) &&
            (where.leftAt === undefined || m.leftAt === where.leftAt),
        );
        return row ? { ...row } : null;
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return members
          .filter(
            (m) =>
              (where.conversationId === undefined || m.conversationId === where.conversationId) &&
              (where.userId === undefined || m.userId === where.userId) &&
              (where.leftAt === undefined || m.leftAt === where.leftAt),
          )
          .map((m) => ({ ...m }));
      },
      async create({ data }: { data: Record<string, unknown> }) {
        // Mirror @@unique([conversationId, userId]): a second row for the
        // same pair is a P2002 — this is what makes T-518-10 fail on the
        // pre-fix addMember (no revive) exactly as production did.
        if (
          members.some(
            (m) => m.conversationId === data.conversationId && m.userId === data.userId,
          )
        ) {
          const err = new Error('Unique constraint failed') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        const row: MemberRow = {
          id: nextId('mem'),
          conversationId: data.conversationId as string,
          userId: data.userId as string,
          role: (data.role as string) ?? 'MEMBER',
          leftAt: null,
          joinedAt: (data.joinedAt as Date) ?? new Date(),
          isMuted: (data.isMuted as boolean) ?? false,
          lastReadAt: (data.lastReadAt as Date | null) ?? null,
        };
        members.push(row);
        return { ...row };
      },
      async createMany({ data }: { data: Array<Record<string, unknown>> }) {
        for (const d of data) await prisma.conversationMember.create({ data: d });
        return { count: data.length };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const row = members.find((m) => m.id === where.id);
        if (!row) throw new Error('P2025');
        Object.assign(row, data);
        return { ...row };
      },
      async updateMany({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) {
        let count = 0;
        for (const m of members) {
          if (m.conversationId === where.conversationId && m.userId === where.userId) {
            Object.assign(m, data);
            count += 1;
          }
        }
        return { count };
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return members.filter(
          (m) =>
            m.conversationId === where.conversationId &&
            (where.leftAt === undefined || m.leftAt === where.leftAt),
        ).length;
      },
    },
    message: {
      async findMany(args: {
        where: Record<string, unknown>;
        skip?: number;
        take?: number;
        orderBy?: unknown;
      }) {
        let rows = messages.filter((m) => matchMsg(m, args.where));
        if (args.orderBy) rows = sortMessages(rows, args.orderBy);
        const skip = args.skip ?? 0;
        const take = args.take ?? rows.length;
        return rows.slice(skip, skip + take).map((r) => ({ ...r }));
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return messages.filter((m) => matchMsg(m, where)).length;
      },
      async findFirst({ where }: { where: Record<string, unknown> }) {
        const row = messages.find((m) => matchMsg(m, where));
        return row ? { ...row } : null;
      },
    },
    user: {
      async findUnique({ where }: { where: { id: string } }) {
        return { id: where.id, preferences: null };
      },
    },
    async $transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
      return cb(prisma);
    },
  };

  // Seed helpers (direct store writes — the scenarios under test).
  function seedConversation(row: Partial<ConvRow> & { id: string }) {
    conversations.set(row.id, {
      type: 'GROUP',
      name: 'Group',
      description: null,
      createdBy: OWNER,
      historyVisibility: 'VISIBLE',
      isArchived: false,
      lastMessageAt: null,
      metadata: {},
      ...row,
    });
  }
  function seedMember(row: Partial<MemberRow> & { conversationId: string; userId: string }) {
    members.push({
      id: nextId('mem'),
      role: 'MEMBER',
      leftAt: null,
      joinedAt: T0,
      isMuted: false,
      lastReadAt: null,
      ...row,
    });
  }
  function seedMessage(row: Partial<MsgRow> & { id: string; conversationId: string }) {
    messages.push({
      senderId: OWNER,
      content: 'hello',
      type: 'TEXT',
      mediaUrl: null,
      metadata: {},
      isDeleted: false,
      createdAt: T1,
      updatedAt: T1,
      ...row,
    });
  }

  return { prisma, conversations, members, messages, seedConversation, seedMember, seedMessage };
}

const allowAllPrivacy = {
  checkCanMessage: async () => 'allowed' as const,
  checkBlockedBy: async () => 'clear' as const,
};

describe('QC-F-518 history visibility', () => {
  let fake: ReturnType<typeof makeFake>;
  let conversations: ConversationService;
  let messagesSvc: MessageService;
  let channels: ChannelService;

  beforeEach(() => {
    fake = makeFake();
    conversations = new ConversationService(fake.prisma as never, allowAllPrivacy as never);
    messagesSvc = new MessageService(fake.prisma as never);
    channels = new ChannelService(fake.prisma as never);
  });

  /** Hidden group: FOUNDER from T0, LATE joined at T2; messages at T1/T3. */
  function seedHiddenGroup() {
    fake.seedConversation({ id: 'g1', type: 'GROUP', historyVisibility: 'HIDDEN' });
    fake.seedMember({ conversationId: 'g1', userId: OWNER, role: 'OWNER', joinedAt: T0 });
    fake.seedMember({ conversationId: 'g1', userId: FOUNDER, role: 'MEMBER', joinedAt: T0 });
    fake.seedMember({ conversationId: 'g1', userId: LATE, role: 'MEMBER', joinedAt: T2 });
    fake.seedMessage({ id: 'm-old', conversationId: 'g1', content: 'secret old hello', createdAt: T1 });
    fake.seedMessage({ id: 'm-new', conversationId: 'g1', content: 'fresh new hello', createdAt: T3 });
  }

  it('T-518-1: hidden group — late member sees only post-join messages, and total does not leak the hidden count', async () => {
    seedHiddenGroup();
    const page = await messagesSvc.getMessages('g1', LATE);
    expect(page.data.map((m) => m.id)).toEqual(['m-new']);
    expect(page.total).toBe(1);
    expect(page.historyHidden).toBe(true);
  });

  it('T-518-2: hidden group — search cannot recover pre-join content, post-join content still found', async () => {
    seedHiddenGroup();
    const oldSearch = await messagesSvc.searchMessages(LATE, 'secret');
    expect(oldSearch.total).toBe(0);
    expect(oldSearch.data).toEqual([]);
    const newSearch = await messagesSvc.searchMessages(LATE, 'fresh');
    expect(newSearch.data.map((m) => m.id)).toEqual(['m-new']);
    // The founder (joined at T0) still finds both via the same path.
    const founderOld = await messagesSvc.searchMessages(FOUNDER, 'secret');
    expect(founderOld.data.map((m) => m.id)).toEqual(['m-old']);
  });

  it('T-518-3: boundary — a message at exactly joinedAt is visible (gte), 1ms before is not', async () => {
    fake.seedConversation({ id: 'g1', type: 'GROUP', historyVisibility: 'HIDDEN' });
    fake.seedMember({ conversationId: 'g1', userId: LATE, role: 'MEMBER', joinedAt: T2 });
    fake.seedMessage({
      id: 'm-just-before',
      conversationId: 'g1',
      createdAt: new Date(T2.getTime() - 1),
    });
    fake.seedMessage({ id: 'm-at-join', conversationId: 'g1', createdAt: T2 });
    const page = await messagesSvc.getMessages('g1', LATE);
    expect(page.data.map((m) => m.id)).toEqual(['m-at-join']);
  });

  it('T-518-4: founding member of a hidden group keeps the full history', async () => {
    seedHiddenGroup();
    const page = await messagesSvc.getMessages('g1', FOUNDER);
    expect(page.data.map((m) => m.id).sort()).toEqual(['m-new', 'm-old']);
    expect(page.total).toBe(2);
    expect(page.historyHidden).toBe(true);
  });

  it('T-518-5: no role exemption — a late-joined ADMIN is bounded by the same joinedAt', async () => {
    seedHiddenGroup();
    fake.seedMember({ conversationId: 'g1', userId: LATE_ADMIN, role: 'ADMIN', joinedAt: T2 });
    const page = await messagesSvc.getMessages('g1', LATE_ADMIN);
    expect(page.data.map((m) => m.id)).toEqual(['m-new']);
    expect(page.total).toBe(1);
  });

  it('T-518-6: hidden channel — feed is bounded, and a pre-join cursor cannot page under the cutoff', async () => {
    fake.seedConversation({ id: 'c1', type: 'CHANNEL', historyVisibility: 'HIDDEN' });
    fake.seedMember({ conversationId: 'c1', userId: OWNER, role: 'OWNER', joinedAt: T0 });
    fake.seedMember({ conversationId: 'c1', userId: LATE, role: 'MEMBER', joinedAt: T2 });
    fake.seedMessage({ id: 'p-old', conversationId: 'c1', content: 'old post', createdAt: T1 });
    fake.seedMessage({ id: 'p-new', conversationId: 'c1', content: 'new post', createdAt: T3 });

    const feed = await channels.getMessages('c1', LATE);
    expect(feed.messages.map((m) => m.id)).toEqual(['p-new']);
    expect(feed.historyHidden).toBe(true);
    expect(feed.hasMore).toBe(false);

    const under = await channels.getMessages('c1', LATE, { before: 'p-old' });
    expect(under.messages).toEqual([]);
    expect(under.historyHidden).toBe(true);
  });

  it('T-518-7: visible group — behaviour is byte-for-byte the old one (no cutoff, historyHidden false)', async () => {
    fake.seedConversation({ id: 'g1', type: 'GROUP', historyVisibility: 'VISIBLE' });
    fake.seedMember({ conversationId: 'g1', userId: LATE, role: 'MEMBER', joinedAt: T2 });
    fake.seedMessage({ id: 'm-old', conversationId: 'g1', content: 'secret old hello', createdAt: T1 });
    fake.seedMessage({ id: 'm-new', conversationId: 'g1', content: 'fresh new hello', createdAt: T3 });

    const page = await messagesSvc.getMessages('g1', LATE);
    expect(page.data.map((m) => m.id).sort()).toEqual(['m-new', 'm-old']);
    expect(page.total).toBe(2);
    expect(page.historyHidden).toBe(false);

    const search = await messagesSvc.searchMessages(LATE, 'secret');
    expect(search.data.map((m) => m.id)).toEqual(['m-old']);

    fake.seedConversation({ id: 'c1', type: 'CHANNEL', historyVisibility: 'VISIBLE' });
    fake.seedMember({ conversationId: 'c1', userId: LATE, role: 'MEMBER', joinedAt: T2 });
    fake.seedMessage({ id: 'p-old', conversationId: 'c1', createdAt: T1 });
    const feed = await channels.getMessages('c1', LATE);
    expect(feed.messages.map((m) => m.id)).toEqual(['p-old']);
    expect(feed.historyHidden).toBe(false);
  });

  it('T-518-8: DIRECT is never bounded, even if the row somehow says HIDDEN', async () => {
    fake.seedConversation({ id: 'd1', type: 'DIRECT', historyVisibility: 'HIDDEN' });
    fake.seedMember({ conversationId: 'd1', userId: LATE, role: 'MEMBER', joinedAt: T2 });
    fake.seedMessage({ id: 'm-old', conversationId: 'd1', createdAt: T1 });
    const page = await messagesSvc.getMessages('d1', LATE);
    expect(page.data.map((m) => m.id)).toEqual(['m-old']);
    expect(page.historyHidden).toBe(false);
  });

  it('T-518-10: rejoin — a removed member can be re-added (no P2002), gets a FRESH joinedAt, and the old ADMIN role does not revive', async () => {
    fake.seedConversation({ id: 'g1', type: 'GROUP', historyVisibility: 'HIDDEN' });
    fake.seedMember({ conversationId: 'g1', userId: OWNER, role: 'OWNER', joinedAt: T0 });
    // LATE was an ADMIN, then was removed (leftAt stamped, row remains).
    fake.seedMember({
      conversationId: 'g1',
      userId: LATE,
      role: 'ADMIN',
      joinedAt: T0,
      leftAt: T1,
    });
    fake.seedMessage({ id: 'm-old', conversationId: 'g1', createdAt: T1 });
    fake.seedMessage({ id: 'm-new', conversationId: 'g1', createdAt: T3 });

    const row = await conversations.addMember('g1', OWNER, LATE);
    expect(row.leftAt).toBeNull();
    expect(row.role).toBe('MEMBER'); // adder supplied no role — old ADMIN must NOT revive
    expect(new Date(row.joinedAt as unknown as string).getTime()).toBeGreaterThan(T2.getTime());

    // After the rejoin, pre-rejoin history (incl. the member's own first
    // stint) stays hidden; only messages from the fresh joinedAt on show.
    // m-new (T3) predates the rejoin instant (now), so the page is empty
    // but honestly flagged.
    const page = await messagesSvc.getMessages('g1', LATE);
    expect(page.data).toEqual([]);
    expect(page.historyHidden).toBe(true);
  });

  it('T-518-11 (service half): toggle is admin-only — plain MEMBER gets NOT_CONVERSATION_ADMIN, outsider NOT_A_MEMBER', async () => {
    seedHiddenGroup();
    await expect(
      conversations.updateConversation('g1', LATE, { historyVisibility: 'visible' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_CONVERSATION_ADMIN' });
    await expect(
      conversations.updateConversation('g1', OUTSIDER, { historyVisibility: 'visible' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_A_MEMBER' });
    // A member's archive-only update still works (pre-existing behaviour).
    const archived = await conversations.updateConversation('g1', LATE, { isArchived: true });
    expect(archived.isArchived).toBe(true);
  });

  it('T-518-12: toggling hidden→visible restores the full history (visibility, not deletion) and back', async () => {
    seedHiddenGroup();
    const before = await messagesSvc.getMessages('g1', LATE);
    expect(before.data.map((m) => m.id)).toEqual(['m-new']);

    await conversations.updateConversation('g1', OWNER, { historyVisibility: 'visible' });
    const open = await messagesSvc.getMessages('g1', LATE);
    expect(open.data.map((m) => m.id).sort()).toEqual(['m-new', 'm-old']);
    expect(open.historyHidden).toBe(false);

    await conversations.updateConversation('g1', OWNER, { historyVisibility: 'hidden' });
    const closed = await messagesSvc.getMessages('g1', LATE);
    expect(closed.data.map((m) => m.id)).toEqual(['m-new']);
  });

  it('T-518-8b: setting historyVisibility on a DIRECT conversation is rejected honestly (400), not silently stored', async () => {
    fake.seedConversation({ id: 'd1', type: 'DIRECT', historyVisibility: 'VISIBLE' });
    fake.seedMember({ conversationId: 'd1', userId: OWNER, role: 'OWNER', joinedAt: T0 });
    await expect(
      conversations.updateConversation('d1', OWNER, { historyVisibility: 'hidden' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'HISTORY_VISIBILITY_NOT_APPLICABLE' });
  });

  it('channel view carries the setting (visible/hidden) for clients', async () => {
    fake.seedConversation({ id: 'c1', type: 'CHANNEL', historyVisibility: 'HIDDEN' });
    fake.seedMember({ conversationId: 'c1', userId: OWNER, role: 'OWNER', joinedAt: T0 });
    const list = await channels.listChannels(OWNER);
    expect(list).toHaveLength(1);
    expect(list[0]!.historyVisibility).toBe('hidden');
  });
});
