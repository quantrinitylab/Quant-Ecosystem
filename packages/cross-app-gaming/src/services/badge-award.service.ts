// ============================================================================
// Cross-App Gaming - Durable Badge / Achievement Service (shared GameBadge table)
// ============================================================================
//
// Players earn badges / achievements as they play games across the Quant
// ecosystem (QuantNeon, QuantChat, QuantMax, ...). EVERY app writes earned
// badges to the one shared `GameBadge` table so a player's achievements travel
// with their identity across the whole ecosystem — the same cross-app philosophy
// as the shared `GameScore` leaderboard.
//
// Until now nothing wrote `GameBadge` rows. This service is the durable writer.
// Awarding is IDEMPOTENT: a given (userId, badgeType) is only ever stored once,
// so re-awarding (e.g. a retried request or a game replaying an unlock event)
// never produces duplicate rows.
//
// Persistence is injected as a narrow Prisma surface so the package stays
// dependency-light and the service is fully unit-testable with a mock. The
// package has NO @quant/server-core dependency, so we throw a local
// validation error class (mirroring GameLeaderboardService).

/** Raised on invalid input; carries an HTTP-mappable statusCode + code. */
export class BadgeValidationError extends Error {
  readonly statusCode = 400;
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'BadgeValidationError';
  }
}

export interface GameBadgeRow {
  id: string;
  userId: string;
  badgeType: string;
  awardedAt: Date;
}

export interface GameBadgePrisma {
  gameBadge: {
    create: (args: { data: Record<string, unknown> }) => Promise<GameBadgeRow>;
    findUnique: (args: Record<string, unknown>) => Promise<GameBadgeRow | null>;
    findMany: (args: Record<string, unknown>) => Promise<GameBadgeRow[]>;
  };
}

export interface AwardBadgeResult {
  /** The badge row (existing or newly created). */
  badge: GameBadgeRow;
  /** True when this call created the row; false when it already existed. */
  created: boolean;
}

export class BadgeAwardService {
  constructor(private readonly prisma: GameBadgePrisma) {}

  /**
   * Award `badgeType` to `userId`. IDEMPOTENT: if the user already holds the
   * badge, the existing row is returned and NO new row is created.
   */
  async awardBadge(userId: string, badgeType: string): Promise<AwardBadgeResult> {
    const cleanUserId = this.requireUserId(userId);
    const cleanBadgeType = this.requireBadgeType(badgeType);

    const existing = await this.findBadge(cleanUserId, cleanBadgeType);
    if (existing) {
      return { badge: existing, created: false };
    }

    const badge = await this.prisma.gameBadge.create({
      data: {
        userId: cleanUserId,
        badgeType: cleanBadgeType,
      },
    });
    return { badge, created: true };
  }

  /** All badges a user has earned, newest first. */
  async listBadges(userId: string): Promise<GameBadgeRow[]> {
    const cleanUserId = this.requireUserId(userId);
    return this.prisma.gameBadge.findMany({
      where: { userId: cleanUserId },
      orderBy: { awardedAt: 'desc' },
    });
  }

  /** Whether a user already holds a given badge. */
  async hasBadge(userId: string, badgeType: string): Promise<boolean> {
    const cleanUserId = this.requireUserId(userId);
    const cleanBadgeType = this.requireBadgeType(badgeType);
    return (await this.findBadge(cleanUserId, cleanBadgeType)) !== null;
  }

  // --- internals -----------------------------------------------------------

  /**
   * Look up a single (userId, badgeType) badge. There is no DB-level unique
   * constraint on the pair, so we query by both fields and take the first
   * match — sufficient to keep awarding idempotent.
   */
  private async findBadge(userId: string, badgeType: string): Promise<GameBadgeRow | null> {
    const matches = await this.prisma.gameBadge.findMany({
      where: { userId, badgeType },
    });
    return matches[0] ?? null;
  }

  private requireUserId(userId: string): string {
    if (!userId?.trim()) {
      throw new BadgeValidationError('userId is required', 'INVALID_USER');
    }
    return userId.trim();
  }

  private requireBadgeType(badgeType: string): string {
    if (!badgeType?.trim()) {
      throw new BadgeValidationError('badgeType is required', 'INVALID_BADGE_TYPE');
    }
    return badgeType.trim();
  }
}
