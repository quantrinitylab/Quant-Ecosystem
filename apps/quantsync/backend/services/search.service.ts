import { PrismaClient } from '@prisma/client';

/**
 * QuantWave search / explore / trending.
 *
 * Backs `GET /search`, `GET /search/suggestions`, `GET /explore` and `GET /trending`. The
 * `src/app/api/{search,search/suggestions,explore,trending}` proxies existed and forwarded to
 * these paths, but no backend module answered them, so the whole search and explore surface
 * returned 404.
 *
 * All reads are Prisma-backed and scoped to content that is actually publicly visible:
 * `visibility: 'PUBLIC'`, `moderationStatus: 'APPROVED'` and `deletedAt: null`. Anonymous
 * posts never expose their author.
 */

/** A search hit for a post, with author attached (or withheld when anonymous). */
export type SearchScope = 'all' | 'posts' | 'people' | 'communities';

export interface SearchOptions {
  scope?: SearchScope;
  page?: number;
  pageSize?: number;
}

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

/** Only surface content that is public, approved and not soft-deleted. */
const PUBLIC_POST_WHERE = {
  visibility: 'PUBLIC',
  moderationStatus: 'APPROVED',
  deletedAt: null,
} as const;

export class SearchService {
  constructor(private readonly prisma: PrismaClient) {}

  private static clampPage(page?: number): number {
    return Math.max(1, page ?? 1);
  }

  private static clampPageSize(pageSize?: number): number {
    return Math.min(Math.max(1, pageSize ?? 20), 50);
  }

  /**
   * Strip the author from anonymous posts.
   *
   * `isAnonymous` posts carry an `anonymousAlias`; returning the joined `user` for them would
   * deanonymise the author through search, which is exactly what the anonymous surface exists
   * to prevent.
   */
  private static redactAnonymous<T extends { isAnonymous: boolean; user?: unknown }>(post: T): T {
    if (!post.isAnonymous) return post;
    return { ...post, user: undefined };
  }

  async searchPosts(query: string, options: SearchOptions = {}) {
    const page = SearchService.clampPage(options.page);
    const pageSize = SearchService.clampPageSize(options.pageSize);
    const where = {
      ...PUBLIC_POST_WHERE,
      content: { contains: query, mode: 'insensitive' as const },
    };

    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: { user: { select: AUTHOR_SELECT } },
        orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.post.count({ where }),
    ]);

    return { data: rows.map(SearchService.redactAnonymous), total, page, pageSize };
  }

  async searchPeople(query: string, options: SearchOptions = {}) {
    const page = SearchService.clampPage(options.page);
    const pageSize = SearchService.clampPageSize(options.pageSize);
    // Ghost-mode users have opted out of being discoverable.
    const where = {
      deletedAt: null,
      ghostMode: false,
      OR: [
        { username: { contains: query, mode: 'insensitive' as const } },
        { displayName: { contains: query, mode: 'insensitive' as const } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { ...AUTHOR_SELECT, bio: true },
        orderBy: [{ isVerified: 'desc' }, { username: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async searchCommunities(query: string, options: SearchOptions = {}) {
    const page = SearchService.clampPage(options.page);
    const pageSize = SearchService.clampPageSize(options.pageSize);
    // Private communities are not discoverable through search.
    const where = {
      isPrivate: false,
      OR: [
        { name: { contains: query, mode: 'insensitive' as const } },
        { slug: { contains: query, mode: 'insensitive' as const } },
        { description: { contains: query, mode: 'insensitive' as const } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.community.findMany({
        where,
        orderBy: { memberCount: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.community.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Unified search. `scope: 'all'` (the default) returns every bucket so the UI can render
   * grouped results in one round trip; a narrower scope returns only that bucket.
   */
  async search(query: string, options: SearchOptions = {}) {
    const trimmed = query.trim();
    const scope = options.scope ?? 'all';

    if (trimmed.length === 0) {
      return {
        query: trimmed,
        scope,
        posts: { data: [], total: 0 },
        people: { data: [], total: 0 },
        communities: { data: [], total: 0 },
      };
    }

    const empty = { data: [] as unknown[], total: 0 };
    const [posts, people, communities] = await Promise.all([
      scope === 'all' || scope === 'posts' ? this.searchPosts(trimmed, options) : empty,
      scope === 'all' || scope === 'people' ? this.searchPeople(trimmed, options) : empty,
      scope === 'all' || scope === 'communities' ? this.searchCommunities(trimmed, options) : empty,
    ]);

    return { query: trimmed, scope, posts, people, communities };
  }

  /**
   * Lightweight typeahead. Returns a flat, capped list of labelled entries rather than full
   * records, so it stays cheap enough to call on every keystroke.
   */
  async suggestions(query: string, limit = 8) {
    const trimmed = query.trim();
    if (trimmed.length === 0) return { query: trimmed, data: [] };

    const take = Math.min(Math.max(1, limit), 20);
    const perBucket = Math.max(1, Math.ceil(take / 3));

    const [people, communities, hashtagPosts] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          ghostMode: false,
          OR: [
            { username: { contains: trimmed, mode: 'insensitive' } },
            { displayName: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
        select: { id: true, username: true, displayName: true, avatarUrl: true },
        orderBy: { isVerified: 'desc' },
        take: perBucket,
      }),
      this.prisma.community.findMany({
        where: {
          isPrivate: false,
          OR: [
            { name: { contains: trimmed, mode: 'insensitive' } },
            { slug: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, slug: true, memberCount: true },
        orderBy: { memberCount: 'desc' },
        take: perBucket,
      }),
      this.prisma.post.findMany({
        where: { ...PUBLIC_POST_WHERE, content: { contains: trimmed, mode: 'insensitive' } },
        select: { hashtags: true },
        orderBy: { likeCount: 'desc' },
        take: 40,
      }),
    ]);

    const data: Array<{ kind: 'person' | 'community' | 'hashtag'; value: string; label: string }> =
      [
        ...people.map((u) => ({
          kind: 'person' as const,
          value: u.username,
          label: u.displayName,
        })),
        ...communities.map((c) => ({
          kind: 'community' as const,
          value: c.slug,
          label: c.name,
        })),
        ...SearchService.matchingHashtags(hashtagPosts, trimmed, perBucket).map((tag) => ({
          kind: 'hashtag' as const,
          value: tag,
          label: `#${tag}`,
        })),
      ];

    return { query: trimmed, data: data.slice(0, take) };
  }

  /**
   * `Post.hashtags` is a JSON array column, so it cannot be filtered with `contains` in a
   * portable way. Pull the tags off the strongest matching posts and filter in memory,
   * de-duplicated case-insensitively.
   */
  private static matchingHashtags(
    posts: Array<{ hashtags: unknown }>,
    query: string,
    limit: number,
  ): string[] {
    const needle = query.replace(/^#/, '').toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const post of posts) {
      if (!Array.isArray(post.hashtags)) continue;
      for (const raw of post.hashtags) {
        if (typeof raw !== 'string') continue;
        const tag = raw.replace(/^#/, '');
        const key = tag.toLowerCase();
        if (!key.includes(needle) || seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  /**
   * Trending posts, ranked by recent engagement.
   *
   * Scores over a rolling window so a post cannot stay on the list forever on old
   * engagement. Weighting favours the costlier signals: a repost is worth more than a like.
   */
  async trending(options: { limit?: number; windowHours?: number } = {}) {
    const limit = Math.min(Math.max(1, options.limit ?? 20), 50);
    const windowHours = Math.min(Math.max(1, options.windowHours ?? 24), 168);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    // Over-fetch so the weighted re-rank has a meaningful candidate pool.
    const candidates = await this.prisma.post.findMany({
      where: { ...PUBLIC_POST_WHERE, createdAt: { gte: since } },
      include: { user: { select: AUTHOR_SELECT } },
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(limit * 5, 200),
    });

    const scored = candidates
      .map((post) => ({
        post: SearchService.redactAnonymous(post),
        score:
          post.likeCount +
          post.commentCount * 2 +
          post.repostCount * 3 +
          post.shareCount * 3 +
          post.viewCount * 0.1,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      windowHours,
      data: scored.map((s) => ({ ...s.post, trendingScore: Math.round(s.score * 100) / 100 })),
    };
  }

  /**
   * Explore: trending posts plus communities worth joining, for the discovery grid.
   */
  async explore(options: { limit?: number } = {}) {
    const limit = Math.min(Math.max(1, options.limit ?? 20), 50);
    const [trending, communities] = await Promise.all([
      this.trending({ limit }),
      this.prisma.community.findMany({
        where: { isPrivate: false },
        orderBy: { memberCount: 'desc' },
        take: Math.min(limit, 10),
      }),
    ]);

    return { posts: trending.data, communities, windowHours: trending.windowHours };
  }
}
