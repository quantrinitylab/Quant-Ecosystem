import type { FeedItem } from '@quant/ranking';

/**
 * The feed's real content source.
 *
 * The composed feed (`lib/feed-engines.ts`) ranks whatever sits in its `FeedCandidateStore`,
 * which is an in-memory `Map`. Nothing ever populated it from the database: candidates could
 * only arrive via `POST /feed/candidates`, so a freshly started backend served an **empty
 * feed** until something pushed items in, and every restart or new instance lost the pool.
 *
 * This module closes that gap by reading the shared Prisma `Post` table and projecting rows
 * into the `FeedItem` shape the ranking engines already consume. The engines themselves are
 * untouched — per Req 9.1 they stay wired exactly as shipped; this only gives them real
 * content to rank instead of nothing.
 */

/** The narrow slice of the Prisma client this source needs. */
export interface FeedSourcePrisma {
  post: {
    findMany: (args: Record<string, unknown>) => Promise<PostRow[]>;
  };
}

/** The Post columns projected into a `FeedItem`. */
export interface PostRow {
  id: string;
  userId: string;
  content: string | null;
  mediaUrls: unknown;
  hashtags: unknown;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  shareCount: number;
  viewCount: number;
  isAnonymous: boolean;
  anonymousAlias: string | null;
  space: string;
  type: string;
  publishedAt: Date | null;
  createdAt: Date;
  user?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isVerified: boolean;
  } | null;
}

/**
 * `feedId` doubles as the feed-space selector.
 *
 * `Post.space` defaults to `'main'`, and quantneon's sibling app already treats
 * main/verified/anonymous as distinct spaces. A `feedId` naming one of those spaces scopes the
 * query to it; anything else (a per-user or ad-hoc feed id) falls back to `main` so a custom
 * feed still gets real content rather than nothing.
 */
const KNOWN_SPACES = new Set(['main', 'verified', 'anonymous']);

export function spaceForFeedId(feedId: string): string {
  return KNOWN_SPACES.has(feedId) ? feedId : 'main';
}

/**
 * Author reputation, derived from signals that already exist on the row.
 *
 * Verified authors start higher; anonymous posts get a neutral value because there is no
 * author to credit. Kept as a small bounded number so it cannot dominate the ranking weights.
 */
function authorReputation(row: PostRow): number {
  if (row.isAnonymous) return 1;
  return row.user?.isVerified ? 3 : 1;
}

/**
 * Reply quality proxy.
 *
 * The schema has no per-comment quality score, so this approximates it as engagement depth:
 * how much conversation a post drew relative to passive views. Bounded to [0, 5] so a viral
 * outlier cannot swamp the other signals.
 */
function replyQuality(row: PostRow): number {
  if (row.commentCount === 0) return 0;
  const views = Math.max(row.viewCount, 1);
  return Math.min((row.commentCount / views) * 100, 5);
}

/** Project a Prisma `Post` row into the `FeedItem` the ranking engines consume. */
export function toFeedItem(row: PostRow): FeedItem {
  return {
    id: row.id,
    content: row.content ?? '',
    // Anonymous posts must not leak their author into the feed payload.
    authorId: row.isAnonymous ? (row.anonymousAlias ?? 'anonymous') : row.userId,
    timestamp: (row.publishedAt ?? row.createdAt).getTime(),
    upvotes: row.likeCount,
    shares: row.repostCount + row.shareCount,
    replies: row.commentCount,
    replyQuality: replyQuality(row),
    authorReputation: authorReputation(row),
    metadata: {
      type: row.type,
      space: row.space,
      mediaUrls: Array.isArray(row.mediaUrls) ? row.mediaUrls : [],
      hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
      viewCount: row.viewCount,
      isAnonymous: row.isAnonymous,
      author: row.isAnonymous
        ? { alias: row.anonymousAlias ?? 'anonymous' }
        : row.user
          ? {
              id: row.user.id,
              username: row.user.username,
              displayName: row.user.displayName,
              avatarUrl: row.user.avatarUrl,
              isVerified: row.user.isVerified,
            }
          : null,
    },
  };
}

export interface LoadCandidatesOptions {
  /** Maximum rows to pull into the pool. */
  limit?: number;
  /** Only consider posts newer than this many hours. */
  windowHours?: number;
}

/** Reads publicly visible, approved, non-deleted posts and projects them into `FeedItem`s. */
export class PostFeedCandidateSource {
  constructor(private readonly prisma: FeedSourcePrisma) {}

  async load(feedId: string, options: LoadCandidatesOptions = {}): Promise<FeedItem[]> {
    const limit = Math.min(Math.max(1, options.limit ?? 200), 500);
    const windowHours = Math.min(Math.max(1, options.windowHours ?? 168), 720);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const rows = await this.prisma.post.findMany({
      where: {
        space: spaceForFeedId(feedId),
        visibility: 'PUBLIC',
        moderationStatus: 'APPROVED',
        deletedAt: null,
        // Exclude replies: the feed ranks top-level posts.
        replyToId: null,
        createdAt: { gte: since },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    return rows.map(toFeedItem);
  }
}
