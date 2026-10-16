import { describe, it, expect, beforeEach } from 'vitest';
import { ChannelService, type ChannelPrisma } from '../services/channel.service';

// QC-F-396 — ChannelService.subscriberCount had NO gate at all: it counted
// active members for ANY conversation id, so the subscribers/count endpoint
// leaked the member count of private DIRECT/GROUP conversations to any
// logged-in user, and 0-vs->0 acted as an existence oracle.
// Locked rule (specialist-qc-f-396-buildprep.md §2.1): the id MUST name a
// real CHANNEL — DIRECT/GROUP/nonexistent all fail with the same
// 404 CHANNEL_NOT_FOUND requireChannel already throws everywhere else in
// this class. For a real channel the count stays public-to-authenticated
// (Discover's listPublishers publishes the same number next to the
// Subscribe button), so there is deliberately NO membership gate and the
// signature stays caller-less (listChannels and QC-F-346's getStats call
// it unchanged).
// Negative-control signature (§6.3): on the original code S01/S02/S03 FAIL
// (they resolve 2 / 3 / 0 — no rejection exists); S04/S05 are controls
// that PASS on both sides.

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

function createFakePrisma() {
  const convs = new Map<string, Conv>();
  const members: Member[] = [];
  const messages: Msg[] = [];
  let n = 0;
  const prisma: ChannelPrisma & { convs: Map<string, Conv>; members: Member[]; messages: Msg[] } = {
    convs,
    members,
    messages,
    conversation: {
      async create({ data }) {
        n += 1;
        const c: Conv = {
          id: `conv-${n}`,
          type: String(data['type']),
          name: (data['name'] as string) ?? null,
          description: (data['description'] as string) ?? null,
          createdBy: String(data['createdBy']),
        };
        convs.set(c.id, c);
        return c;
      },
      async findUnique({ where }) {
        return convs.get(where.id) ?? null;
      },
    },
    conversationMember: {
      async create({ data }) {
        n += 1;
        const m: Member = {
          id: `m-${n}`,
          conversationId: String(data['conversationId']),
          userId: String(data['userId']),
          role: String(data['role']),
          leftAt: null,
        };
        members.push(m);
        return m;
      },
      async findFirst({ where }) {
        return (
          members.find(
            (m) =>
              m.conversationId === where['conversationId'] &&
              m.userId === where['userId'] &&
              m.leftAt === null,
          ) ?? null
        );
      },
      async findMany({ where }) {
        return members.filter((m) => {
          if (where['userId'] != null && m.userId !== where['userId']) return false;
          if (where['conversationId'] != null && m.conversationId !== where['conversationId'])
            return false;
          if ('leftAt' in where && where['leftAt'] === null && m.leftAt !== null) return false;
          return true;
        });
      },
      async count({ where }) {
        return members.filter(
          (m) => m.conversationId === where['conversationId'] && m.leftAt === null,
        ).length;
      },
      async updateMany({ where, data }) {
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
      async create({ data }) {
        n += 1;
        const msg: Msg = {
          id: `msg-${n}`,
          conversationId: String(data['conversationId']),
          senderId: String(data['senderId']),
          content: (data['content'] as string) ?? null,
          createdAt: new Date(Date.now() + n),
        };
        messages.push(msg);
        return msg;
      },
      async findFirst({ where }) {
        return (
          messages.find(
            (m) => m.conversationId === where['conversationId'] && m.id === where['id'],
          ) ?? null
        );
      },
      async findMany({ where, take }) {
        const rows = messages
          .filter((m) => m.conversationId === where['conversationId'])
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
    },
  };
  return prisma;
}

describe('QC-F-396 ChannelService.subscriberCount type gate', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let svc: ChannelService;
  let seedSeq = 0;

  function seedConversation(id: string, type: string) {
    prisma.convs.set(id, { id, type, name: null, description: null, createdBy: 'seed-owner' });
  }
  function seedMember(conversationId: string, userId: string, role = 'MEMBER', left = false) {
    seedSeq += 1;
    prisma.members.push({
      id: `seed-m-${seedSeq}`,
      conversationId,
      userId,
      role,
      leftAt: left ? new Date() : null,
    });
  }

  beforeEach(() => {
    prisma = createFakePrisma();
    svc = new ChannelService(prisma as never);
    seedSeq = 0;
  });

  it('T396-S01: DIRECT id rejects 404 CHANNEL_NOT_FOUND (count never leaks)', async () => {
    seedConversation('conv-direct', 'DIRECT');
    seedMember('conv-direct', 'u-a');
    seedMember('conv-direct', 'u-b');
    await expect(svc.subscriberCount('conv-direct')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CHANNEL_NOT_FOUND',
    });
  });

  it('T396-S02: GROUP id rejects 404 CHANNEL_NOT_FOUND (3 active + 1 left never counted out)', async () => {
    seedConversation('conv-group', 'GROUP');
    seedMember('conv-group', 'u-a', 'OWNER');
    seedMember('conv-group', 'u-b');
    seedMember('conv-group', 'u-c');
    seedMember('conv-group', 'u-d', 'MEMBER', true);
    await expect(svc.subscriberCount('conv-group')).rejects.toMatchObject({
      statusCode: 404,
      code: 'CHANNEL_NOT_FOUND',
    });
  });

  it('T396-S03: nonexistent id error is indistinguishable from the DIRECT error (oracle closed)', async () => {
    seedConversation('conv-direct', 'DIRECT');
    seedMember('conv-direct', 'u-a');
    seedMember('conv-direct', 'u-b');

    const directError = await svc.subscriberCount('conv-direct').then(
      () => null,
      (e: unknown) => e as { statusCode?: number; code?: string; message?: string },
    );
    const missingError = await svc.subscriberCount('conv-does-not-exist').then(
      () => null,
      (e: unknown) => e as { statusCode?: number; code?: string; message?: string },
    );

    expect(directError).not.toBeNull();
    expect(missingError).not.toBeNull();
    expect(missingError!.statusCode).toBe(404);
    expect(missingError!.statusCode).toBe(directError!.statusCode);
    expect(missingError!.code).toBe(directError!.code);
    expect(missingError!.message).toBe(directError!.message);
  });

  it('T396-S04 (control): real CHANNEL resolves the active count (OWNER in, left out)', async () => {
    seedConversation('ch-real', 'CHANNEL');
    seedMember('ch-real', 'u-owner', 'OWNER');
    seedMember('ch-real', 'u-sub-1');
    seedMember('ch-real', 'u-sub-2', 'MEMBER', true);
    await expect(svc.subscriberCount('ch-real')).resolves.toBe(2);
  });

  it('T396-S05 (control): CHANNEL whose members all left resolves 0 — gate is type, not count', async () => {
    seedConversation('ch-empty', 'CHANNEL');
    seedMember('ch-empty', 'u-owner', 'OWNER', true);
    seedMember('ch-empty', 'u-sub-1', 'MEMBER', true);
    await expect(svc.subscriberCount('ch-empty')).resolves.toBe(0);
  });
});
