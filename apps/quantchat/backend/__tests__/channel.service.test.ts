import { describe, it, expect, beforeEach } from 'vitest';
import { ChannelService, type ChannelPrisma } from '../services/channel.service';

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

describe('ChannelService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let svc: ChannelService;

  beforeEach(() => {
    prisma = createFakePrisma();
    svc = new ChannelService(prisma as never);
  });

  it('creates a CHANNEL with the creator as OWNER', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'Announcements' });
    expect(ch.ownerId).toBe('owner-1');
    expect(ch.subscriberCount).toBe(1);
    const conv = prisma.convs.get(ch.id)!;
    expect(conv.type).toBe('CHANNEL');
    expect(prisma.members[0]!.role).toBe('OWNER');
  });

  it('rejects an empty channel name', async () => {
    await expect(svc.createChannel('o', { name: '  ' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('subscribes a user as MEMBER (idempotent)', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.subscribe(ch.id, 'reader-1');
    await svc.subscribe(ch.id, 'reader-1'); // idempotent
    expect(await svc.subscriberCount(ch.id)).toBe(2); // owner + reader
    const reader = prisma.members.find((m) => m.userId === 'reader-1')!;
    expect(reader.role).toBe('MEMBER');
  });

  it('unsubscribes a user', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.subscribe(ch.id, 'reader-1');
    const res = await svc.unsubscribe(ch.id, 'reader-1');
    expect(res.unsubscribed).toBe(true);
    expect(await svc.subscriberCount(ch.id)).toBe(1); // only owner remains
  });

  it('lets the OWNER publish a message', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    const msg = await svc.publish(ch.id, 'owner-1', 'Hello subscribers');
    expect(msg.content).toBe('Hello subscribers');
    expect(prisma.messages).toHaveLength(1);
  });

  it('forbids a MEMBER (subscriber) from publishing (read-only)', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.subscribe(ch.id, 'reader-1');
    await expect(svc.publish(ch.id, 'reader-1', 'spam')).rejects.toMatchObject({
      statusCode: 403,
      code: 'CHANNEL_POST_FORBIDDEN',
    });
    expect(prisma.messages).toHaveLength(0);
  });

  it('forbids a non-member from publishing', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await expect(svc.publish(ch.id, 'stranger', 'hi')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('reports canPost correctly by role', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.subscribe(ch.id, 'reader-1');
    expect(await svc.canPost(ch.id, 'owner-1')).toBe(true);
    expect(await svc.canPost(ch.id, 'reader-1')).toBe(false);
  });

  it('404s for a non-existent or non-channel id', async () => {
    await expect(svc.subscribe('missing', 'u1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lists a user channels (owned + subscribed) with role + canPost', async () => {
    const owned = await svc.createChannel('owner-1', { name: 'Mine' });
    const other = await svc.createChannel('owner-2', { name: 'Theirs' });
    await svc.subscribe(other.id, 'owner-1');

    const list = await svc.listChannels('owner-1');
    expect(list).toHaveLength(2);
    const mine = list.find((c) => c.id === owned.id)!;
    expect(mine.role).toBe('OWNER');
    expect(mine.canPost).toBe(true);
    const subbed = list.find((c) => c.id === other.id)!;
    expect(subbed.role).toBe('MEMBER');
    expect(subbed.canPost).toBe(false);
  });

  it('returns the channel feed chronologically for a subscriber', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.subscribe(ch.id, 'reader-1');
    await svc.publish(ch.id, 'owner-1', 'first');
    await svc.publish(ch.id, 'owner-1', 'second');

    const feed = await svc.getMessages(ch.id, 'reader-1');
    expect(feed.map((m) => m.content)).toEqual(['first', 'second']);
  });

  it('forbids a non-member from reading the feed (403)', async () => {
    const ch = await svc.createChannel('owner-1', { name: 'News' });
    await svc.publish(ch.id, 'owner-1', 'secret');
    await expect(svc.getMessages(ch.id, 'stranger')).rejects.toMatchObject({ statusCode: 403 });
  });
});
