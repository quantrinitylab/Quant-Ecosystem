// ============================================================================
// QuantAI — Quanty Feed Service (Q8)
//
// Personalized feed: per-user instruction prompts, generated posts, and
// like/dislike reactions.
//
// HONESTY RULE (enforced here, not just documented):
// - provenance 'agent_brief' = AI-generated from the user's instructions.
//   Always labeled "Quanty brief" in the UI.
// - provenance 'external' = MUST carry a real, fetched sourceUrl. The service
//   rejects external posts without a valid http(s) URL. No fabricated
//   headlines, ever.
// ============================================================================

export const FEED_PROVENANCE_AGENT_BRIEF = 'agent_brief' as const;
export const FEED_PROVENANCE_EXTERNAL = 'external' as const;
export type FeedProvenance =
  | typeof FEED_PROVENANCE_AGENT_BRIEF
  | typeof FEED_PROVENANCE_EXTERNAL;

export const FEED_REACTION_LIKE = 'like' as const;
export const FEED_REACTION_DISLIKE = 'dislike' as const;
export type FeedReactionKind =
  | typeof FEED_REACTION_LIKE
  | typeof FEED_REACTION_DISLIKE;

export interface FeedInstructionRecord {
  id: string;
  userId: string;
  prompt: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeedPostRecord {
  id: string;
  userId: string;
  title: string;
  excerpt: string;
  sourceUrl: string | null;
  sourceName: string | null;
  imageUrl: string | null;
  emoji: string | null;
  provenance: string;
  createdAt: Date;
  likeCount: number;
  dislikeCount: number;
  myReaction: FeedReactionKind | null;
}

export interface CreateFeedPostInput {
  userId: string;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  sourceName?: string;
  imageUrl?: string;
  emoji?: string;
  provenance: FeedProvenance;
}

export interface FeedPage {
  posts: FeedPostRecord[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

// Minimal Prisma surface this service needs (keeps tests mock-friendly).
export interface FeedPrisma {
  feedInstruction: {
    findUnique(args: { where: { userId: string } }): Promise<FeedInstructionRecord | null>;
    upsert(args: {
      where: { userId: string };
      create: { userId: string; prompt: string };
      update: { prompt: string };
    }): Promise<FeedInstructionRecord>;
  };
  feedPost: {
    findMany(args: {
      where: { userId: string };
      orderBy: { createdAt: 'desc' };
      skip: number;
      take: number;
      include: { reactions: { where: { userId: string }; select: { kind: true } } };
    }): Promise<Array<FeedPostRecord & { reactions: Array<{ kind: string }> }>>;
    count(args: { where: { userId: string } }): Promise<number>;
    create(args: { data: Record<string, unknown> }): Promise<FeedPostRecord>;
    findUnique(args: { where: { id: string } }): Promise<FeedPostRecord | null>;
  };
  feedReaction: {
    findMany(args: {
      where: { postId: { in: string[] } };
      select: { postId: true; kind: true };
    }): Promise<Array<{ postId: string; kind: string }>>;
    upsert(args: {
      where: { postId_userId: { postId: string; userId: string } };
      create: { postId: string; userId: string; kind: string };
      update: { kind: string };
    }): Promise<unknown>;
    delete(args: { where: { postId_userId: { postId: string; userId: string } } }): Promise<unknown>;
    findUnique(args: {
      where: { postId_userId: { postId: string; userId: string } };
    }): Promise<{ kind: string } | null>;
  };
}

export class FeedValidationError extends Error {
  code = 'FEED_VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'FeedValidationError';
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export class QuantyFeedService {
  constructor(private readonly prisma: FeedPrisma) {}

  // -- Instructions ----------------------------------------------------------

  async getInstructions(userId: string): Promise<FeedInstructionRecord | null> {
    return this.prisma.feedInstruction.findUnique({ where: { userId } });
  }

  async saveInstructions(userId: string, prompt: string): Promise<FeedInstructionRecord> {
    const trimmed = prompt.trim();
    if (!trimmed) {
      throw new FeedValidationError('Feed instructions cannot be empty.');
    }
    if (trimmed.length > 2000) {
      throw new FeedValidationError('Feed instructions must be 2000 characters or fewer.');
    }
    return this.prisma.feedInstruction.upsert({
      where: { userId },
      create: { userId, prompt: trimmed },
      update: { prompt: trimmed },
    });
  }

  // -- Posts -----------------------------------------------------------------

  async createPost(input: CreateFeedPostInput): Promise<FeedPostRecord> {
    const title = input.title.trim();
    const excerpt = input.excerpt.trim();
    if (!title) throw new FeedValidationError('Post title cannot be empty.');
    if (!excerpt) throw new FeedValidationError('Post excerpt cannot be empty.');
    if (title.length > 300) throw new FeedValidationError('Post title must be 300 characters or fewer.');

    // Honesty enforcement: external posts MUST have a real URL.
    if (input.provenance === FEED_PROVENANCE_EXTERNAL) {
      if (!input.sourceUrl || !isValidHttpUrl(input.sourceUrl)) {
        throw new FeedValidationError(
          'External posts require a real source URL. Fabricated sources are not allowed.',
        );
      }
    }

    const created = await this.prisma.feedPost.create({
      data: {
        userId: input.userId,
        title,
        excerpt,
        sourceUrl: input.sourceUrl ?? null,
        sourceName: input.sourceName ?? null,
        imageUrl: input.imageUrl ?? null,
        emoji: input.emoji ?? null,
        provenance: input.provenance,
      },
    });
    return { ...created, likeCount: 0, dislikeCount: 0, myReaction: null };
  }

  async getFeed(userId: string, page = 1, limit = 20): Promise<FeedPage> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await Promise.all([
      this.prisma.feedPost.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        include: { reactions: { where: { userId }, select: { kind: true } } },
      }),
      this.prisma.feedPost.count({ where: { userId } }),
    ]);

    const postIds = rows.map((r) => r.id);
    const allReactions =
      postIds.length > 0
        ? await this.prisma.feedReaction.findMany({
            where: { postId: { in: postIds } },
            select: { postId: true, kind: true },
          })
        : [];

    const counts = new Map<string, { likes: number; dislikes: number }>();
    for (const r of allReactions) {
      const entry = counts.get(r.postId) ?? { likes: 0, dislikes: 0 };
      if (r.kind === FEED_REACTION_LIKE) entry.likes += 1;
      else if (r.kind === FEED_REACTION_DISLIKE) entry.dislikes += 1;
      counts.set(r.postId, entry);
    }

    const posts: FeedPostRecord[] = rows.map((row) => {
      const c = counts.get(row.id) ?? { likes: 0, dislikes: 0 };
      const mine = row.reactions[0]?.kind ?? null;
      const { reactions: _omit, ...rest } = row;
      return {
        ...rest,
        likeCount: c.likes,
        dislikeCount: c.dislikes,
        myReaction: (mine === 'like' || mine === 'dislike' ? mine : null) as FeedReactionKind | null,
      };
    });

    return {
      posts,
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: skip + rows.length < total,
    };
  }

  // -- Reactions (toggle: same kind again removes it) ------------------------

  async react(
    userId: string,
    postId: string,
    kind: FeedReactionKind,
  ): Promise<{ postId: string; myReaction: FeedReactionKind | null; likeCount: number; dislikeCount: number }> {
    const post = await this.prisma.feedPost.findUnique({ where: { id: postId } });
    if (!post || post.userId !== userId) {
      throw new FeedValidationError('Post not found.');
    }

    const existing = await this.prisma.feedReaction.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    let myReaction: FeedReactionKind | null;
    if (existing?.kind === kind) {
      // Toggle off.
      await this.prisma.feedReaction.delete({ where: { postId_userId: { postId, userId } } });
      myReaction = null;
    } else {
      await this.prisma.feedReaction.upsert({
        where: { postId_userId: { postId, userId } },
        create: { postId, userId, kind },
        update: { kind },
      });
      myReaction = kind;
    }

    const reactions = await this.prisma.feedReaction.findMany({
      where: { postId: { in: [postId] } },
      select: { postId: true, kind: true },
    });
    const likeCount = reactions.filter((r) => r.kind === FEED_REACTION_LIKE).length;
    const dislikeCount = reactions.filter((r) => r.kind === FEED_REACTION_DISLIKE).length;

    return { postId, myReaction, likeCount, dislikeCount };
  }

  // -- Discuss: open a chat anchored on a post --------------------------------
  // Returns the post context the frontend uses to start/continue a chat
  // conversation about the post. Never fabricates the discussion — the chat
  // itself happens in the normal chat flow with this as the opening context.

  async getDiscussContext(
    userId: string,
    postId: string,
  ): Promise<{
    postId: string;
    title: string;
    excerpt: string;
    sourceUrl: string | null;
    sourceName: string | null;
    provenance: string;
    openingPrompt: string;
  }> {
    const post = await this.prisma.feedPost.findUnique({ where: { id: postId } });
    if (!post || post.userId !== userId) {
      throw new FeedValidationError('Post not found.');
    }
    const provenanceLabel =
      post.provenance === FEED_PROVENANCE_EXTERNAL
        ? `from ${post.sourceName ?? post.sourceUrl ?? 'an external source'}`
        : 'a Quanty brief I generated for you';
    return {
      postId: post.id,
      title: post.title,
      excerpt: post.excerpt,
      sourceUrl: post.sourceUrl,
      sourceName: post.sourceName,
      provenance: post.provenance,
      openingPrompt: `Let's discuss this feed item ${provenanceLabel}: "${post.title}". ${post.excerpt}`,
    };
  }
}
