import type {
  Achievement,
  AntiCheatViolation,
  AppContext,
  LeaderboardEntry,
  LeaderboardOptions,
  LeaderboardScope,
  UniversalLeaderboardServiceConfig,
} from '../types.js';

export class UniversalLeaderboardService {
  private scores = new Map<string, LeaderboardEntry[]>();
  private achievements = new Map<string, Achievement[]>();
  private violations: AntiCheatViolation[] = [];
  private config: UniversalLeaderboardServiceConfig;

  constructor(config: UniversalLeaderboardServiceConfig) {
    this.config = config;
  }

  submitScore(
    gameId: string,
    playerId: string,
    score: number,
    appContext: AppContext,
    displayName?: string,
    region?: string,
  ): LeaderboardEntry {
    this.validateScore(gameId, playerId, score);

    const entry: LeaderboardEntry = {
      playerId,
      displayName: displayName ?? playerId,
      score,
      rank: 0,
      appContext,
      region,
      submittedAt: new Date(),
    };

    const key = gameId;
    const entries = this.scores.get(key) ?? [];
    entries.push(entry);
    this.scores.set(key, entries);

    // Recalculate ranks
    this.recalculateRanks(gameId);

    return this.scores.get(key)!.find((e) => e.playerId === playerId && e.score === score)!;
  }

  getLeaderboard(
    gameId: string,
    scope: LeaderboardScope,
    options?: LeaderboardOptions,
  ): LeaderboardEntry[] {
    const entries = this.scores.get(gameId) ?? [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    let filtered: LeaderboardEntry[];

    switch (scope) {
      case 'global':
        filtered = [...entries];
        break;
      case 'app_context':
        filtered = entries.filter((e) => e.appContext === options?.appContext);
        break;
      case 'friends':
        // In a real implementation, this would use the social graph
        filtered = [...entries];
        break;
      case 'regional':
        filtered = entries.filter((e) => e.region === options?.region);
        break;
      default:
        filtered = [...entries];
    }

    // Sort by score descending, recalculate ranks
    filtered.sort((a, b) => b.score - a.score);
    filtered.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return filtered.slice(offset, offset + limit);
  }

  getPlayerRank(gameId: string, playerId: string): number | null {
    const entries = this.scores.get(gameId) ?? [];
    const sorted = [...entries].sort((a, b) => b.score - a.score);
    const index = sorted.findIndex((e) => e.playerId === playerId);
    return index === -1 ? null : index + 1;
  }

  getAchievements(playerId: string): Achievement[] {
    return this.achievements.get(playerId) ?? [];
  }

  unlockAchievement(playerId: string, achievementId: string, gameId: string): Achievement {
    const existing = this.achievements.get(playerId) ?? [];

    // Idempotent - return existing if already unlocked
    const alreadyUnlocked = existing.find((a) => a.id === achievementId);
    if (alreadyUnlocked) {
      return alreadyUnlocked;
    }

    const achievement: Achievement = {
      id: achievementId,
      name: achievementId,
      description: `Achievement ${achievementId}`,
      unlockedAt: new Date(),
      gameId,
    };

    existing.push(achievement);
    this.achievements.set(playerId, existing);
    return achievement;
  }

  getFriendComparison(gameId: string, playerId: string, friendIds: string[]): LeaderboardEntry[] {
    const entries = this.scores.get(gameId) ?? [];
    const relevantIds = new Set([playerId, ...friendIds]);
    const filtered = entries.filter((e) => relevantIds.has(e.playerId));
    filtered.sort((a, b) => b.score - a.score);
    filtered.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    return filtered;
  }

  validateScore(gameId: string, playerId: string, score: number): void {
    if (score > this.config.maxScoreThreshold) {
      const violation: AntiCheatViolation = {
        playerId,
        gameId,
        reason: 'Score exceeds maximum threshold',
        score,
        detectedAt: new Date(),
      };
      this.violations.push(violation);
      throw new Error('Anti-cheat violation: score exceeds maximum threshold');
    }

    if (score < this.config.minScoreThreshold) {
      const violation: AntiCheatViolation = {
        playerId,
        gameId,
        reason: 'Score below minimum threshold',
        score,
        detectedAt: new Date(),
      };
      this.violations.push(violation);
      throw new Error('Anti-cheat violation: score below minimum threshold');
    }
  }

  getViolations(playerId?: string): AntiCheatViolation[] {
    if (playerId) {
      return this.violations.filter((v) => v.playerId === playerId);
    }
    return [...this.violations];
  }

  private recalculateRanks(gameId: string): void {
    const entries = this.scores.get(gameId);
    if (!entries) return;

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });
  }
}
