export type TournamentRoundName = 'ROUND_OF_16' | 'QUARTER_FINALS' | 'SEMI_FINALS' | 'FINALS';

export interface WagerMatch {
  id: string;
  gameId: string;
  player1Id: string;
  player2Id: string;
  stakePerPlayer: number;
  totalEscrow: number;
  status: 'STAKED' | 'COMPLETED' | 'REFUNDED';
  winnerPlayerId?: string | 'DRAW';
  winnerPayout?: number;
  platformFee?: number;
  createdAt: string;
  completedAt?: string;
}

export interface TournamentMatch {
  matchId: string;
  round: TournamentRoundName;
  roundIndex: number;
  player1Id?: string;
  player2Id?: string;
  winnerId?: string;
  nextMatchId?: string;
}

export interface TournamentBracket {
  id: string;
  name: string;
  gameId: string;
  playerIds: string[];
  totalRounds: number;
  matches: TournamentMatch[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  championUserId?: string;
}

export interface ArcadeLeaderboardEntry {
  rank: number;
  userId: string;
  gameId: string;
  score: number;
  achievedAt: string;
}

export class ArcadeMatchmakingService {
  private wagers: Map<string, WagerMatch> = new Map();
  private brackets: Map<string, TournamentBracket> = new Map();
  private leaderboard: Omit<ArcadeLeaderboardEntry, 'rank'>[] = [];

  createWagerMatch(
    player1Id: string,
    player2Id: string,
    gameId: string,
    stakePerPlayer: number,
    p1Balance: number,
    p2Balance: number,
  ): WagerMatch {
    if (stakePerPlayer <= 0) {
      throw new Error('Stake must be greater than 0');
    }
    if (p1Balance < stakePerPlayer || p2Balance < stakePerPlayer) {
      throw new Error('Insufficient balance');
    }

    const match: WagerMatch = {
      id: `wager_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      gameId,
      player1Id,
      player2Id,
      stakePerPlayer,
      totalEscrow: stakePerPlayer * 2,
      status: 'STAKED',
      createdAt: new Date().toISOString(),
    };
    this.wagers.set(match.id, match);
    return match;
  }

  resolveWagerMatch(matchId: string, winnerPlayerId: string | 'DRAW'): WagerMatch {
    const match = this.wagers.get(matchId);
    if (!match) throw new Error('Match not found');
    if (match.status !== 'STAKED') throw new Error('Match already resolved');

    match.winnerPlayerId = winnerPlayerId;
    match.completedAt = new Date().toISOString();

    if (winnerPlayerId === 'DRAW') {
      match.status = 'REFUNDED';
      match.winnerPayout = match.stakePerPlayer;
      match.platformFee = 0;
    } else {
      match.status = 'COMPLETED';
      match.platformFee = Math.floor(match.totalEscrow * 0.1);
      match.winnerPayout = match.totalEscrow - match.platformFee;
    }

    return match;
  }

  createTournamentBracket(name: string, gameId: string, playerIds: string[]): TournamentBracket {
    const numPlayers = playerIds.length;
    if (![4, 8, 16].includes(numPlayers)) {
      throw new Error('Tournament must have 4, 8, or 16 players');
    }

    const bracketId = `bracket_${Date.now()}`;
    const totalRounds = Math.log2(numPlayers);
    const matches: TournamentMatch[] = [];

    const getRoundName = (roundIndex: number, totalRounds: number): TournamentRoundName => {
      const remainingRounds = totalRounds - roundIndex;
      if (remainingRounds === 1) return 'FINALS';
      if (remainingRounds === 2) return 'SEMI_FINALS';
      if (remainingRounds === 3) return 'QUARTER_FINALS';
      if (remainingRounds === 4) return 'ROUND_OF_16';
      throw new Error('Unsupported round');
    };

    let currentMatchId = 1;
    let previousRoundMatches: TournamentMatch[] = [];

    for (let r = 0; r < totalRounds; r++) {
      const numMatchesInRound = numPlayers / Math.pow(2, r + 1);
      const currentRoundMatches: TournamentMatch[] = [];

      for (let i = 0; i < numMatchesInRound; i++) {
        const match: TournamentMatch = {
          matchId: `m_${currentMatchId++}`,
          round: getRoundName(r, totalRounds),
          roundIndex: r,
        };

        if (r === 0) {
          match.player1Id = playerIds[i * 2];
          match.player2Id = playerIds[i * 2 + 1];
        } else {
          const prevMatch1 = previousRoundMatches[i * 2];
          const prevMatch2 = previousRoundMatches[i * 2 + 1];
          prevMatch1.nextMatchId = match.matchId;
          prevMatch2.nextMatchId = match.matchId;
        }

        currentRoundMatches.push(match);
        matches.push(match);
      }
      previousRoundMatches = currentRoundMatches;
    }

    const bracket: TournamentBracket = {
      id: bracketId,
      name,
      gameId,
      playerIds,
      totalRounds,
      matches,
      status: 'PENDING',
    };

    this.brackets.set(bracketId, bracket);
    return bracket;
  }

  advanceTournamentMatch(
    bracketId: string,
    matchId: string,
    winnerUserId: string,
  ): TournamentBracket {
    const bracket = this.brackets.get(bracketId);
    if (!bracket) throw new Error('Bracket not found');

    const match = bracket.matches.find((m) => m.matchId === matchId);
    if (!match) throw new Error('Match not found');
    if (match.winnerId) throw new Error('Match already resolved');
    if (!match.player1Id || !match.player2Id) throw new Error('Match not ready');
    if (match.player1Id !== winnerUserId && match.player2Id !== winnerUserId) {
      throw new Error('Winner must be a player in the match');
    }

    match.winnerId = winnerUserId;
    bracket.status = 'IN_PROGRESS';

    if (match.nextMatchId) {
      const nextMatch = bracket.matches.find((m) => m.matchId === match.nextMatchId);
      if (nextMatch) {
        if (!nextMatch.player1Id) {
          nextMatch.player1Id = winnerUserId;
        } else {
          nextMatch.player2Id = winnerUserId;
        }
      }
    } else {
      bracket.championUserId = winnerUserId;
      bracket.status = 'COMPLETED';
    }

    return bracket;
  }

  recordGameScore(
    userId: string,
    gameId: string,
    score: number,
    timestampIso?: string,
  ): ArcadeLeaderboardEntry {
    const entry = {
      userId,
      gameId,
      score,
      achievedAt: timestampIso || new Date().toISOString(),
    };
    this.leaderboard.push(entry);

    return {
      ...entry,
      rank: 0,
    };
  }

  getLeaderboard(
    gameId: string,
    timeframe?: 'daily' | 'weekly' | 'all_time',
    limit?: number,
  ): ArcadeLeaderboardEntry[] {
    let filtered = this.leaderboard.filter((e) => e.gameId === gameId);

    if (timeframe && timeframe !== 'all_time') {
      const now = Date.now();
      const msInDay = 24 * 60 * 60 * 1000;
      const msInWeek = 7 * msInDay;
      const threshold = timeframe === 'daily' ? now - msInDay : now - msInWeek;

      filtered = filtered.filter((e) => new Date(e.achievedAt).getTime() >= threshold);
    }

    filtered.sort((a, b) => b.score - a.score);

    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered.map((e, index) => ({
      ...e,
      rank: index + 1,
    }));
  }

  clearArcadeForTesting(): void {
    this.wagers.clear();
    this.brackets.clear();
    this.leaderboard = [];
  }
}
