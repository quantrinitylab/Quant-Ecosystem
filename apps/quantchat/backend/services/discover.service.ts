// ============================================================================
// QuantChat - Discover Service (QC-F-077)
// ============================================================================
//
// The /discover page's data layer used to be a phantom: the frontend called
// GET /discover, GET /discover/trending, GET /discover/publishers and
// POST /discover/publishers/:id/subscribe, but no backend route, service or
// Next proxy existed — every call 404'd, the page could only ever show its
// load-error state, and the Subscribe button incremented a counter locally
// without checking the (always failing) result.
//
// This service builds Discover from REAL data that already exists:
//   - Publishers  = broadcast channels (Conversation type CHANNEL), with
//                   subscriber counts from active ConversationMember rows,
//                   content counts from durable Message rows, and the owner's
//                   real isVerified / avatar / website from the User row.
//   - Feed items  = the channels' published posts (durable Messages) merged
//                   with Reels (real video content), newest first.
//   - Trending    = Reels ranked by the Spotlight engagement formula
//                   (likes / comments / shares / watch-through) — real
//                   counters only. There is NO view tracking anywhere in
//                   QuantChat, so no view count is ever emitted or invented.
//   - Subscribe   = the real channel subscription (ChannelService.subscribe,
//                   idempotent ConversationMember row), returning the real
//                   post-subscribe subscriber count so the client never has
//                   to guess or fabricate an increment.
//
// Honesty rules baked in:
//   - A category is only emitted when the source row's metadata actually
//     carries a valid one; category filtering therefore excludes
//     uncategorised content instead of relabelling it.
//   - Engagement fields (likeCount/commentCount/shareCount) are only present
//     for Reels, the one source that really tracks them.
//   - Empty database => empty arrays. The page renders its honest empty
//     states; nothing is seeded or synthesised here.
//
// Depends on a narrow structural Prisma slice (same pattern as
// ChannelService) so it is fully unit-testable with a fake.
// ============================================================================

import { ChannelService } from './channel.service';
import { PrivacyService, type PrivacyPrismaLike } from './privacy.service';
import { ENGAGEMENT_WEIGHTS } from './spotlight.service';

/**
 * The Spotlight engagement formula (spotlight.service.ts ENGAGEMENT_WEIGHTS):
 * shares weigh most, then comments, then likes, plus watch-through scaled to
 * a like-comparable range. Kept in one expression here so Discover trending
 * and Spotlight can never drift into two different notions of "trending".
 */
function engagementOf(reel: ReelRow): number {
  const watch = Math.max(0, Math.min(1, reel.watchThroughRate));
  return (
    reel.likeCount * ENGAGEMENT_WEIGHTS.like +
    reel.commentCount * ENGAGEMENT_WEIGHTS.comment +
    reel.shareCount * ENGAGEMENT_WEIGHTS.share +
    watch * ENGAGEMENT_WEIGHTS.watchThrough
  );
}

export const DISCOVER_CATEGORIES = [
  'news',
  'entertainment',
  'sports',
  'fashion',
  'food',
  'gaming',
  'science',
  'technology',
  'music',
  'comedy',
] as const;

export type DiscoverCategory = (typeof DISCOVER_CATEGORIES)[number];

const CATEGORY_SET = new Set<string>(DISCOVER_CATEGORIES);
const MAX_PUBLISHERS = 50;
const MAX_FEED_SOURCE = 50;
const MAX_TRENDING_SOURCE = 100;
const MAX_FEED_ITEMS = 50;
const MAX_TRENDING_ITEMS = 20;
const TITLE_MAX = 120;

interface ChannelRow {
  id: string;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  createdBy: string;
  metadata: unknown;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  website?: string | null;
}

interface ChannelMessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  mediaUrl: string | null;
  mediaThumbnailUrl: string | null;
  mediaType: string | null;
  mediaDuration: number | null;
  createdAt: Date | string;
}

interface ReelRow {
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
  createdAt: Date | string;
  creator?: { username: string | null; displayName?: string | null; avatarUrl: string | null } | null;
}

export interface DiscoverPrisma {
  conversation: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
      take?: number;
    }): Promise<ChannelRow[]>;
  };
  conversationMember: {
    findFirst(args: { where: Record<string, unknown> }): Promise<{ id: string } | null>;
    findMany(args: { where: Record<string, unknown> }): Promise<Array<{ conversationId: string; userId: string }>>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  message: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
      take?: number;
    }): Promise<ChannelMessageRow[]>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  reel: {
    findMany(args: {
      orderBy?: Record<string, unknown>;
      take?: number;
      include?: Record<string, unknown>;
    }): Promise<ReelRow[]>;
  };
  user: {
    findMany(args: { where: Record<string, unknown> }): Promise<UserRow[]>;
  };
}

export interface PublisherView {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  coverUrl: string;
  /** Present only when the channel's metadata carries a valid category. */
  category?: DiscoverCategory;
  subscriberCount: number;
  contentCount: number;
  isVerified: boolean;
  website?: string;
  isSubscribed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverItemView {
  id: string;
  publisherId: string;
  publisherName: string;
  publisherAvatarUrl: string;
  type: 'show';
  title: string;
  description?: string;
  thumbnailUrl: string;
  mediaUrl: string;
  /** Present only when the source metadata carries a valid category. */
  category?: DiscoverCategory;
  tags: string[];
  /** Real engagement counters — present for Reels only (posts track none). */
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  isFeatured: boolean;
  isTrending: boolean;
  duration?: number;
  isSubscribed: boolean;
  createdAt: string;
  updatedAt: string;
}

function toIso(value: Date | string | undefined): string {
  if (value == null) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function categoryFromMetadata(metadata: unknown): DiscoverCategory | undefined {
  let meta: unknown = metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      return undefined;
    }
  }
  if (meta && typeof meta === 'object') {
    const raw = (meta as { category?: unknown }).category;
    if (typeof raw === 'string' && CATEGORY_SET.has(raw)) return raw as DiscoverCategory;
  }
  return undefined;
}

function firstLineTitle(content: string | null, fallback: string): string {
  const line = (content ?? '').split('\n').map((s) => s.trim()).find((s) => s.length > 0);
  const title = line ?? fallback;
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

/**
 * QC-F-447: a PrivacyService over this service's narrow Prisma slice.
 * DiscoverPrisma's user.findMany is typed for publisher rows (no
 * `preferences` in its UserRow), but the real client returns the full
 * row; the adapter widens each row to the {id, preferences} shape the
 * blocked-pair resolver reads. A harness whose rows carry no preferences
 * resolves every pair 'clear' (absent list = empty list), never a crash.
 */
function privacyFromDiscoverPrisma(prisma: DiscoverPrisma): PrivacyService {
  const like: PrivacyPrismaLike = {
    user: {
      findMany: async (args: unknown) => {
        const rows = await prisma.user.findMany(
          args as { where: Record<string, unknown> },
        );
        return rows.map((r) => ({
          id: r.id,
          preferences: (r as { preferences?: unknown }).preferences,
        }));
      },
    },
  };
  return new PrivacyService(like);
}

export class DiscoverService {
  private readonly privacy: PrivacyService;

  constructor(
    private readonly prisma: DiscoverPrisma,
    privacy?: PrivacyService,
  ) {
    this.privacy = privacy ?? privacyFromDiscoverPrisma(prisma);
  }

  /**
   * QC-F-447: creators whose Reels this caller must not see — a blocked
   * pair in either direction, or a pair that could not be proven clear
   * (Discover is a leak surface: unproven = hidden). Channel posts are
   * deliberately NOT cut here: a channel is a public publisher surface
   * whose block semantics belong to the QC-F-224/255 moderation scope.
   */
  private async blockedCreatorIds(
    callerId: string,
    reels: ReelRow[],
  ): Promise<Set<string>> {
    if (reels.length === 0) return new Set<string>();
    const { excluded, uncertain } = await this.privacy.blockedExclusionsFor(
      callerId,
      reels.map((r) => r.creatorId),
    );
    return new Set([...excluded, ...uncertain]);
  }

  /** All broadcast channels = Discover publishers, most-subscribed first. */
  async listPublishers(callerId: string): Promise<PublisherView[]> {
    const channels = await this.prisma.conversation.findMany({
      where: { type: 'CHANNEL', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: MAX_PUBLISHERS,
    });
    if (channels.length === 0) return [];

    const ownerIds = [...new Set(channels.map((c) => c.createdBy))];
    const owners = await this.prisma.user.findMany({ where: { id: { in: ownerIds } } });
    const ownerById = new Map(owners.map((u) => [u.id, u]));

    const callerMemberships = await this.prisma.conversationMember.findMany({
      where: { userId: callerId, leftAt: null },
    });
    const subscribedTo = new Set(callerMemberships.map((m) => m.conversationId));

    const views: PublisherView[] = [];
    for (const channel of channels) {
      const [subscriberCount, contentCount] = await Promise.all([
        this.prisma.conversationMember.count({
          where: { conversationId: channel.id, leftAt: null },
        }),
        this.prisma.message.count({
          where: { conversationId: channel.id, isDeleted: false },
        }),
      ]);
      const owner = ownerById.get(channel.createdBy);
      const category = categoryFromMetadata(channel.metadata);
      views.push({
        id: channel.id,
        name: channel.name ?? owner?.displayName ?? 'Unnamed channel',
        description: channel.description ?? '',
        avatarUrl: channel.avatarUrl ?? owner?.avatarUrl ?? '',
        coverUrl: '',
        ...(category ? { category } : {}),
        subscriberCount,
        contentCount,
        isVerified: owner?.isVerified ?? false,
        ...(owner?.website ? { website: owner.website } : {}),
        isSubscribed: subscribedTo.has(channel.id),
        createdAt: toIso(channel.createdAt),
        updatedAt: toIso(channel.updatedAt ?? channel.createdAt),
      });
    }
    views.sort((a, b) => b.subscriberCount - a.subscriberCount || a.name.localeCompare(b.name));
    return views;
  }

  /**
   * The "For You" feed: newest published channel posts merged with newest
   * Reels. With a category, only sources whose metadata really carries that
   * category are included — everything else is honestly absent, never
   * relabelled.
   */
  async getFeed(callerId: string, category?: string): Promise<DiscoverItemView[]> {
    const channels = await this.prisma.conversation.findMany({
      where: { type: 'CHANNEL', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: MAX_PUBLISHERS,
    });
    const channelById = new Map(channels.map((c) => [c.id, c]));

    const callerMemberships = await this.prisma.conversationMember.findMany({
      where: { userId: callerId, leftAt: null },
    });
    const subscribedTo = new Set(callerMemberships.map((m) => m.conversationId));

    const items: Array<DiscoverItemView & { sortAt: number }> = [];

    if (channels.length > 0) {
      const posts = await this.prisma.message.findMany({
        where: { conversationId: { in: channels.map((c) => c.id) }, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: MAX_FEED_SOURCE,
      });
      for (const post of posts) {
        const channel = channelById.get(post.conversationId);
        if (!channel) continue;
        const cat = categoryFromMetadata(channel.metadata);
        if (category && cat !== category) continue;
        const publisherName = channel.name ?? 'Unnamed channel';
        items.push({
          id: post.id,
          publisherId: channel.id,
          publisherName,
          publisherAvatarUrl: channel.avatarUrl ?? '',
          type: 'show',
          title: firstLineTitle(
            post.content,
            post.mediaType ? `${publisherName} — ${post.mediaType.toLowerCase()} post` : publisherName,
          ),
          ...(post.content ? { description: post.content.slice(0, 280) } : {}),
          thumbnailUrl:
            post.mediaThumbnailUrl ??
            (post.mediaType === 'IMAGE' || post.mediaType === 'VIDEO' ? post.mediaUrl ?? '' : ''),
          mediaUrl: post.mediaUrl ?? '',
          ...(cat ? { category: cat } : {}),
          tags: [],
          isFeatured: false,
          isTrending: false,
          ...(post.mediaDuration != null ? { duration: post.mediaDuration } : {}),
          isSubscribed: subscribedTo.has(channel.id),
          createdAt: toIso(post.createdAt),
          updatedAt: toIso(post.createdAt),
          sortAt: new Date(post.createdAt).getTime(),
        });
      }
    }

    const reels = await this.prisma.reel.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_FEED_SOURCE,
      include: { creator: { select: { username: true, displayName: true, avatarUrl: true } } },
    });
    // QC-F-447: blocked-pair creators' reels never enter the feed.
    const hiddenCreators = await this.blockedCreatorIds(callerId, reels);
    for (const reel of reels) {
      if (hiddenCreators.has(reel.creatorId)) continue;
      // Reels carry no category metadata anywhere in the schema; a category
      // filter therefore honestly excludes them.
      if (category) continue;
      const publisherName =
        reel.creator?.displayName ?? reel.creator?.username ?? 'Unknown creator';
      items.push({
        id: reel.id,
        publisherId: reel.creatorId,
        publisherName,
        publisherAvatarUrl: reel.creator?.avatarUrl ?? '',
        type: 'show',
        title: firstLineTitle(reel.caption, `Reel by ${publisherName}`),
        ...(reel.caption ? { description: reel.caption.slice(0, 280) } : {}),
        thumbnailUrl: reel.thumbnailUrl,
        mediaUrl: reel.videoUrl,
        tags: [],
        likeCount: reel.likeCount,
        commentCount: reel.commentCount,
        shareCount: reel.shareCount,
        isFeatured: reel.isFeatured,
        isTrending: false,
        duration: reel.duration,
        isSubscribed: false,
        createdAt: toIso(reel.createdAt),
        updatedAt: toIso(reel.createdAt),
        sortAt: new Date(reel.createdAt).getTime(),
      });
    }

    items.sort((a, b) => b.sortAt - a.sortAt);
    return items.slice(0, MAX_FEED_ITEMS).map(({ sortAt: _sortAt, ...item }) => item);
  }

  /**
   * Trending = Reels ranked by the real Spotlight engagement formula.
   * Ordering signal is engagement, and that is exactly what the payload
   * carries (likeCount/commentCount/shareCount) — no invented view counts.
   */
  async getTrending(callerId: string): Promise<DiscoverItemView[]> {
    // The ranking FORMULA is global (real engagement counters), but the
    // caller is no longer ignored: QC-F-447 cuts blocked-pair creators
    // (either direction, or unproven) before ranking, so a blocked
    // creator's reel cannot trend into the blocker's Discover either.
    const reels = await this.prisma.reel.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_TRENDING_SOURCE,
      include: { creator: { select: { username: true, displayName: true, avatarUrl: true } } },
    });
    const hiddenCreators = await this.blockedCreatorIds(callerId, reels);
    const ranked = reels
      .filter((reel) => !hiddenCreators.has(reel.creatorId))
      .map((reel) => ({ reel, score: engagementOf(reel) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.reel.id < b.reel.id ? -1 : a.reel.id > b.reel.id ? 1 : 0;
      })
      .slice(0, MAX_TRENDING_ITEMS);

    return ranked.map(({ reel }) => {
      const publisherName =
        reel.creator?.displayName ?? reel.creator?.username ?? 'Unknown creator';
      return {
        id: reel.id,
        publisherId: reel.creatorId,
        publisherName,
        publisherAvatarUrl: reel.creator?.avatarUrl ?? '',
        type: 'show' as const,
        title: firstLineTitle(reel.caption, `Reel by ${publisherName}`),
        ...(reel.caption ? { description: reel.caption.slice(0, 280) } : {}),
        thumbnailUrl: reel.thumbnailUrl,
        mediaUrl: reel.videoUrl,
        tags: [],
        likeCount: reel.likeCount,
        commentCount: reel.commentCount,
        shareCount: reel.shareCount,
        isFeatured: reel.isFeatured,
        isTrending: true,
        duration: reel.duration,
        isSubscribed: false,
        createdAt: toIso(reel.createdAt),
        updatedAt: toIso(reel.createdAt),
      };
    });
  }

  /**
   * Subscribe the caller to a publisher (= broadcast channel). Idempotent:
   * subscribing twice creates no second row and reports alreadySubscribed
   * with the unchanged real count, so the client can render the truth.
   */
  async subscribe(
    callerId: string,
    publisherId: string,
  ): Promise<{ subscribed: true; alreadySubscribed: boolean; subscriberCount: number }> {
    const existing = await this.prisma.conversationMember.findFirst({
      where: { conversationId: publisherId, userId: callerId, leftAt: null },
    });
    // ChannelService.subscribe enforces that the publisher is a real CHANNEL
    // (404 CHANNEL_NOT_FOUND otherwise) and creates the MEMBER row.
    const channels = new ChannelService(this.prisma as never);
    await channels.subscribe(publisherId, callerId);
    const subscriberCount = await this.prisma.conversationMember.count({
      where: { conversationId: publisherId, leftAt: null },
    });
    return { subscribed: true, alreadySubscribed: existing != null, subscriberCount };
  }
}
