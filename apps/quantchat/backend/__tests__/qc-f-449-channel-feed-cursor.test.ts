// ============================================================================
// QC-F-449 — Channel feed archive: composite `before` cursor (service layer)
// ============================================================================
// Finding: the channel feed was a 50-post window with NO way back — the
// service had no cursor param at all (limit cap 100 was the hard archive
// ceiling). Fix (specialist-qc-f-449-buildprep §3.1, BAND): getMessages takes
// an options object { limit?, before? }; `before` is a message id resolved
// INSIDE the channel AFTER the membership gate; the page filter is the
// composite tuple (createdAt < c.createdAt) OR (createdAt = c.createdAt AND
// id < c.id) under the single total order [{createdAt desc},{id desc}];
// take = capped+1 probe drives hasMore/nextCursor; an unknown or foreign
// cursor fails closed 400 INVALID_CURSOR (never a silent page-1 fallback).
//
// This fake implements the REAL query semantics (composite where, array
// orderBy, take, findFirst) — it is not a stub that returns canned pages.
// Negative-control signature (§5.5): on the original service T1/T2/T3/T6/
// T7/T8 FAIL (old signature ignores the options object and returns a bare
// array, so .messages/.hasMore are undefined); T4 is a control-PASS (the
// 403 gate predates the fix — the cursor must not bypass it); T5 fails on
// the page-shape assertions only.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ChannelService } from '../services/channel.service';

interface Conv {
  id: string;
  type: string;
  name: string | null;
  description: string | null;
  createdBy: string;
}
interface Member {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  leftAt: Date | null;
}
interface Msg {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  createdAt: Date;
}

type Where = Record<string, unknown>;

function matchesScalar(row: Msg, where: Where): boolean {
  if (where['conversationId'] != null && row.conversationId !== where['conversationId'])
    return false;
  if (typeof where['id'] === 'string' && row.id !== where['id']) return false;
  const created = where['createdAt'];
  if (created instanceof Date) {
    if (row.createdAt.getTime() !== created.getTime()) return false;
  } else if (created && typeof created === 'object') {
    const lt = (created as { lt?: Date }).lt;
    if (lt && !(row.createdAt.getTime() < lt.getTime())) return false;
  }
  const idCond = where['id'];
  if (idCond && typeof idCond === 'object') {
    const lt = (idCond as { lt?: string }).lt;
    if (lt && !(row.id < lt)) return false;
  }
  return true;
}

function matchesWhere(row: Msg, where: Where): boolean {
  const or = where['OR'] as Where[] | undefined;
  if (Array.isArray(or)) {
    const base: Where = { ...where };
    delete base['OR'];
    if (!matchesScalar(row, base)) return false;
    return or.some((branch) => matchesScalar(row, branch));
  }
  return matchesScalar(row, where);
}

function createFakePrisma() {
  const convs = new Map<string, Conv>();
  const members: Member[] = [];
  const messages: Msg[] = [];
  let n = 0;
  const pad = (x: number) => String(x).padStart(6, '0');
  return {
    convs,
    members,
    messages,
    conversation: {
      async create({ data }: { data: Where }) {
        n += 1;
        const c: Conv = {
          id: `conv-${pad(n)}`,
          type: String(data['type']),
          name: (data['name'] as string) ?? null,
          description: (data['description'] as string) ?? null,
          createdBy: String(data['createdBy']),
        };
        convs.set(c.id, c);
        return c;
      },
      async findUnique({ where }: { where: { id: string } }) {
        return convs.get(where.id) ?? null;
      },
    },
    conversationMember: {
      async create({ data }: { data: Where }) {
        n += 1;
        const m: Member = {
          id: `m-${pad(n)}`,
          conversationId: String(data['conversationId']),
          userId: String(data['userId']),
          role: String(data['role']),
          leftAt: null,
        };
        members.push(m);
        return m;
      },
      async findFirst({ where }: { where: Where }) {
        return (
          members.find(
            (m) =>
              m.conversationId === where['conversationId'] &&
              m.userId === where['userId'] &&
              m.leftAt === null,
          ) ?? null
        );
      },
      async findMany({ where }: { where: Where }) {
        return members.filter((m) => {
          if (where['userId'] != null && m.userId !== where['userId']) return false;
          if (where['conversationId'] != null && m.conversationId !== where['conversationId'])
            return false;
          if ('leftAt' in where && where['leftAt'] === null && m.leftAt !== null) return false;
          return true;
        });
      },
      async count({ where }: { where: Where }) {
        return members.filter(
          (m) => m.conversationId === where['conversationId'] && m.leftAt === null,
        ).length;
      },
      async updateMany({ where, data }: { where: Where; data: Where }) {
        let count = 0;
        for (const m of members) {
          if (
            m.conversationId === where['conversationId'] &&
            m.userId === where['userId'] &&
            m.leftAt === null
          ) {
            m.leftAt = data['leftAt'] as Date;
            count += 1;
          }
        }
        return { count };
      },
    },
    message: {
      async create({ data }: { data: Where }) {
        n += 1;
        const msg: Msg = {
          id: `msg-${pad(n)}`,
          conversationId: String(data['conversationId']),
          senderId: String(data['senderId']),
          content: (data['content'] as string) ?? null,
          createdAt: new Date(1_700_000_000_000 + n * 1000),
        };
        messages.push(msg);
        return msg;
      },
      async findFirst({ where }: { where: Where }) {
        return messages.find((m) => matchesWhere(m, where)) ?? null;
      },
      async findMany({
        where,
        orderBy,
        take,
      }: {
        where: Where;
        orderBy?: Where | Where[];
        take?: number;
      }) {
        const rows = messages.filter((m) => matchesWhere(m, where));
        const keys = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        rows.sort((a, b) => {
          for (const k of keys) {
            if ('createdAt' in k) {
              const d = b.createdAt.getTime() - a.createdAt.getTime();
              if (d !== 0) return k['createdAt'] === 'desc' ? d : -d;
            }
            if ('id' in k) {
              const d = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
              if (d !== 0) return k['id'] === 'desc' ? -d : d;
            }
          }
          return 0;
        });
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
    },
  };
}

type FakePrisma = ReturnType<typeof createFakePrisma>;

async function seedChannel(
  svc: ChannelService,
  prisma: FakePrisma,
  count: number,
): Promise<{ channelId: string; ids: string[] }> {
  const ch = await svc.createChannel('owner-1', { name: 'News' });
  await svc.subscribe(ch.id, 'reader-1');
  const ids: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const msg = await svc.publish(ch.id, 'owner-1', `post-${i}`);
    ids.push(msg.id);
  }
  void prisma;
  return { channelId: ch.id, ids };
}

describe('QC-F-449 ChannelService.getMessages cursor', () => {
  let prisma: FakePrisma;
  let svc: ChannelService;

  beforeEach(() => {
    prisma = createFakePrisma();
    svc = new ChannelService(prisma as never);
  });

  it('T1: 120-post archive pages 50/50/20 to the very first post, no dupes', async () => {
    const { channelId, ids } = await seedChannel(svc, prisma, 120);
    const seen: string[] = [];
    const sizes: number[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const res = await svc.getMessages(channelId, 'reader-1', { before: cursor });
      sizes.push(res.messages.length);
      // each page internally chronological
      const pageIds = res.messages.map((m) => m.id);
      expect(pageIds).toEqual([...pageIds].sort());
      seen.push(...pageIds);
      if (!res.hasMore) {
        expect(res.nextCursor).toBeNull();
        break;
      }
      expect(res.nextCursor).toBe(res.messages[0]!.id);
      cursor = res.nextCursor ?? undefined;
    }
    expect(sizes).toEqual([50, 50, 20]);
    expect(new Set(seen).size).toBe(120);
    expect(seen.sort()).toEqual([...ids].sort());
    // the oldest post (first published) is reachable — last page, first item
    const last = await svc.getMessages(channelId, 'reader-1', {
      before: ids[20],
    });
    expect(last.messages[0]!.id).toBe(ids[0]);
  });

  it('T2: cursor is stable when new posts arrive between pages (no skip/dupe)', async () => {
    const { channelId, ids } = await seedChannel(svc, prisma, 80);
    const page1 = await svc.getMessages(channelId, 'reader-1', {});
    expect(page1.messages).toHaveLength(50);
    const cursor = page1.nextCursor;
    expect(cursor).toBe(ids[30]);

    // Control: page 2 before any new posts.
    const control = await svc.getMessages(channelId, 'reader-1', { before: cursor! });

    // 3 new posts land, then the same cursor is used again.
    await svc.publish(channelId, 'owner-1', 'new-1');
    await svc.publish(channelId, 'owner-1', 'new-2');
    await svc.publish(channelId, 'owner-1', 'new-3');
    const page2 = await svc.getMessages(channelId, 'reader-1', { before: cursor! });

    expect(page2.messages.map((m) => m.id)).toEqual(control.messages.map((m) => m.id));
    expect(page2.messages.map((m) => m.id)).toEqual(ids.slice(0, 30));
    const overlap = page2.messages.filter((m) => page1.messages.some((p) => p.id === m.id));
    expect(overlap).toHaveLength(0);
    expect(page2.hasMore).toBe(false);
  });

  it('T3: identical createdAt ties page deterministically via the id tie-break', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'Ties' });
    await svc.subscribe(ch.id, 'reader-1');
    const stamp = new Date(1_700_000_500_000);
    for (const id of ['tie-a', 'tie-b', 'tie-c', 'tie-d', 'tie-e']) {
      prisma.messages.push({
        id,
        conversationId: ch.id,
        senderId: 'owner-1',
        content: `c-${id}`,
        createdAt: stamp,
      });
    }
    const walk = async () => {
      const pages: string[][] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 5; i += 1) {
        const res = await svc.getMessages(ch.id, 'reader-1', { limit: 2, before: cursor });
        pages.push(res.messages.map((m) => m.id));
        if (!res.hasMore) break;
        cursor = res.nextCursor ?? undefined;
      }
      return pages;
    };
    const first = await walk();
    const second = await walk();
    expect(second).toEqual(first);
    expect(first).toEqual([['tie-d', 'tie-e'], ['tie-b', 'tie-c'], ['tie-a']]);
    expect(first.flat().sort()).toEqual(['tie-a', 'tie-b', 'tie-c', 'tie-d', 'tie-e']);
  });

  it('T4 (control): non-member gets 403 NOT_A_MEMBER even with a real cursor; left member 403 too', async () => {
    const { channelId, ids } = await seedChannel(svc, prisma, 5);
    await expect(
      svc.getMessages(channelId, 'stranger', { before: ids[2] }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_A_MEMBER' });
    await svc.unsubscribe(channelId, 'reader-1');
    await expect(svc.getMessages(channelId, 'reader-1', {})).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_A_MEMBER',
    });
  });

  it('T5: empty channel returns an honest empty page (200 shape, no error)', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'Empty' });
    const res = await svc.getMessages(ch.id, 'owner-1', {});
    // QC-F-518 pin update: ChannelFeedPage now always carries historyHidden
    expect(res).toEqual({ messages: [], hasMore: false, nextCursor: null, historyHidden: false });
  });

  it('T6: unknown and foreign cursors fail closed 400 INVALID_CURSOR (no page-1 fallback)', async () => {
    const a = await seedChannel(svc, prisma, 3);
    const other = await svc.createChannel('owner-1', { name: 'Other' });
    await svc.subscribe(other.id, 'reader-1');
    const foreign = await svc.publish(other.id, 'owner-1', 'elsewhere');
    await expect(
      svc.getMessages(a.channelId, 'reader-1', { before: 'does-not-exist' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_CURSOR' });
    await expect(
      svc.getMessages(a.channelId, 'reader-1', { before: foreign.id }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_CURSOR' });
  });

  it('T7: limit is capped per page at 100; limit=1 pages one at a time', async () => {
    const { channelId, ids } = await seedChannel(svc, prisma, 120);
    const big = await svc.getMessages(channelId, 'reader-1', { limit: 200 });
    expect(big.messages).toHaveLength(100);
    expect(big.hasMore).toBe(true);
    expect(big.nextCursor).toBe(big.messages[0]!.id);
    const one = await svc.getMessages(channelId, 'reader-1', { limit: 1 });
    expect(one.messages).toHaveLength(1);
    expect(one.messages[0]!.id).toBe(ids[119]);
    expect(one.hasMore).toBe(true);
    expect(one.nextCursor).toBe(ids[119]);
  });

  it('T8: before = the oldest post id is the honest end (empty page, 200 shape)', async () => {
    const { channelId, ids } = await seedChannel(svc, prisma, 4);
    const res = await svc.getMessages(channelId, 'reader-1', { before: ids[0] });
    // QC-F-518 pin update: ChannelFeedPage now always carries historyHidden
    expect(res).toEqual({ messages: [], hasMore: false, nextCursor: null, historyHidden: false });
  });
});
