// ============================================================================
// QuantSync - Feed Space Rules (pure, isomorphic)
// ============================================================================
//
// The space authorization rules with NO Node-only dependencies, so they can run
// identically on the server (FeedSpaceService) and in client components (compose
// gating). Keep this file free of `node:crypto` and any I/O.
//
// Spaces:
//   main       — anyone (non-banned) can post/reply; everyone can view.
//   verified   — everyone can view; only verified accounts can post/reply.
//   anonymous  — anyone can post/reply, identity hidden + moderated (the
//                pseudonymisation/moderation lives in the server service).

export type FeedSpace = 'main' | 'verified' | 'anonymous';

/** The minimal author facts needed to authorize a space action. */
export interface SpaceAuthor {
  id: string;
  /** Whether the account holds a QuantSync Verified badge. */
  isVerified: boolean;
  /** Suspended/banned accounts cannot post or reply anywhere. */
  isBanned?: boolean;
}

export interface SpaceActionResult {
  allowed: boolean;
  reason?: string;
}

/** Everyone can view every space (the Verified space is read-public). */
export function canView(_space: FeedSpace): SpaceActionResult {
  return { allowed: true };
}

/** Can this author create a top-level post in the given space? */
export function canPost(space: FeedSpace, author: SpaceAuthor): SpaceActionResult {
  if (author.isBanned) {
    return { allowed: false, reason: 'Account is suspended' };
  }
  if (space === 'verified' && !author.isVerified) {
    return {
      allowed: false,
      reason: 'Only verified accounts can post in QuantSync Verified',
    };
  }
  return { allowed: true };
}

/**
 * Can this author reply in the given space? Replies follow the same rule as
 * posts: a non-verified user can read the Verified space but cannot reply.
 */
export function canReply(space: FeedSpace, author: SpaceAuthor): SpaceActionResult {
  if (author.isBanned) {
    return { allowed: false, reason: 'Account is suspended' };
  }
  if (space === 'verified' && !author.isVerified) {
    return {
      allowed: false,
      reason: 'Only verified accounts can reply in QuantSync Verified',
    };
  }
  return { allowed: true };
}
