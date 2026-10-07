// ============================================================================
// Cross-App Gaming - Durable Game Leaderboard (shared GameScore table)
// ============================================================================
//
// The persistent, ecosystem-wide leaderboard. EVERY Quant app that hosts games
// (QuantNeon, QuantChat, QuantMax, ...) writes score events to the one shared
// `GameScore` table tagged with the originating `app`, and rankings are derived
// from each player's BEST score across all apps (or filtered to a single app).
// This realises the vision's "saare Quant apps ke games rank ek dusre se
// connected" — the cross-app rank graph.
//
// This replaces the in-memory `UniversalLeaderboardService` (whose scores were
// lost on restart and never shared across instances). Persistence is injected
// as a narrow Prisma surface so the package stays dependency-light and the
// service is fully unit-testable with a mock.

/** Raised on invalid input; carries an HTTP-mappable statusCode + code. */
export class LeaderboardValidationError extends Error {
  readonly statusCode = 400;
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'LeaderboardValidationError';
  }
}

export interface GameScoreRow {
  id: string;
  gameId: string;
  userId: string;
  app: string;
  score: number;
  displayName: string | null;
  region: string | null;
}

export interface GameLeaderboardPrisma {
  gameScore: {
    create: (args: { data: Record<string, unknown> }) => Promise<GameScoreRow>;
    findMany: (args: Record<string, unknown>) => Promise<GameScoreRow[]>;
  };
}

export interface SubmitScoreInput {
  gameId: string;
  userId: string;
  app: string;
  score: number;
  displayName?: string;
  region?: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string | null;
  bestScore: number;
  app: string;
  region: string | null;
}

const MAX_LIMIT = 100;

export class GameLeaderboardService {
  constructor(private readonly prisma: GameLeaderboardPrisma) {}

  /** Record a score event for a game (append-only, app-tagged). */
  async submitScore(input: SubmitScoreInput): Promise<{ id: string }> {
    if (!input.gameId?.trim()) {
      throw new LeaderboardValidationError('gameId is required', 'INVALID_GAME');
    }
    if (!input.app?.trim()) {
      throw new LeaderboardValidationError('app is required', 'INVALID_APP');
    }
    if (!input.userId?.trim()) {
      throw new LeaderboardValidationError('userId is required', 'INVALID_USER');
    }
    if (!Number.isFinite(input.score) || !Number.isInteger(input.score)) {
      throw new LeaderboardValidationError('score must be a whole number', 'INVALID_SCORE');
    }

    const row = await this.prisma.gameScore.create({
      data: {
        gameId: input.gameId,
        userId: input.userId,
        app: input.app,
        score: input.score,
        displayName: input.displayName ?? null,
        region: input.region ?? null,
      },
    });
    return { id: String(row.id) };
  }

  /**
   * Top players for a game by each player's BEST score across all apps (or a
   * single `app` when scoped). Cross-app by default — that's the point.
   */
  async getLeaderboard(
    gameId: string,
    options: { app?: string; limit?: number } = {},
  ): Promise<LeaderboardEntry[]> {
    if (!gameId?.trim()) {
      throw new LeaderboardValidationError('gameId is required', 'INVALID_GAME');
    }
    const limit = Math.min(Math.max(options.limit ?? 20, 1), MAX_LIMIT);

    const rows = await this.prisma.gameScore.findMany({
      where: { gameId, ...(options.app ? { app: options.app } : {}) },
      orderBy: { score: 'desc' },
    });

    // Rows are score-desc, so the first time we see a user is their best score.
    const bestByUser = new Map<string, LeaderboardEntry>();
    for (const r of rows) {
      const userId = String(r.userId);
      if (bestByUser.has(userId)) continue;
      bestByUser.set(userId, {
        rank: 0,
        userId,
        displayName: r.displayName ?? null,
        bestScore: Number(r.score) || 0,
        app: String(r.app ?? ''),
        region: r.region ?? null,
      });
    }

    return [...bestByUser.values()]
      .sort((a, b) => b.bestScore - a.bestScore)
      .slice(0, limit)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  }

  /** A single user's best score + rank for a game (cross-app or app-scoped). */
  async getUserRank(
    gameId: string,
    userId: string,
    options: { app?: string } = {},
  ): Promise<{ rank: number; bestScore: number } | null> {
    const board = await this.getLeaderboard(gameId, { app: options.app, limit: MAX_LIMIT });
    const entry = board.find((e) => e.userId === userId);
    return entry ? { rank: entry.rank, bestScore: entry.bestScore } : null;
  }
}
