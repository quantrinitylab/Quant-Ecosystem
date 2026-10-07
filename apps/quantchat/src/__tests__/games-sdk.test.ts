import { describe, it, expect } from 'vitest';
import {
  GAME_COMPLETION_XP,
  GAME_LOAD_TIMEOUT_MS,
  formatGameScoreMessage,
  isGameMessage,
  type GameDefinition,
  type GameScore,
} from '../lib/games-sdk';

// Unit tests for the games SDK interface (Task 14.5, 14.6, 14.7).

const game: GameDefinition = {
  id: 'nebula-trivia',
  name: 'Nebula Trivia',
  description: 'trivia',
  icon: '🌌',
  url: '/games/nebula-trivia/index.html',
  minPlayers: 2,
  maxPlayers: 8,
};

describe('isGameMessage', () => {
  it('accepts trusted game messages', () => {
    expect(isGameMessage({ source: 'quant-game', type: 'ready', gameId: 'x' })).toBe(true);
    expect(
      isGameMessage({ source: 'quant-game', type: 'error', gameId: 'x', message: 'bad' }),
    ).toBe(true);
  });

  it('rejects untrusted or malformed messages', () => {
    expect(isGameMessage(null)).toBe(false);
    expect(isGameMessage('hello')).toBe(false);
    expect(isGameMessage({ source: 'evil', type: 'ready' })).toBe(false);
    expect(isGameMessage({ source: 'quant-game', type: 'unknown' })).toBe(false);
  });
});

describe('formatGameScoreMessage', () => {
  it('ranks scores highest-first and names the winner (Requirement 17.3)', () => {
    const scores: GameScore[] = [
      { userId: 'a', displayName: 'Alice', score: 3 },
      { userId: 'b', displayName: 'Bob', score: 9 },
    ];
    const text = formatGameScoreMessage(game, scores);
    expect(text).toContain('Winner: Bob');
    expect(text.indexOf('Bob')).toBeLessThan(text.indexOf('Alice'));
  });

  it('handles an empty score list', () => {
    expect(formatGameScoreMessage(game, [])).toContain('ended');
  });
});

describe('SDK constants', () => {
  it('uses a 10s load timeout (Requirement 17.5)', () => {
    expect(GAME_LOAD_TIMEOUT_MS).toBe(10_000);
  });

  it('awards a positive XP amount on completion (Requirement 17.3)', () => {
    expect(GAME_COMPLETION_XP).toBeGreaterThan(0);
  });
});
