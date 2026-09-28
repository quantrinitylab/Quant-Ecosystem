import { describe, it, expect, vi } from 'vitest';
import {
  AnonymousPostService,
  AnonymousModerationError,
  AnonymousPostNotFoundError,
  DefaultAnonymousModerator,
  type ContentModerator,
} from '../services/anonymous-post.service';
import type { PrismaClient } from '../types';

const allowAll: ContentModerator = { check: async () => ({ allowed: true }) };
const blockAll: ContentModerator = { check: async () => ({ allowed: false, reason: 'nope' }) };

function mockPrisma() {
  const created: Record<string, unknown>[] = [];
  const likes = new Map<string, { userId: string; postId: string }>();
  const prisma = {
    post: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { ...data, createdAt: new Date('2026-06-20T00:00:00Z') };
      }),
      findMany: vi.fn(async () => created.filter((p) => p['isAnonymous'])),
      findUnique: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          created.find((p) => p['id'] === where['id']) ?? null,
      ),
      count: vi.fn(),
      update: vi.fn(async () => ({})),
    },
    like: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const k = where['userId_postId'] as { userId: string; postId: string };
        return likes.get(`${k.userId}:${k.postId}`) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        likes.set(`${data['userId']}:${data['postId']}`, data as never);
        return data;
      }),
      delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const k = where['userId_postId'] as { userId: string; postId: string };
        likes.delete(`${k.userId}:${k.postId}`);
        return {};
      }),
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          [...likes.values()].filter((l) => l.postId === where['postId']).length,
      ),
    },
    user: { findUnique: vi.fn(), update: vi.fn() },
    community: {} as never,
    communityMember: {} as never,
    userRelationship: {} as never,
  } as unknown as PrismaClient;
  return { prisma, created, likes };
}

const opts = (moderator: ContentModerator = allowAll) => ({
  aliasSecret: 'test-secret',
  moderator,
  idFactory: (() => {
    let n = 0;
    return () => `anon_${++n}`;
  })(),
});

describe('AnonymousPostService', () => {
  it('requires an alias secret', () => {
    expect(
      () => new AnonymousPostService(mockPrisma().prisma, { ...opts(), aliasSecret: '' }),
    ).toThrow();
  });

  it('creates an anonymous post and never returns the userId', async () => {
    const { prisma, created } = mockPrisma();
    const svc = new AnonymousPostService(prisma, opts());
    const post = await svc.createAnonymousPost({ userId: 'real-user-1', content: 'hello' });

    // Public projection hides the author.
    expect((post as unknown as Record<string, unknown>)['userId']).toBeUndefined();
    expect(post.isAnonymous).toBe(true);
    expect(post.anonymousAlias).toMatch(/^Anon-[0-9a-f]{8}$/);
    expect(post.content).toBe('hello');

    // But the row persisted DOES retain the real author (for abuse handling).
    expect(created[0]!['userId']).toBe('real-user-1');
    expect(created[0]!['isAnonymous']).toBe(true);
  });

  it('blocks posts when moderation rejects (fail-closed)', async () => {
    const { prisma, created } = mockPrisma();
    const svc = new AnonymousPostService(prisma, opts(blockAll));
    await expect(svc.createAnonymousPost({ userId: 'u', content: 'bad' })).rejects.toBeInstanceOf(
      AnonymousModerationError,
    );
    expect(created).toHaveLength(0); // nothing persisted
  });

  it('rejects empty content', async () => {
    const { prisma } = mockPrisma();
    const svc = new AnonymousPostService(prisma, opts());
    await expect(svc.createAnonymousPost({ userId: 'u', content: '   ' })).rejects.toBeInstanceOf(
      AnonymousModerationError,
    );
  });

  it('alias is stable per thread, differs across threads and authors', () => {
    const svc = new AnonymousPostService(mockPrisma().prisma, opts());
    expect(svc.aliasFor('u1', 't1')).toBe(svc.aliasFor('u1', 't1'));
    expect(svc.aliasFor('u1', 't1')).not.toBe(svc.aliasFor('u1', 't2'));
    expect(svc.aliasFor('u1', 't1')).not.toBe(svc.aliasFor('u2', 't1'));
    expect(svc.aliasFor('secret-user', 't1')).not.toContain('secret-user');
  });

  it('replies share the alias of their thread root (coherent conversation)', async () => {
    const { prisma } = mockPrisma();
    const svc = new AnonymousPostService(prisma, opts());
    const root = await svc.createAnonymousPost({ userId: 'u1', content: 'root' });
    const reply = await svc.createAnonymousPost({
      userId: 'u1',
      content: 'reply',
      replyToId: root.id,
    });
    // Same author replying within the same thread => same alias as the root thread.
    expect(reply.anonymousAlias).toBe(svc.aliasFor('u1', root.id));
  });

  it('lists the anonymous feed with author stripped', async () => {
    const { prisma } = mockPrisma();
    const svc = new AnonymousPostService(prisma, opts());
    await svc.createAnonymousPost({ userId: 'u1', content: 'a' });
    await svc.createAnonymousPost({ userId: 'u2', content: 'b' });
    const feed = await svc.listAnonymousFeed();
    expect(feed.data).toHaveLength(2);
    for (const p of feed.data) {
      expect((p as unknown as Record<string, unknown>)['userId']).toBeUndefined();
      expect(p.anonymousAlias).toMatch(/^Anon-[0-9a-f]{8}$/);
    }
  });

  describe('reactToPost', () => {
    it('toggles a like on/off and updates the count', async () => {
      const { prisma } = mockPrisma();
      const svc = new AnonymousPostService(prisma, opts());
      const post = await svc.createAnonymousPost({ userId: 'author', content: 'hi' });

      const first = await svc.reactToPost('viewer-1', post.id);
      expect(first).toEqual({ reacted: true, likeCount: 1 });

      const second = await svc.reactToPost('viewer-1', post.id);
      expect(second).toEqual({ reacted: false, likeCount: 0 });
    });

    it('counts reactions from distinct users', async () => {
      const { prisma } = mockPrisma();
      const svc = new AnonymousPostService(prisma, opts());
      const post = await svc.createAnonymousPost({ userId: 'author', content: 'hi' });
      await svc.reactToPost('viewer-1', post.id);
      const r = await svc.reactToPost('viewer-2', post.id);
      expect(r.likeCount).toBe(2);
    });

    it('rejects reactions to a non-existent or non-anonymous post', async () => {
      const { prisma } = mockPrisma();
      const svc = new AnonymousPostService(prisma, opts());
      await expect(svc.reactToPost('u', 'missing')).rejects.toBeInstanceOf(
        AnonymousPostNotFoundError,
      );
    });
  });
});

describe('DefaultAnonymousModerator', () => {
  const mod = new DefaultAnonymousModerator();

  it('allows ordinary content', async () => {
    expect((await mod.check('a normal political opinion')).allowed).toBe(true);
  });

  it('rejects blank content', async () => {
    expect((await mod.check('   ')).allowed).toBe(false);
  });

  it('rejects clearly-illegal content markers', async () => {
    expect((await mod.check('how to make a bomb')).allowed).toBe(false);
    expect((await mod.check('this is CSAM')).allowed).toBe(false);
  });
});
