import { describe, it, expect, beforeEach } from 'vitest';
import {
  AnonymousPostService,
  AnonymousModerationError,
  type ContentModerator,
} from '../services/anonymous-post.service';

const allowAll: ContentModerator = { check: async () => ({ allowed: true }) };

function createFakePrisma() {
  const posts: Record<string, unknown>[] = [];
  let n = 0;
  return {
    posts,
    post: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        n += 1;
        const row = {
          ...data,
          id: data['id'] ?? `p-${n}`,
          createdAt: new Date(2_000_000 + n),
          deletedAt: null,
        };
        posts.push(row);
        return row;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        return posts.filter(
          (p) =>
            (where['isAnonymous'] === undefined || p['isAnonymous'] === where['isAnonymous']) &&
            (where['type'] === undefined || p['type'] === where['type']) &&
            (where['moderationStatus'] === undefined ||
              p['moderationStatus'] === where['moderationStatus']),
        );
      },
      findUnique: async () => null,
    },
    like: {
      findUnique: async () => null,
      create: async () => ({}),
      delete: async () => ({}),
      count: async () => 0,
    },
  };
}

describe('AnonymousPostService — reels', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let svc: AnonymousPostService;

  beforeEach(() => {
    prisma = createFakePrisma();
    svc = new AnonymousPostService(prisma as never, { aliasSecret: 'secret', moderator: allowAll });
  });

  it('creates an anonymous VIDEO reel with media (identity hidden)', async () => {
    const reel = await svc.createAnonymousPost({
      userId: 'real-user-1',
      content: 'my anon reel',
      type: 'VIDEO',
      mediaUrls: ['https://cdn.example.com/reel.mp4'],
    });
    expect(reel.type).toBe('VIDEO');
    expect(reel.mediaUrls).toEqual(['https://cdn.example.com/reel.mp4']);
    expect(reel.isAnonymous).toBe(true);
    expect(reel.anonymousAlias).toMatch(/^Anon-[0-9a-f]{8}$/);
    expect((reel as unknown as Record<string, unknown>)['userId']).toBeUndefined();
    // The persisted row still retains the real author for abuse handling.
    expect(prisma.posts[0]!['userId']).toBe('real-user-1');
    expect(prisma.posts[0]!['type']).toBe('VIDEO');
  });

  it('rejects a VIDEO reel with no media', async () => {
    await expect(
      svc.createAnonymousPost({ userId: 'u1', content: 'no media', type: 'VIDEO' }),
    ).rejects.toBeInstanceOf(AnonymousModerationError);
  });

  it('defaults to a TEXT post when no type is given (backward compatible)', async () => {
    const post = await svc.createAnonymousPost({ userId: 'u1', content: 'hello' });
    expect(post.type).toBe('TEXT');
    expect(post.mediaUrls).toEqual([]);
  });

  it('listAnonymousReels returns only anonymous VIDEO posts', async () => {
    await svc.createAnonymousPost({ userId: 'u1', content: 'text one' });
    await svc.createAnonymousPost({
      userId: 'u2',
      content: 'reel one',
      type: 'VIDEO',
      mediaUrls: ['https://cdn.example.com/a.mp4'],
    });
    await svc.createAnonymousPost({
      userId: 'u3',
      content: 'reel two',
      type: 'VIDEO',
      mediaUrls: ['https://cdn.example.com/b.mp4'],
    });

    const reels = await svc.listAnonymousReels();
    expect(reels.data).toHaveLength(2);
    for (const r of reels.data) {
      expect(r.type).toBe('VIDEO');
      expect(r.mediaUrls.length).toBeGreaterThan(0);
      expect((r as unknown as Record<string, unknown>)['userId']).toBeUndefined();
    }
  });
});
