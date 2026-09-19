// ============================================================================
// quantgram (apps/quantneon) — feed content source
// ============================================================================
//
// The composed feed ranks whatever sits in its in-memory `FeedCandidateStore`. Nothing ever
// populated that store from the database: candidates could only arrive via
// `POST /feed/candidates`, so a freshly started backend served an EMPTY feed and every restart
// dropped the pool. These tests pin the behaviour that closed that gap.

import { describe, it, expect, vi } from 'vitest';
import {
  PostFeedCandidateSource,
  spaceForFeedId,
  toFeedItem,
  type PostRow,
} from '../lib/feed-candidate-source';
import { FeedEngineBundle } from '../lib/feed-engines';

function row(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: 'post-1',
    userId: 'user-1',
    content: 'hello neon',
    mediaUrls: ['https://cdn.example.com/a.jpg'],
    hashtags: ['neon'],
    likeCount: 10,
    commentCount: 4,
    repostCount: 2,
    shareCount: 1,
    viewCount: 100,
    isAnonymous: false,
    anonymousAlias: null,
    space: 'main',
    type: 'IMAGE',
    publishedAt: new Date('2026-09-01T00:00:00Z'),
    createdAt: new Date('2026-08-31T00:00:00Z'),
    user: {
      id: 'user-1',
      username: 'neo',
      displayName: 'Neo',
      avatarUrl: null,
      isVerified: true,
    },
    ...overrides,
  };
}

function prismaWith(rows: PostRow[]) {
  return { post: { findMany: vi.fn().mockResolvedValue(rows) } };
}

describe('spaceForFeedId', () => {
  it.each(['main', 'verified', 'anonymous'])('passes through the known space %s', (space) => {
    expect(spaceForFeedId(space)).toBe(space);
  });

  it('falls back to main for an ad-hoc feed id so custom feeds still get content', () => {
    expect(spaceForFeedId('user-42-custom')).toBe('main');
  });
});

describe('toFeedItem', () => {
  it('projects a post row into the shape the ranking engines consume', () => {
    const item = toFeedItem(row());

    expect(item.id).toBe('post-1');
    expect(item.content).toBe('hello neon');
    expect(item.authorId).toBe('user-1');
    expect(item.upvotes).toBe(10);
    // shares = reposts + shares
    expect(item.shares).toBe(3);
    expect(item.replies).toBe(4);
    // publishedAt wins over createdAt
    expect(item.timestamp).toBe(new Date('2026-09-01T00:00:00Z').getTime());
    expect(item.metadata).toMatchObject({ space: 'main', type: 'IMAGE', viewCount: 100 });
  });

  it('falls back to createdAt when the post has no publishedAt', () => {
    const item = toFeedItem(row({ publishedAt: null }));
    expect(item.timestamp).toBe(new Date('2026-08-31T00:00:00Z').getTime());
  });

  it('never leaks the author of an anonymous post', () => {
    const item = toFeedItem(
      row({ isAnonymous: true, anonymousAlias: 'ghost-7', userId: 'real-user' }),
    );

    expect(item.authorId).toBe('ghost-7');
    expect(item.authorId).not.toBe('real-user');
    expect(item.metadata.author).toEqual({ alias: 'ghost-7' });
    // The real user id must not appear anywhere in the serialised item.
    expect(JSON.stringify(item)).not.toContain('real-user');
  });

  it('rates a verified author above an unverified one, and anonymous as neutral', () => {
    const verified = toFeedItem(row());
    const plain = toFeedItem(row({ user: { ...row().user!, isVerified: false } }));
    const anon = toFeedItem(row({ isAnonymous: true, anonymousAlias: 'ghost' }));

    expect(verified.authorReputation).toBeGreaterThan(plain.authorReputation);
    expect(anon.authorReputation).toBe(1);
  });

  it('bounds replyQuality so a viral outlier cannot swamp the other signals', () => {
    const extreme = toFeedItem(row({ commentCount: 10_000, viewCount: 1 }));
    expect(extreme.replyQuality).toBeLessThanOrEqual(5);

    const none = toFeedItem(row({ commentCount: 0 }));
    expect(none.replyQuality).toBe(0);
  });

  it('tolerates non-array JSON columns', () => {
    const item = toFeedItem(row({ mediaUrls: null, hashtags: 'not-an-array' }));
    expect(item.metadata.mediaUrls).toEqual([]);
    expect(item.metadata.hashtags).toEqual([]);
  });
});

describe('PostFeedCandidateSource', () => {
  it('only reads publicly visible, approved, non-deleted top-level posts', async () => {
    const prisma = prismaWith([row()]);
    await new PostFeedCandidateSource(prisma).load('main');

    const where = prisma.post.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      space: 'main',
      visibility: 'PUBLIC',
      moderationStatus: 'APPROVED',
      deletedAt: null,
      // Replies are not feed candidates.
      replyToId: null,
    });
  });

  it('scopes the query to the feed space', async () => {
    const prisma = prismaWith([]);
    await new PostFeedCandidateSource(prisma).load('verified');
    expect(prisma.post.findMany.mock.calls[0]![0].where.space).toBe('verified');
  });

  it('caps the row limit even when asked for more', async () => {
    const prisma = prismaWith([]);
    await new PostFeedCandidateSource(prisma).load('main', { limit: 99_999 });
    expect(prisma.post.findMany.mock.calls[0]![0].take).toBe(500);
  });
});

describe('FeedEngineBundle.hydrate', () => {
  function bundleWith(rows: PostRow[]) {
    const bundle = new FeedEngineBundle('http://localhost:8000');
    const prisma = prismaWith(rows);
    bundle.setCandidateSource(new PostFeedCandidateSource(prisma));
    return { bundle, prisma };
  }

  it('fills an empty pool from the database — the bug this closed', async () => {
    const { bundle } = bundleWith([row({ id: 'p1' }), row({ id: 'p2' })]);

    // This is what a freshly started backend used to look like, forever.
    expect(bundle.candidates.get('main')).toHaveLength(0);

    const size = await bundle.hydrate('main');

    expect(size).toBe(2);
    expect(bundle.candidates.get('main').map((i) => i.id)).toEqual(['p1', 'p2']);
  });

  it('serves a ranked, non-empty composed feed after hydrating', async () => {
    const { bundle } = bundleWith([row({ id: 'p1' }), row({ id: 'p2' }), row({ id: 'p3' })]);
    await bundle.hydrate('main');

    const result = bundle.getComposedFeed('user-1', 'main', 1, 10);

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.retrievalCount).toBe(3);
  });

  it('does not re-query while the pool is warm', async () => {
    const { bundle, prisma } = bundleWith([row()]);

    await bundle.hydrate('main');
    await bundle.hydrate('main');
    await bundle.hydrate('main');

    expect(prisma.post.findMany).toHaveBeenCalledTimes(1);
  });

  it('re-queries when forced', async () => {
    const { bundle, prisma } = bundleWith([row()]);

    await bundle.hydrate('main');
    await bundle.hydrate('main', { force: true });

    expect(prisma.post.findMany).toHaveBeenCalledTimes(2);
  });

  it('replaces the pool so upstream deletions drop out', async () => {
    const bundle = new FeedEngineBundle('http://localhost:8000');
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([row({ id: 'p1' }), row({ id: 'p2' })])
      .mockResolvedValueOnce([row({ id: 'p1' })]);
    bundle.setCandidateSource(new PostFeedCandidateSource({ post: { findMany } }));

    await bundle.hydrate('main');
    expect(bundle.candidates.get('main')).toHaveLength(2);

    await bundle.hydrate('main', { force: true });
    expect(bundle.candidates.get('main').map((i) => i.id)).toEqual(['p1']);
  });

  it('degrades to the existing pool when the database read fails', async () => {
    const bundle = new FeedEngineBundle('http://localhost:8000');
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([row({ id: 'p1' })])
      .mockRejectedValueOnce(new Error('db down'));
    bundle.setCandidateSource(new PostFeedCandidateSource({ post: { findMany } }));

    await bundle.hydrate('main');
    // A read must not become a 500 just because the refresh failed.
    await expect(bundle.hydrate('main', { force: true })).resolves.toBe(1);
    expect(bundle.candidates.get('main').map((i) => i.id)).toEqual(['p1']);
  });

  it('is a no-op when no source is attached, keeping seeded candidates usable', async () => {
    const bundle = new FeedEngineBundle('http://localhost:8000');
    bundle.candidates.replace('main', [toFeedItem(row({ id: 'seeded' }))]);

    await expect(bundle.hydrate('main')).resolves.toBe(1);
    expect(bundle.candidates.get('main').map((i) => i.id)).toEqual(['seeded']);
  });
});
