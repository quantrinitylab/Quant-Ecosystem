// ============================================================================
// QuantNeon - Cross-app Game Leaderboard Service
// ============================================================================
//
// Persists game scores to the shared `GameScore` table (app-tagged) so a user's
// ranks are aggregated across the whole ecosystem — every Quant app that hosts
// games writes here, and the leaderboard derives best-per-user per game across
// all apps (or filtered to one app). This realises the vision's "saare Quant
// apps ke games rank ek dusre se connected".
//
// DI'd narrow prisma for unit-testability.

import { createAppError } from '@quant/server-core';

export interface LeaderboardPrisma {
  gameScore: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
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

export class LeaderboardService {
  constructor(private readonly prisma: LeaderboardPrisma) {}

  /** Record a score event for a game (append-only). */
  async submitScore(input: SubmitScoreInput): Promise<{ id: string }> {
    if (!input.gameId?.trim()) throw createAppError('gameId is required', 400, 'INVALID_GAME');
    if (!input.app?.trim()) throw createAppError('app is required', 400, 'INVALID_APP');
    if (!Number.isFinite(input.score) || !Number.isInteger(input.score)) {
      throw createAppError('score must be a whole number', 400, 'INVALID_SCORE');
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
   * Top players for a game, by each player's BEST score across all apps
   * (or a single `app` when scoped). Cross-app by default — that's the point.
   */
  async getLeaderboard(
    gameId: string,
    options: { app?: string; limit?: number } = {},
  ): Promise<LeaderboardEntry[]> {
    if (!gameId?.trim()) throw createAppError('gameId is required', 400, 'INVALID_GAME');
    const limit = Math.min(Math.max(options.limit ?? 20, 1), MAX_LIMIT);

    const rows = await this.prisma.gameScore.findMany({
      where: { gameId, ...(options.app ? { app: options.app } : {}) },
      orderBy: { score: 'desc' },
    });

    // Reduce to each user's single best score (rows are already score-desc, so
    // the first time we see a user is their best).
    const bestByUser = new Map<string, LeaderboardEntry>();
    for (const r of rows) {
      const userId = String(r.userId);
      if (bestByUser.has(userId)) continue;
      bestByUser.set(userId, {
        rank: 0,
        userId,
        displayName: (r.displayName as string | null) ?? null,
        bestScore: Number(r.score) || 0,
        app: String(r.app ?? ''),
        region: (r.region as string | null) ?? null,
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
