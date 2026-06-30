import { createAppError } from '@quant/server-core';

// ============================================================================
// QuantMax Match Service
// ============================================================================
//
// Lets a user list and manage their REAL mutual matches (rows in the `match`
// table written on a mutual right-swipe by swipe.service / matching.service).
// This is DISTINCT from `/matching/matches`, which returns swipe *candidates*
// (un-acted-on profiles), not actual Match rows.
//
// Participant convention: a Match row stores the two participants as
// `user1Id` / `user2Id`. The two writers disagree on ordering — matching.service
// sorts the pair (`[a, b].sort()`), while swipe.service stores
// `user1Id = swiperId, user2Id = targetId` unsorted. Therefore this service
// makes NO assumption about which slot the caller occupies: a user is a
// participant iff `user1Id === userId OR user2Id === userId`, and the "other
// participant" is simply whichever slot is not the caller.
//
// Pure + DI'd over a narrow prisma surface (the `match` delegate only) for
// testability. At runtime the real PrismaClient is injected.

/** Narrow prisma surface this service depends on (only the `match` delegate). */
export interface MatchPrismaClient {
  match: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
  };
}

export interface MatchSummary {
  matchId: string;
  otherUserId: string;
  matchedAt: Date | null;
  conversationId: string | null;
  isActive: boolean;
}

export interface UnmatchResult {
  unmatched: true;
}

export class MatchService {
  constructor(private readonly prisma: MatchPrismaClient) {}

  /** The id of the participant who is NOT the caller. */
  private otherParticipant(match: { user1Id: string; user2Id: string }, userId: string): string {
    return match.user1Id === userId ? match.user2Id : match.user1Id;
  }

  private isParticipant(match: { user1Id: string; user2Id: string }, userId: string): boolean {
    return match.user1Id === userId || match.user2Id === userId;
  }

  /**
   * All of the caller's real mutual matches, newest-first. Each entry exposes
   * the OTHER participant's id (the person the caller matched with) plus the
   * match id and metadata.
   */
  async listMatches(userId: string): Promise<MatchSummary[]> {
    const rows = await this.prisma.match.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      orderBy: { matchedAt: 'desc' },
    });

    return rows.map((row) => ({
      matchId: row.id,
      otherUserId: this.otherParticipant(row, userId),
      matchedAt: row.matchedAt ?? null,
      conversationId: row.conversationId ?? null,
      isActive: row.isActive ?? true,
    }));
  }

  /**
   * Fetch a single match the caller participates in. Returns 404
   * MATCH_NOT_FOUND when the match is missing OR the caller is not a
   * participant — the two cases are indistinguishable to the caller, so a
   * non-participant cannot probe for the existence of another pair's match.
   */
  async getMatch(userId: string, matchId: string): Promise<MatchSummary> {
    const id = matchId?.trim();
    if (!id) {
      throw createAppError('Match not found', 404, 'MATCH_NOT_FOUND');
    }

    const match = await this.prisma.match.findUnique({ where: { id } });
    if (!match || !this.isParticipant(match, userId)) {
      throw createAppError('Match not found', 404, 'MATCH_NOT_FOUND');
    }

    return {
      matchId: match.id,
      otherUserId: this.otherParticipant(match, userId),
      matchedAt: match.matchedAt ?? null,
      conversationId: match.conversationId ?? null,
      isActive: match.isActive ?? true,
    };
  }

  /**
   * Unmatch: delete the match row. The caller must be a participant, otherwise
   * 404 MATCH_NOT_FOUND (same no-existence-leakage rule as getMatch). Uses
   * deleteMany scoped by id so a concurrent delete (already-unmatched) does not
   * throw — making repeat calls idempotent-friendly once the row is gone.
   */
  async unmatch(userId: string, matchId: string): Promise<UnmatchResult> {
    const id = matchId?.trim();
    if (!id) {
      throw createAppError('Match not found', 404, 'MATCH_NOT_FOUND');
    }

    const match = await this.prisma.match.findUnique({ where: { id } });
    if (!match || !this.isParticipant(match, userId)) {
      throw createAppError('Match not found', 404, 'MATCH_NOT_FOUND');
    }

    await this.prisma.match.deleteMany({ where: { id } });
    return { unmatched: true };
  }
}
