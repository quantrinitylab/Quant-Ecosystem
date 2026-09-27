// ============================================================================
// Orange PK Battle Scoring Engine & Tug-of-War Unit Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPkBattle,
  getBattle,
  contributePoints,
  endPkBattle,
  calculateTugOfWarRatio,
  clearBattlesForTesting,
} from '../services/pk-battle.service';

describe('Orange PK Battle Scoring Engine', () => {
  beforeEach(() => {
    clearBattlesForTesting();
  });

  it('initializes battle with 50/50 ratio and active status', () => {
    const battle = createPkBattle(
      { id: 'host_a', name: 'Alice' },
      { id: 'host_b', name: 'Bob' },
      180,
    );

    expect(battle.status).toBe('active');
    expect(battle.hostA.score).toBe(0);
    expect(battle.hostB.score).toBe(0);

    const ratio = calculateTugOfWarRatio(battle.hostA.score, battle.hostB.score);
    expect(ratio).toEqual({ hostAPercentage: 50, hostBPercentage: 50 });
  });

  it('updates scores and calculates tug-of-war ratio correctly (e.g. 300 vs 100 -> 75% vs 25%)', () => {
    const battle = createPkBattle({ id: 'host_a', name: 'Alice' }, { id: 'host_b', name: 'Bob' });

    contributePoints(battle.id, { userId: 'user_1', username: 'Fan1' }, 'host_a', 300);

    contributePoints(battle.id, { userId: 'user_2', username: 'Fan2' }, 'host_b', 100);

    const updated = getBattle(battle.id)!;
    expect(updated.hostA.score).toBe(300);
    expect(updated.hostB.score).toBe(100);

    const ratio = calculateTugOfWarRatio(updated.hostA.score, updated.hostB.score);
    expect(ratio).toEqual({ hostAPercentage: 75, hostBPercentage: 25 });
  });

  it('identifies correct winner and global MVP contributor when battle ends', () => {
    const battle = createPkBattle({ id: 'host_a', name: 'Alice' }, { id: 'host_b', name: 'Bob' });

    // Supporter 1 contributes 500 to host A
    contributePoints(battle.id, { userId: 'user_sup1', username: 'WhaleSupporter' }, 'host_a', 500);

    // Supporter 2 contributes 200 to host A
    contributePoints(battle.id, { userId: 'user_sup2', username: 'RegularFan' }, 'host_a', 200);

    // Supporter 3 contributes 400 to host B
    contributePoints(battle.id, { userId: 'user_sup3', username: 'BobFan' }, 'host_b', 400);

    const completed = endPkBattle(battle.id);

    expect(completed.status).toBe('completed');
    expect(completed.winnerHostId).toBe('host_a');
    expect(completed.mvpContributor).toEqual({
      userId: 'user_sup1',
      username: 'WhaleSupporter',
      points: 500,
    });
  });

  it('results in a draw when both hosts have equal scores', () => {
    const battle = createPkBattle({ id: 'host_a', name: 'Alice' }, { id: 'host_b', name: 'Bob' });

    contributePoints(battle.id, { userId: 'user_1', username: 'Fan1' }, 'host_a', 250);

    contributePoints(battle.id, { userId: 'user_2', username: 'Fan2' }, 'host_b', 250);

    const completed = endPkBattle(battle.id);

    expect(completed.status).toBe('completed');
    expect(completed.winnerHostId).toBe('draw');
    const ratio = calculateTugOfWarRatio(completed.hostA.score, completed.hostB.score);
    expect(ratio).toEqual({ hostAPercentage: 50, hostBPercentage: 50 });
  });
});
