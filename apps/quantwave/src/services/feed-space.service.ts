// ============================================================================
// QuantSync - Feed Space Service
// ============================================================================
//
// QuantSync is split into three feed "spaces", each with its own posting rules
// (product spec):
//
//   main       — the normal X/Threads-style feed. Anyone (non-banned) can post
//                and reply; everyone can view.
//
//   verified   — "QuantSync Verified". Shown to EVERYONE (all users can view),
//                but ONLY verified accounts may post or reply. This is the space
//                for official/government/notable accounts where the public reads
//                but cannot reply unless they are themselves verified.
//
//   anonymous  — a separate, identity-hidden space (anonymous feed + anonymous
//                reels). Anyone can post/reply, but the author identity is never
//                exposed and every submission MUST pass content moderation before
//                it is published. The author is pseudonymised with a stable
//                per-thread alias (HMAC, non-reversible) so a conversation stays
//                coherent without revealing who is talking.
//
// This service holds pure authorization + pseudonymisation logic with no I/O, so
// it is deterministic and fully testable. Content moderation is injected (a real
// moderator is wired by the caller), never faked here.

import { createHmac } from 'node:crypto';
import {
  canPost as canPostRule,
  canReply as canReplyRule,
  canView as canViewRule,
  type FeedSpace,
  type SpaceActionResult,
  type SpaceAuthor,
} from './feed-space-rules';

export type { FeedSpace, SpaceActionResult, SpaceAuthor } from './feed-space-rules';

/** Injected moderation dependency. A real moderator implements this. */
export interface ContentModerator {
  check(content: string): Promise<{ allowed: boolean; reason?: string }>;
}

/** Public-facing projection of a post (never leaks the real author of anon posts). */
export interface PublicSpacePost {
  id: string;
  space: FeedSpace;
  content: string;
  /** Present only for non-anonymous posts. */
  authorId?: string;
  /** Present only for anonymous posts — a stable, non-reversible per-thread alias. */
  anonymousAlias?: string;
  isAnonymous: boolean;
  createdAt: number;
}

export interface SubmitResult {
  ok: boolean;
  reason?: string;
  post?: PublicSpacePost;
}

export class FeedSpaceError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_VERIFIED' | 'BANNED' | 'MODERATION_REJECTED',
  ) {
    super(message);
    this.name = 'FeedSpaceError';
  }
}

export class FeedSpaceService {
  /**
   * @param aliasSecret server-side secret used to derive anonymous aliases via
   *   HMAC. Keep stable per deployment so a user's alias is consistent within a
   *   thread, but never store/expose the mapping.
   */
  constructor(private readonly aliasSecret: string) {
    if (!aliasSecret) {
      throw new Error('FeedSpaceService requires a non-empty aliasSecret');
    }
  }

  /** Everyone can view every space (the Verified space is read-public). */
  canView(space: FeedSpace): SpaceActionResult {
    return canViewRule(space);
  }

  /** Can this author create a top-level post in the given space? */
  canPost(space: FeedSpace, author: SpaceAuthor): SpaceActionResult {
    return canPostRule(space, author);
  }

  /**
   * Can this author reply in the given space? Replies follow the same rule as
   * posts: a non-verified user can read the Verified space but cannot reply.
   */
  canReply(space: FeedSpace, author: SpaceAuthor): SpaceActionResult {
    return canReplyRule(space, author);
  }

  /** Throwing variant of {@link canPost}. */
  assertCanPost(space: FeedSpace, author: SpaceAuthor): void {
    const res = this.canPost(space, author);
    if (!res.allowed) {
      throw new FeedSpaceError(res.reason ?? 'Not allowed to post', this.errorCode(author));
    }
  }

  /** Throwing variant of {@link canReply}. */
  assertCanReply(space: FeedSpace, author: SpaceAuthor): void {
    const res = this.canReply(space, author);
    if (!res.allowed) {
      throw new FeedSpaceError(res.reason ?? 'Not allowed to reply', this.errorCode(author));
    }
  }

  /**
   * Derive a stable, non-reversible alias for an author within a thread. The
   * same (author, thread) always yields the same alias so a conversation reads
   * coherently, but the alias cannot be reversed to the author without the
   * secret, and differs across threads so cross-thread tracking is prevented.
   */
  anonymousAlias(authorId: string, threadId: string): string {
    const digest = createHmac('sha256', this.aliasSecret)
      .update(`${threadId}:${authorId}`)
      .digest('hex');
    return `Anon-${digest.slice(0, 6)}`;
  }

  /**
   * Submit a post to a space, enforcing authorization, moderation (anonymous
   * space) and pseudonymisation. Returns a public projection safe to broadcast.
   *
   * For the anonymous space the returned post never includes `authorId`; the
   * caller is responsible for storing the real author server-side (for abuse
   * handling) and only ever serving the public projection to clients.
   */
  async submitPost(input: {
    space: FeedSpace;
    author: SpaceAuthor;
    content: string;
    postId: string;
    threadId?: string;
    moderator?: ContentModerator;
  }): Promise<SubmitResult> {
    const { space, author, content, postId } = input;

    const auth = this.canPost(space, author);
    if (!auth.allowed) {
      return { ok: false, reason: auth.reason };
    }

    if (space === 'anonymous') {
      if (!input.moderator) {
        return { ok: false, reason: 'Anonymous space requires a content moderator' };
      }
      const verdict = await input.moderator.check(content);
      if (!verdict.allowed) {
        return { ok: false, reason: verdict.reason ?? 'Content rejected by moderation' };
      }
      const threadId = input.threadId ?? postId;
      return {
        ok: true,
        post: {
          id: postId,
          space,
          content,
          isAnonymous: true,
          anonymousAlias: this.anonymousAlias(author.id, threadId),
          createdAt: Date.now(),
        },
      };
    }

    return {
      ok: true,
      post: {
        id: postId,
        space,
        content,
        authorId: author.id,
        isAnonymous: false,
        createdAt: Date.now(),
      },
    };
  }

  private errorCode(author: SpaceAuthor): FeedSpaceError['code'] {
    return author.isBanned ? 'BANNED' : 'NOT_VERIFIED';
  }
}
