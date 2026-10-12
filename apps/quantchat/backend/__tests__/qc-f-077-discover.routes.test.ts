import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import discoverRoutes from '../routes/discover';

// QC-F-077 — /discover's data layer was a phantom: the shipped page called
// GET /discover, GET /discover/trending, GET /discover/publishers and
// POST /discover/publishers/:id/subscribe, but no backend route or Next
// proxy existed (every call 404'd), and the page's Subscribe handler
// incremented the counter locally without checking the result.
// These tests pin the real backend at the route layer: publishers are real
// broadcast channels with real member/message counts, the feed merges real
// channel posts with real reels, trending ranks by the real Spotlight
// engagement counters (never invented view counts), and subscribe creates
// a real idempotent membership row whose count the response reports.

interface FakeUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  website?: string | null;
}
interface FakeChannel {
  id: string;
  type: string;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  createdBy: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
interface FakeMember {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  leftAt: Date | null;
}
interface FakeMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  mediaUrl: string | null;
  mediaThumbnailUrl: string | null;
  mediaType: string | null;
  mediaDuration: number | null;
  isDeleted: boolean;
  createdAt: Date;
}
interface FakeReel {
  id: string;
  creatorId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  duration: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  watchThroughRate: number;
  isFeatured: boolean;
  createdAt: Date;
  creator: { username: string | null; displayName: string | null; avatarUrl: string | null } | null;
}

const CALLER = 'u-caller';
const T = (d: string) => new Date(`2026-${d}T00:00:00.000Z`);

function makeFakePrisma() {
  const users: FakeUser[] = [
    {
      id: 'u-owner-news',
      username: 'newsdesk',
      displayName: 'News Desk',
      avatarUrl: 'https://cdn.example/owner.png',
      isVerified: true,
      website: 'https://news.example',
    },
    {
      id: 'u-owner-fun',
      username: 'funclub',
      displayName: 'Fun Club Owner',
      avatarUrl: null,
      isVerified: false,
    },
  ];
  const channels: FakeChannel[] = [
    {
      id: 'ch-news',
      type: 'CHANNEL',
      name: 'Quant News',
      description: 'Daily quant news',
      avatarUrl: null,
      createdBy: 'u-owner-news',
      metadata: { category: 'news' },
      createdAt: T('01-01'),
      updatedAt: T('01-01'),
      deletedAt: null,
    },
    {
      id: 'ch-fun',
      type: 'CHANNEL',
      name: 'Fun Club',
      description: null,
      avatarUrl: 'https://cdn.example/fun.png',
      createdBy: 'u-owner-fun',
      metadata: {},
      createdAt: T('01-02'),
      updatedAt: T('01-02'),
      deletedAt: null,
    },
    {
      id: 'conv-group',
      type: 'GROUP',
      name: 'Study Group',
      description: null,
      avatarUrl: null,
      createdBy: 'u-owner-fun',
      metadata: {},
      createdAt: T('01-03'),
      updatedAt: T('01-03'),
      deletedAt: null,
    },
  ];
  const members: FakeMember[] = [
    { id: 'mb-1', conversationId: 'ch-news', userId: 'u-owner-news', role: 'OWNER', leftAt: null },
    { id: 'mb-2', conversationId: 'ch-news', userId: 'u-a', role: 'MEMBER', leftAt: null },
    { id: 'mb-3', conversationId: 'ch-news', userId: 'u-b', role: 'MEMBER', leftAt: null },
    { id: 'mb-4', conversationId: 'ch-news', userId: 'u-c', role: 'MEMBER', leftAt: T('02-01') },
    { id: 'mb-5', conversationId: 'ch-fun', userId: 'u-owner-fun', role: 'OWNER', leftAt: null },
    { id: 'mb-6', conversationId: 'ch-fun', userId: CALLER, role: 'MEMBER', leftAt: null },
  ];
  const messages: FakeMessage[] = [
    {
      id: 'm-1',
      conversationId: 'ch-news',
      senderId: 'u-owner-news',
      content: 'Big headline\nsecond line',
      mediaUrl: null,
      mediaThumbnailUrl: null,
      mediaType: null,
      mediaDuration: null,
      isDeleted: false,
      createdAt: T('02-04'),
    },
    {
      id: 'm-2',
      conversationId: 'ch-news',
      senderId: 'u-owner-news',
      content: 'deleted scoop',
      mediaUrl: null,
      mediaThumbnailUrl: null,
      mediaType: null,
      mediaDuration: null,
      isDeleted: true,
      createdAt: T('02-05'),
    },
    {
      id: 'm-3',
      conversationId: 'ch-fun',
      senderId: 'u-owner-fun',
      content: null,
      mediaUrl: 'https://cdn.example/pic.jpg',
      mediaThumbnailUrl: null,
      mediaType: 'IMAGE',
      mediaDuration: null,
      isDeleted: false,
      createdAt: T('02-02'),
    },
  ];
  const reels: FakeReel[] = [
    {
      id: 'r-1',
      creatorId: 'u-owner-news',
      videoUrl: 'https://cdn.example/r1.mp4',
      thumbnailUrl: 'https://cdn.example/r1.jpg',
      caption: 'Market wrap',
      duration: 30,
      likeCount: 100,
      commentCount: 0,
      shareCount: 0,
      watchThroughRate: 0,
      isFeatured: false,
      createdAt: T('02-05'),
      creator: { username: 'newsdesk', displayName: 'News Desk', avatarUrl: 'https://cdn.example/owner.png' },
    },
    {
      id: 'r-2',
      creatorId: 'u-owner-fun',
      videoUrl: 'https://cdn.example/r2.mp4',
      thumbnailUrl: 'https://cdn.example/r2.jpg',
      caption: 'Dance break',
      duration: 15,
      likeCount: 0,
      commentCount: 0,
      shareCount: 10,
      watchThroughRate: 0,
      isFeatured: false,
      createdAt: T('02-03'),
      creator: { username: 'funclub', displayName: 'Fun Club Owner', avatarUrl: null },
    },
    {
      id: 'r-3',
      creatorId: 'u-owner-fun',
      videoUrl: 'https://cdn.example/r3.mp4',
      thumbnailUrl: 'https://cdn.example/r3.jpg',
      caption: 'Quiet vlog',
      duration: 45,
      likeCount: 5,
      commentCount: 0,
      shareCount: 0,
      watchThroughRate: 0,
      isFeatured: true,
      createdAt: T('02-01'),
      creator: { username: 'funclub', displayName: 'Fun Club Owner', avatarUrl: null },
    },
  ];
  let seq = 100;

  const memberMatches = (m: FakeMember, where: Record<string, unknown>) => {
    if (where['conversationId'] != null && m.conversationId !== where['conversationId']) return false;
    if (where['userId'] != null && m.userId !== where['userId']) return false;
    if ('leftAt' in where && where['leftAt'] === null && m.leftAt !== null) return false;
    return true;
  };

  const prisma = {
    conversation: {
      async findMany({ where, take }: { where: Record<string, unknown>; take?: number }) {
        let rows = channels.filter(
          (c) => c.type === where['type'] && (where['deletedAt'] === null ? c.deletedAt === null : true),
        );
        rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
      async findUnique({ where }: { where: { id: string } }) {
        return channels.find((c) => c.id === where.id) ?? null;
      },
    },
    conversationMember: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return members.find((m) => memberMatches(m, where)) ?? null;
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return members.filter((m) => memberMatches(m, where));
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return members.filter((m) => memberMatches(m, where)).length;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row: FakeMember = {
          id: `mb-${++seq}`,
          conversationId: String(data['conversationId']),
          userId: String(data['userId']),
          role: String(data['role']),
          leftAt: null,
        };
        members.push(row);
        return row;
      },
      async updateMany() {
        return { count: 0 };
      },
    },
    message: {
      async findMany({ where, take }: { where: Record<string, unknown>; take?: number }) {
        const inList = (where['conversationId'] as { in: string[] }).in;
        let rows = messages.filter(
          (m) => inList.includes(m.conversationId) && m.isDeleted === where['isDeleted'],
        );
        rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return messages.filter(
          (m) => m.conversationId === where['conversationId'] && m.isDeleted === where['isDeleted'],
        ).length;
      },
    },
    reel: {
      async findMany({ take }: { take?: number }) {
        const rows = [...reels].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
    },
    user: {
      async findMany({ where }: { where: { id: { in: string[] } } }) {
        return users.filter((u) => where.id.in.includes(u.id));
      },
    },
  };

  return { prisma, members };
}

function errorCode(res: { json: () => unknown }): string {
  return (res.json() as { error: { code: string } }).error.code;
}

interface PublisherJson {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  category?: string;
  subscriberCount: number;
  contentCount: number;
  isVerified: boolean;
  website?: string;
  isSubscribed: boolean;
}
interface ItemJson {
  id: string;
  publisherId: string;
  publisherName: string;
  title: string;
  thumbnailUrl: string;
  category?: string;
  likeCount?: number;
  isFeatured: boolean;
  isTrending: boolean;
  isSubscribed: boolean;
  duration?: number;
  [key: string]: unknown;
}

describe('QC-F-077 discover routes (real data layer)', () => {
  let app: FastifyInstance;
  let authUserId: string | null;
  let members: FakeMember[];

  beforeEach(async () => {
    authUserId = CALLER;
    const fake = makeFakePrisma();
    members = fake.members;
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      fake.prisma,
    );
    app.addHook('preHandler', async (request) => {
      if (authUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
      }
    });
    await app.register(discoverRoutes, { prefix: '/discover' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('fails closed 401 without auth on every discover route', async () => {
    authUserId = null;
    for (const url of ['/discover', '/discover/trending', '/discover/publishers']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe('UNAUTHORIZED');
    }
    const res = await app.inject({
      method: 'POST',
      url: '/discover/publishers/ch-news/subscribe',
    });
    expect(res.statusCode).toBe(401);
  });

  it('publishers are real channels with real counts, owner facts, and caller subscription state', async () => {
    const res = await app.inject({ method: 'GET', url: '/discover/publishers' });
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { data: PublisherJson[] }).data;
    // Most-subscribed first; the GROUP conversation is never a publisher.
    expect(data.map((p) => p.id)).toEqual(['ch-news', 'ch-fun']);

    const news = data[0]!;
    expect(news.name).toBe('Quant News');
    expect(news.subscriberCount).toBe(3); // owner + u-a + u-b; u-c left, excluded
    expect(news.contentCount).toBe(1); // m-2 is deleted, excluded
    expect(news.avatarUrl).toBe('https://cdn.example/owner.png'); // owner fallback
    expect(news.isVerified).toBe(true); // the owner's real flag
    expect(news.website).toBe('https://news.example');
    expect(news.category).toBe('news'); // from real channel metadata
    expect(news.isSubscribed).toBe(false);

    const fun = data[1]!;
    expect(fun.subscriberCount).toBe(2);
    expect(fun.contentCount).toBe(1);
    expect(fun.avatarUrl).toBe('https://cdn.example/fun.png'); // channel's own avatar
    expect(fun.description).toBe('');
    expect(fun.isVerified).toBe(false);
    expect('category' in fun).toBe(false); // no metadata category — never invented
    expect(fun.isSubscribed).toBe(true); // caller really is a member
  });

  it('feed merges channel posts and reels newest-first with honest fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/discover' });
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { data: ItemJson[] }).data;
    expect(data.map((i) => i.id)).toEqual(['r-1', 'm-1', 'r-2', 'm-3', 'r-3']);

    const post = data.find((i) => i.id === 'm-1')!;
    expect(post.title).toBe('Big headline'); // first line of the real content
    expect(post.publisherName).toBe('Quant News');
    expect(post.category).toBe('news');
    expect(post.isSubscribed).toBe(false);
    expect('likeCount' in post).toBe(false); // posts track no engagement — none claimed

    const mediaPost = data.find((i) => i.id === 'm-3')!;
    expect(mediaPost.title).toBe('Fun Club — image post');
    expect(mediaPost.thumbnailUrl).toBe('https://cdn.example/pic.jpg'); // image media IS the thumbnail
    expect(mediaPost.isSubscribed).toBe(true);

    const reel = data.find((i) => i.id === 'r-1')!;
    expect(reel.likeCount).toBe(100);
    expect(reel.duration).toBe(30);
    expect(reel.thumbnailUrl).toBe('https://cdn.example/r1.jpg');

    // No item anywhere claims a view count — QuantChat tracks none.
    for (const item of data) expect('viewCount' in item).toBe(false);
  });

  it('category filter only returns sources that really carry that category', async () => {
    const news = await app.inject({ method: 'GET', url: '/discover?category=news' });
    const newsData = (news.json() as { data: ItemJson[] }).data;
    expect(newsData.map((i) => i.id)).toEqual(['m-1']); // reels/uncategorised honestly absent

    const gaming = await app.inject({ method: 'GET', url: '/discover?category=gaming' });
    expect((gaming.json() as { data: ItemJson[] }).data).toEqual([]);
  });

  it('unknown category is a 400, not a silently empty feed', async () => {
    const res = await app.inject({ method: 'GET', url: '/discover?category=bogus' });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_CATEGORY');
  });

  it('trending ranks reels by real engagement (shares outweigh likes per the Spotlight weights)', async () => {
    const res = await app.inject({ method: 'GET', url: '/discover/trending' });
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { data: ItemJson[] }).data;
    // Scores: r-1 = 100 likes = 100; r-2 = 10 shares x3 = 30; r-3 = 5 likes = 5.
    expect(data.map((i) => i.id)).toEqual(['r-1', 'r-2', 'r-3']);
    expect(data.every((i) => i.isTrending)).toBe(true);
    expect(data.find((i) => i.id === 'r-3')!.isFeatured).toBe(true); // stored flag, preserved
    for (const item of data) expect('viewCount' in item).toBe(false);
  });

  it('subscribe creates a real membership and reports the real count; a repeat is idempotent', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/discover/publishers/ch-news/subscribe',
    });
    expect(first.statusCode).toBe(200);
    expect((first.json() as { data: unknown }).data).toEqual({
      subscribed: true,
      alreadySubscribed: false,
      subscriberCount: 4,
    });
    expect(
      members.some(
        (m) => m.conversationId === 'ch-news' && m.userId === CALLER && m.role === 'MEMBER' && m.leftAt === null,
      ),
    ).toBe(true);

    const second = await app.inject({
      method: 'POST',
      url: '/discover/publishers/ch-news/subscribe',
    });
    expect((second.json() as { data: unknown }).data).toEqual({
      subscribed: true,
      alreadySubscribed: true,
      subscriberCount: 4, // unchanged — no phantom second increment
    });
    expect(
      members.filter((m) => m.conversationId === 'ch-news' && m.userId === CALLER).length,
    ).toBe(1);

    const pubs = await app.inject({ method: 'GET', url: '/discover/publishers' });
    const news = (pubs.json() as { data: PublisherJson[] }).data.find((p) => p.id === 'ch-news')!;
    expect(news.subscriberCount).toBe(4);
    expect(news.isSubscribed).toBe(true);
  });

  it('subscribe to an unknown publisher or a non-channel conversation is a 404', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/discover/publishers/nope/subscribe',
    });
    expect(missing.statusCode).toBe(404);
    expect(errorCode(missing)).toBe('CHANNEL_NOT_FOUND');

    const group = await app.inject({
      method: 'POST',
      url: '/discover/publishers/conv-group/subscribe',
    });
    expect(group.statusCode).toBe(404);
    expect(errorCode(group)).toBe('CHANNEL_NOT_FOUND');
  });
});
