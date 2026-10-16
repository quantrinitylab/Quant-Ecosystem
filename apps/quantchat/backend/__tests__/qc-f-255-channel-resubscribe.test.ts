// ============================================================================
// QC-F-255 — Channel leave → rejoin hamesha 500 (P2002) ka regression suite
// ============================================================================
//
// Finding: ChannelService.subscribe sirf sakriya (leftAt: null) row dekhta
// tha; chhod-chuke user ki row DB me leftAt ke saath padi rehti hai aur
// @@unique([conversationId, userId]) ki wajah se dobara create asal Prisma
// par P2002 deta hai — koi P2002-handling na hone se woh 500 banta tha.
// Fix (channel.service.ts): sakriya-jaanch → left row ko updateMany se
// REVIVE (leftAt: null, joinedAt reset, isMuted: false, lastReadAt: null,
// role APARIVARTIT) → tab create, uske gird sankeern P2002 race-catch.
//
// Is file ka fake prisma ASAL unique ko enforce karta hai — create par
// maujood (conversationId, userId) jodi dobara aaye to { code: 'P2002' }
// phenkta hai, findFirst where.leftAt ko asal me padhta hai, aur
// updateMany diye gaye where ko imaandaari se lagu karta hai. Yahi
// imaandaari maujood channel.service.test.ts ke fake me NAHI thi (C7
// andhaapan) — iske bina ye bug nakli safalta ke peeche chhupa rehta.
//
// Negative control (band signature, brief §6.1): original code par
// 6 FAIL (A-1, A-2, A-3, A-6, A-7, A-8 — saare asal P2002 par) +
// 3 control-PASS (A-4, A-5, A-9); fix ke saath 9/9 PASS.
// A-8 ka race-nakal (fake ka P2002 + vijeta-row) samantar daud ke TANTRA
// ko pin karta hai, asal samantar daud ka saboot NAHI hai — asal saboot
// verify lane ki staging yatra par owed hai (brief §7).
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ChannelService } from '../services/channel.service';
import { DiscoverService } from '../services/discover.service';

interface FakeConv {
  id: string;
  type: string;
  name: string | null;
  description: string | null;
  createdBy: string;
}

interface FakeMember {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  isMuted: boolean;
  lastReadAt: Date | null;
  leftAt: Date | null;
}

interface FakeMsg {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  createdAt: Date;
}

function p2002(): Error & { code: string } {
  const err = new Error(
    'Unique constraint failed on the fields: (`conversationId`,`userId`)',
  ) as Error & { code: string };
  err.code = 'P2002';
  return err;
}

function createHonestFakePrisma() {
  const convs = new Map<string, FakeConv>();
  const members: FakeMember[] = [];
  const messages: FakeMsg[] = [];
  let n = 0;
  let raceArmed = false;
  const createCalls: Array<Record<string, unknown>> = [];
  const updateManyCalls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> =
    [];

  const matchesWhere = (m: FakeMember, where: Record<string, unknown>): boolean => {
    if (where['conversationId'] != null && m.conversationId !== where['conversationId'])
      return false;
    if (where['userId'] != null && m.userId !== where['userId']) return false;
    if ('leftAt' in where) {
      if (where['leftAt'] === null && m.leftAt !== null) return false;
      if (where['leftAt'] instanceof Date && m.leftAt?.getTime() !== where['leftAt'].getTime())
        return false;
    }
    return true;
  };

  const prisma = {
    convs,
    members,
    messages,
    createCalls,
    updateManyCalls,
    armRace(): void {
      raceArmed = true;
    },
    conversation: {
      async create(args: { data: Record<string, unknown> }): Promise<FakeConv> {
        n += 1;
        const c: FakeConv = {
          id: `conv-${n}`,
          type: String(args.data['type']),
          name: (args.data['name'] as string) ?? null,
          description: (args.data['description'] as string) ?? null,
          createdBy: String(args.data['createdBy']),
        };
        convs.set(c.id, c);
        return c;
      },
      async findUnique(args: { where: { id: string } }): Promise<FakeConv | null> {
        return convs.get(args.where.id) ?? null;
      },
      async findMany(): Promise<FakeConv[]> {
        return [...convs.values()];
      },
    },
    conversationMember: {
      async create(args: { data: Record<string, unknown> }): Promise<FakeMember> {
        createCalls.push(args.data);
        const conversationId = String(args.data['conversationId']);
        const userId = String(args.data['userId']);
        if (raceArmed) {
          // Samantar daud ka nakal: vijeta ki sakriya row pehle ghus gayi,
          // is create ko asal Prisma wala P2002 mila.
          raceArmed = false;
          n += 1;
          const winner: FakeMember = {
            id: `m-${n}`,
            conversationId,
            userId,
            role: String(args.data['role'] ?? 'MEMBER'),
            joinedAt: new Date(),
            isMuted: false,
            lastReadAt: null,
            leftAt: null,
          };
          members.push(winner);
          throw p2002();
        }
        // ASAL @@unique([conversationId, userId]) enforcement — left row
        // bhi jodi ko rokti hai, bilkul asal Prisma ki tarah.
        if (members.some((m) => m.conversationId === conversationId && m.userId === userId)) {
          throw p2002();
        }
        n += 1;
        const m: FakeMember = {
          id: `m-${n}`,
          conversationId,
          userId,
          role: String(args.data['role']),
          joinedAt: (args.data['joinedAt'] as Date) ?? new Date(),
          isMuted: Boolean(args.data['isMuted'] ?? false),
          lastReadAt: (args.data['lastReadAt'] as Date | null) ?? null,
          leftAt: null,
        };
        members.push(m);
        return m;
      },
      async findFirst(args: {
        where: Record<string, unknown>;
      }): Promise<FakeMember | null> {
        return members.find((m) => matchesWhere(m, args.where)) ?? null;
      },
      async findMany(args: { where: Record<string, unknown> }): Promise<FakeMember[]> {
        return members.filter((m) => matchesWhere(m, args.where));
      },
      async count(args: { where: Record<string, unknown> }): Promise<number> {
        return members.filter((m) => matchesWhere(m, args.where)).length;
      },
      async updateMany(args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }): Promise<{ count: number }> {
        updateManyCalls.push({ where: args.where, data: args.data });
        let count = 0;
        for (const m of members) {
          if (!matchesWhere(m, args.where)) continue;
          const row = m as unknown as Record<string, unknown>;
          for (const [k, v] of Object.entries(args.data)) row[k] = v;
          count += 1;
        }
        return { count };
      },
    },
    message: {
      async create(args: { data: Record<string, unknown> }): Promise<FakeMsg> {
        n += 1;
        const msg: FakeMsg = {
          id: `msg-${n}`,
          conversationId: String(args.data['conversationId']),
          senderId: String(args.data['senderId']),
          content: (args.data['content'] as string) ?? null,
          createdAt: new Date(Date.now() + n),
        };
        messages.push(msg);
        return msg;
      },
      async findMany(args: {
        where: Record<string, unknown>;
        take?: number;
      }): Promise<FakeMsg[]> {
        const rows = messages
          .filter((m) => m.conversationId === args.where['conversationId'])
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return typeof args.take === 'number' ? rows.slice(0, args.take) : rows;
      },
      async count(args: { where: Record<string, unknown> }): Promise<number> {
        return messages.filter((m) => m.conversationId === args.where['conversationId']).length;
      },
    },
    reel: {
      async findMany(): Promise<never[]> {
        return [];
      },
    },
    user: {
      async findMany(): Promise<never[]> {
        return [];
      },
    },
  };
  return prisma;
}

type FakePrisma = ReturnType<typeof createHonestFakePrisma>;

describe('QC-F-255 ChannelService resubscribe (leave → rejoin)', () => {
  let prisma: FakePrisma;
  let svc: ChannelService;

  beforeEach(() => {
    prisma = createHonestFakePrisma();
    svc = new ChannelService(prisma as never);
  });

  it('A-1: subscribe → unsubscribe → subscribe safal hai, ek hi row, feed khulta hai', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.subscribe(ch.id, 'reader-1');
    await svc.publish(ch.id, 'owner-1', 'hello subscribers');
    await svc.unsubscribe(ch.id, 'reader-1');

    const res = await svc.subscribe(ch.id, 'reader-1');
    expect(res).toEqual({ subscribed: true });

    const rows = prisma.members.filter((m) => m.userId === 'reader-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.leftAt).toBeNull();
    expect(await svc.subscriberCount(ch.id)).toBe(2); // owner + lautne wala
    const feed = await svc.getMessages(ch.id, 'reader-1');
    expect(feed.messages.map((m) => m.content)).toEqual(['hello subscribers']);
  });

  it('A-2: revive par joinedAt reset hota hai aur create-parity fields laut-te hain', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.subscribe(ch.id, 'reader-1');
    const row = prisma.members.find((m) => m.userId === 'reader-1')!;
    const puranaJoinedAt = new Date('2020-01-01T00:00:00Z');
    row.joinedAt = puranaJoinedAt;
    row.isMuted = true;
    row.lastReadAt = new Date('2020-06-01T00:00:00Z');
    await svc.unsubscribe(ch.id, 'reader-1');

    await svc.subscribe(ch.id, 'reader-1');
    expect(row.leftAt).toBeNull();
    expect(row.joinedAt.getTime()).toBeGreaterThan(puranaJoinedAt.getTime());
    expect(row.isMuted).toBe(false);
    expect(row.lastReadAt).toBeNull();
  });

  it('A-3: revive role NAHI chhoota — OWNER/ADMIN lautne par wahi role barkarar', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.unsubscribe(ch.id, 'owner-1');
    await svc.subscribe(ch.id, 'owner-1');
    const ownerRow = prisma.members.find((m) => m.userId === 'owner-1')!;
    expect(ownerRow.role).toBe('OWNER');
    expect(await svc.canPost(ch.id, 'owner-1')).toBe(true);

    // Seed ki hui ADMIN left-row (channel me promote-raasta NAHI hai,
    // isiliye seed hi ekmatra raasta hai — brief §6.1 A-3).
    prisma.members.push({
      id: 'm-seed-admin',
      conversationId: ch.id,
      userId: 'admin-1',
      role: 'ADMIN',
      joinedAt: new Date('2021-01-01T00:00:00Z'),
      isMuted: false,
      lastReadAt: null,
      leftAt: new Date('2021-02-01T00:00:00Z'),
    });
    await svc.subscribe(ch.id, 'admin-1');
    const adminRow = prisma.members.find((m) => m.userId === 'admin-1')!;
    expect(adminRow.role).toBe('ADMIN');
    expect(adminRow.leftAt).toBeNull();
    expect(await svc.canPost(ch.id, 'admin-1')).toBe(true);
  });

  it('A-4 (control): sakriya member ka dobara subscribe kuch NAHI likhta', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.subscribe(ch.id, 'reader-1');
    prisma.createCalls.length = 0;
    prisma.updateManyCalls.length = 0;

    await svc.subscribe(ch.id, 'reader-1');
    expect(prisma.createCalls).toHaveLength(0);
    expect(prisma.updateManyCalls).toHaveLength(0);
    expect(prisma.members.filter((m) => m.userId === 'reader-1')).toHaveLength(1);
  });

  it('A-5 (control): pehli baar subscribe create-raaste se MEMBER row banata hai', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    const res = await svc.subscribe(ch.id, 'reader-1');
    expect(res).toEqual({ subscribed: true });
    const row = prisma.members.find((m) => m.userId === 'reader-1')!;
    expect(row.role).toBe('MEMBER');
    expect(row.leftAt).toBeNull();
    expect(row.isMuted).toBe(false);
    expect(row.lastReadAt).toBeNull();
    expect(row.joinedAt).toBeInstanceOf(Date);
  });

  it('A-6: Discover raaste se bhi leave → rejoin safal hai', async () => {
    const discover = new DiscoverService(prisma as never);
    const ch = await svc.createChannel('owner-1', { name: 'News' });

    const first = await discover.subscribe('reader-1', ch.id);
    expect(first).toEqual({ subscribed: true, alreadySubscribed: false, subscriberCount: 2 });

    await svc.unsubscribe(ch.id, 'reader-1');

    const second = await discover.subscribe('reader-1', ch.id);
    expect(second).toEqual({ subscribed: true, alreadySubscribed: false, subscriberCount: 2 });
    expect(prisma.members.filter((m) => m.userId === 'reader-1')).toHaveLength(1);
  });

  it('A-7: revive ke baad unsubscribe phir kaam karta hai (jeevan-chakra dohraane yogya)', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.subscribe(ch.id, 'reader-1');
    await svc.unsubscribe(ch.id, 'reader-1');
    await svc.subscribe(ch.id, 'reader-1');

    const res = await svc.unsubscribe(ch.id, 'reader-1');
    expect(res).toEqual({ unsubscribed: true });
    expect(await svc.subscriberCount(ch.id)).toBe(1); // sirf owner
  });

  it('A-8: create-race me P2002 aaye aur vijeta sakriya ho to subscribe safal hai', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    prisma.armRace();
    const res = await svc.subscribe(ch.id, 'reader-1');
    expect(res).toEqual({ subscribed: true });
    const rows = prisma.members.filter((m) => m.userId === 'reader-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.leftAt).toBeNull();
  });

  it('A-9 (control): gayab channel par 404, revive/create kabhi NAHI chalta', async () => {
    await expect(svc.subscribe('missing', 'u1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CHANNEL_NOT_FOUND',
    });
    expect(prisma.createCalls).toHaveLength(0);
    expect(prisma.updateManyCalls).toHaveLength(0);
  });
});
