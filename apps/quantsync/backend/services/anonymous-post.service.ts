// ============================================================================
// QuantSync - Anonymous Post Service
// ============================================================================
//
// The Anonymous section: a separate space where anyone can post/reply but the
// author identity is NEVER exposed to readers. Each post shows a stable,
// non-reversible per-thread alias instead. The real author is retained in
// posts.userId (for abuse handling / takedowns) but is stripped from every
// public projection. Every submission must pass content moderation before it is
// persisted (fail-closed: no moderator => rejected).
//
// Pure domain logic + dependency injection (prisma, moderator, alias secret,
// id/clock generators) so it is fully unit-testable with a mock prisma.

import { createHmac, randomUUID } from 'node:crypto';
import type { PrismaClient } from '../types';

export interface ContentModerator {
  check(content: string): Promise<{ allowed: boolean; reason?: string }>;
}

/** Public projection — safe to broadcast. NEVER includes the real userId. */
export interface PublicAnonymousPost {
  id: string;
  content: string;
  anonymousAlias: string;
  isAnonymous: true;
  replyToId: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
}

export interface CreateAnonymousPostInput {
  userId: string;
  content: string;
  replyToId?: string;
}

export interface AnonymousPostServiceOptions {
  aliasSecret: string;
  moderator: ContentModerator;
  idFactory?: () => string;
  now?: () => Date;
}

export interface PaginatedAnon {
  data: PublicAnonymousPost[];
  page: number;
  pageSize: number;
}

const MAX_CONTENT = 50000;

export class AnonymousModerationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AnonymousModerationError';
  }
}

export class AnonymousPostService {
  private readonly aliasSecret: string;
  private readonly moderator: ContentModerator;
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    options: AnonymousPostServiceOptions,
  ) {
    if (!options.aliasSecret) {
      throw new Error('AnonymousPostService requires a non-empty aliasSecret');
    }
    this.aliasSecret = options.aliasSecret;
    this.moderator = options.moderator;
    this.idFactory = options.idFactory ?? (() => `anon_${randomUUID()}`);
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Stable, non-reversible per-thread alias. Same (author, thread) => same alias
   * (coherent conversation); different threads => different alias (no cross-thread
   * tracking); cannot be reversed to the author without the secret.
   */
  aliasFor(userId: string, threadId: string): string {
    const digest = createHmac('sha256', this.aliasSecret)
      .update(`${threadId}:${userId}`)
      .digest('hex');
    return `Anon-${digest.slice(0, 8)}`;
  }

  async createAnonymousPost(input: CreateAnonymousPostInput): Promise<PublicAnonymousPost> {
    const content = input.content?.trim() ?? '';
    if (!content) {
      throw new AnonymousModerationError('Content must not be empty');
    }
    if (content.length > MAX_CONTENT) {
      throw new AnonymousModerationError('Content exceeds maximum length');
    }

    // Fail-closed moderation gate.
    const verdict = await this.moderator.check(content);
    if (!verdict.allowed) {
      throw new AnonymousModerationError(verdict.reason ?? 'Content rejected by moderation');
    }

    const id = this.idFactory();
    // Top-level posts thread on their own id; replies thread on the root they answer.
    const threadId = input.replyToId ?? id;
    const alias = this.aliasFor(input.userId, threadId);

    const post = await this.prisma.post.create({
      data: {
        id,
        userId: input.userId,
        type: 'TEXT',
        content,
        mediaUrls: [],
        hashtags: [],
        mentions: [],
        replyToId: input.replyToId ?? null,
        communityId: null,
        visibility: 'PUBLIC',
        isAnonymous: true,
        anonymousAlias: alias,
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        viewCount: 0,
        isEdited: false,
        isPinned: false,
        moderationStatus: 'APPROVED',
        publishedAt: this.now(),
      },
    });

    return this.toPublic(post);
  }

  async listAnonymousFeed(
    options: { page?: number; pageSize?: number } = {},
  ): Promise<PaginatedAnon> {
    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const rows = await this.prisma.post.findMany({
      where: { isAnonymous: true, deletedAt: null, moderationStatus: 'APPROVED' },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });

    return { data: rows.map((r) => this.toPublic(r)), page, pageSize };
  }

  /** Strip the real author; expose only the alias. */
  private toPublic(post: Record<string, unknown>): PublicAnonymousPost {
    return {
      id: String(post['id']),
      content: String(post['content'] ?? ''),
      anonymousAlias: String(post['anonymousAlias'] ?? ''),
      isAnonymous: true,
      replyToId: (post['replyToId'] as string | null) ?? null,
      likeCount: Number(post['likeCount'] ?? 0),
      commentCount: Number(post['commentCount'] ?? 0),
      createdAt: (post['createdAt'] as Date) ?? this.now(),
    };
  }
}

/**
 * Baseline content moderator for the anonymous space. Performs real,
 * deterministic checks (blank, length, and a denylist of clearly-illegal
 * content markers) and is the pluggable extension point for a full ML/3rd-party
 * moderation pipeline. Designed to fail closed.
 */
export class DefaultAnonymousModerator implements ContentModerator {
  // Minimal denylist of clearly-illegal-content markers. A production deployment
  // replaces this with a real classifier + hash-matching (e.g. CSAM matcher).
  private static readonly DENY = [/\bcsam\b/i, /child\s*porn/i, /\bhow to (make|build) a bomb\b/i];

  async check(content: string): Promise<{ allowed: boolean; reason?: string }> {
    const text = content.trim();
    if (!text) return { allowed: false, reason: 'Empty content' };
    if (text.length > MAX_CONTENT) return { allowed: false, reason: 'Content too long' };
    for (const rx of DefaultAnonymousModerator.DENY) {
      if (rx.test(text)) return { allowed: false, reason: 'Content violates policy' };
    }
    return { allowed: true };
  }
}
