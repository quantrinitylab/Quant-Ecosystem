// ============================================================================
// QuantWave Orange Live Stream PK Battle Scoring Engine & Tug-of-War Service
// ============================================================================

import { createAppError } from '@quant/server-core';

export interface PkBattleParticipant {
  hostId: string;
  hostName: string;
  score: number;
  supporters: Array<{ userId: string; username: string; points: number }>;
}

export interface PkBattle {
  id: string;
  hostA: PkBattleParticipant;
  hostB: PkBattleParticipant;
  durationSeconds: number;
  startedAt: string;
  endsAt: string;
  status: 'active' | 'completed';
  winnerHostId: string | 'draw' | null;
  mvpContributor: { userId: string; username: string; points: number } | null;
}

export class PkBattleService {
  private static battles: Map<string, PkBattle> = new Map();

  static clearBattlesForTesting(): void {
    PkBattleService.battles.clear();
  }

  static createPkBattle(
    hostA: { id: string; name: string },
    hostB: { id: string; name: string },
    durationSeconds: number = 300,
  ): PkBattle {
    const id = `pk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const startedAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

    const battle: PkBattle = {
      id,
      hostA: {
        hostId: hostA.id,
        hostName: hostA.name,
        score: 0,
        supporters: [],
      },
      hostB: {
        hostId: hostB.id,
        hostName: hostB.name,
        score: 0,
        supporters: [],
      },
      durationSeconds,
      startedAt,
      endsAt,
      status: 'active',
      winnerHostId: null,
      mvpContributor: null,
    };

    PkBattleService.battles.set(id, battle);
    return battle;
  }

  static getBattle(battleId: string): PkBattle | null {
    return PkBattleService.battles.get(battleId) ?? null;
  }

  static calculateTugOfWarRatio(
    hostAScore: number,
    hostBScore: number,
  ): { hostAPercentage: number; hostBPercentage: number } {
    const total = hostAScore + hostBScore;
    if (total === 0) {
      return { hostAPercentage: 50, hostBPercentage: 50 };
    }
    const hostAPercentage = Math.round((hostAScore / total) * 100);
    const hostBPercentage = 100 - hostAPercentage;
    return { hostAPercentage, hostBPercentage };
  }

  static contributePoints(
    battleId: string,
    contributor: { userId: string; username: string },
    targetHostId: string,
    points: number,
  ): PkBattle {
    const battle = PkBattleService.battles.get(battleId);
    if (!battle) {
      throw createAppError('PK Battle not found', 404, 'NOT_FOUND');
    }
    if (battle.status !== 'active') {
      throw createAppError('Cannot contribute to a completed PK Battle', 400, 'BATTLE_COMPLETED');
    }
    if (points <= 0) {
      throw createAppError('Points must be greater than zero', 400, 'INVALID_POINTS');
    }

    let targetParticipant: PkBattleParticipant;
    if (targetHostId === battle.hostA.hostId) {
      targetParticipant = battle.hostA;
    } else if (targetHostId === battle.hostB.hostId) {
      targetParticipant = battle.hostB;
    } else {
      throw createAppError(
        'Target host ID does not match participants in this battle',
        400,
        'INVALID_HOST',
      );
    }

    targetParticipant.score += points;

    // Update or add supporter
    const existingSupporter = targetParticipant.supporters.find(
      (s) => s.userId === contributor.userId,
    );
    if (existingSupporter) {
      existingSupporter.points += points;
      existingSupporter.username = contributor.username;
    } else {
      targetParticipant.supporters.push({
        userId: contributor.userId,
        username: contributor.username,
        points,
      });
    }

    PkBattleService.battles.set(battleId, battle);
    return battle;
  }

  static endPkBattle(battleId: string): PkBattle {
    const battle = PkBattleService.battles.get(battleId);
    if (!battle) {
      throw createAppError('PK Battle not found', 404, 'NOT_FOUND');
    }

    if (battle.status === 'completed') {
      return battle;
    }

    battle.status = 'completed';

    // Determine winner
    if (battle.hostA.score > battle.hostB.score) {
      battle.winnerHostId = battle.hostA.hostId;
    } else if (battle.hostB.score > battle.hostA.score) {
      battle.winnerHostId = battle.hostB.hostId;
    } else {
      battle.winnerHostId = 'draw';
    }

    // Calculate global MVP contributor across all supporters
    const allSupportersMap = new Map<
      string,
      { userId: string; username: string; points: number }
    >();

    for (const participant of [battle.hostA, battle.hostB]) {
      for (const sup of participant.supporters) {
        const existing = allSupportersMap.get(sup.userId);
        if (existing) {
          existing.points += sup.points;
        } else {
          allSupportersMap.set(sup.userId, { ...sup });
        }
      }
    }

    let mvp: { userId: string; username: string; points: number } | null = null;
    let maxPoints = -1;

    for (const sup of allSupportersMap.values()) {
      if (sup.points > maxPoints) {
        maxPoints = sup.points;
        mvp = sup;
      }
    }

    battle.mvpContributor = maxPoints > 0 ? mvp : null;

    PkBattleService.battles.set(battleId, battle);
    return battle;
  }
}

// Standalone functions for direct import compatibility
export function createPkBattle(
  hostA: { id: string; name: string },
  hostB: { id: string; name: string },
  durationSeconds?: number,
): PkBattle {
  return PkBattleService.createPkBattle(hostA, hostB, durationSeconds);
}

export function contributePoints(
  battleId: string,
  contributor: { userId: string; username: string },
  targetHostId: string,
  points: number,
): PkBattle {
  return PkBattleService.contributePoints(battleId, contributor, targetHostId, points);
}

export function calculateTugOfWarRatio(
  hostAScore: number,
  hostBScore: number,
): { hostAPercentage: number; hostBPercentage: number } {
  return PkBattleService.calculateTugOfWarRatio(hostAScore, hostBScore);
}

export function endPkBattle(battleId: string): PkBattle {
  return PkBattleService.endPkBattle(battleId);
}

export function getBattle(battleId: string): PkBattle | null {
  return PkBattleService.getBattle(battleId);
}

export function clearBattlesForTesting(): void {
  PkBattleService.clearBattlesForTesting();
}
