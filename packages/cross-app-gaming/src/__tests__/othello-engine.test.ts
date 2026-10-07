import { describe, it, expect } from 'vitest';
import {
  OthelloEngine,
  OthelloError,
  type OthelloGameState,
} from '../services/othello-engine.service.js';

const engine = new OthelloEngine();

function sortCoords(coords: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  return coords
    .map(([r, c]) => [r, c] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

describe('createGame', () => {
  it('requires exactly two unique players', () => {
    expect(() => engine.createGame(['a'])).toThrow(OthelloError);
    expect(() => engine.createGame(['a', 'b', 'c'])).toThrow(/exactly 2/);
    expect(() => engine.createGame(['a', 'a'])).toThrow(/unique/);
  });

  it('sets the standard four-disc opening with Black to move', () => {
    const s = engine.createGame(['a', 'b']);
    expect(s.board[3]![3]).toBe('W');
    expect(s.board[3]![4]).toBe('B');
    expect(s.board[4]![3]).toBe('B');
    expect(s.board[4]![4]).toBe('W');
    expect(s.turn).toBe('a');
    expect(s.score).toEqual({ B: 2, W: 2 });
    expect(s.status).toBe('active');
  });
});

describe('legalMoves', () => {
  it('lists the four opening moves for Black', () => {
    const s = engine.createGame(['a', 'b']);
    expect(sortCoords(engine.legalMoves(s))).toEqual([
      [2, 3],
      [3, 2],
      [4, 5],
      [5, 4],
    ]);
  });

  it('can be queried for a specific player', () => {
    const s = engine.createGame(['a', 'b']);
    expect(sortCoords(engine.legalMoves(s, 'b'))).toEqual([
      [2, 4],
      [3, 5],
      [4, 2],
      [5, 3],
    ]);
  });
});

describe('placeDisc', () => {
  it('places a disc, flips the flanked line, and advances the turn', () => {
    let s = engine.createGame(['a', 'b']);
    s = engine.placeDisc(s, 'a', 2, 3); // Black flanks W(3,3) capped by B(4,3)
    expect(s.board[2]![3]).toBe('B');
    expect(s.board[3]![3]).toBe('B'); // flipped
    expect(s.score).toEqual({ B: 4, W: 1 });
    expect(s.lastMove?.flipped).toEqual([[3, 3]]);
    expect(s.turn).toBe('b');
  });

  it('rejects a move out of turn', () => {
    const s = engine.createGame(['a', 'b']);
    expect(() => engine.placeDisc(s, 'b', 2, 4)).toThrow(/not your turn/);
  });

  it('rejects an out-of-bounds cell', () => {
    const s = engine.createGame(['a', 'b']);
    expect(() => engine.placeDisc(s, 'a', 8, 0)).toThrow(/bounds/);
    expect(() => engine.placeDisc(s, 'a', -1, 0)).toThrow(OthelloError);
  });

  it('rejects a taken cell', () => {
    const s = engine.createGame(['a', 'b']);
    expect(() => engine.placeDisc(s, 'a', 3, 3)).toThrow(/taken/);
  });

  it('rejects a move that flips nothing', () => {
    const s = engine.createGame(['a', 'b']);
    expect(() => engine.placeDisc(s, 'a', 0, 0)).toThrow(/flips nothing/);
  });

  it('does not mutate the input state', () => {
    const s = engine.createGame(['a', 'b']);
    const snapshot = JSON.stringify(s);
    engine.placeDisc(s, 'a', 2, 3);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('getPublicState returns an independent clone', () => {
    const s = engine.createGame(['a', 'b']);
    const pub = engine.getPublicState(s);
    pub.board[0]![0] = 'B';
    expect(s.board[0]![0]).toBeNull();
  });
});

describe('full self-play to completion', () => {
  it('plays greedily until the game finishes with a consistent result', () => {
    let s: OthelloGameState = engine.createGame(['a', 'b']);
    let guard = 0;
    while (s.status === 'active' && guard < 200) {
      guard += 1;
      const moves = engine.legalMoves(s);
      // The engine only hands the turn to a player who has a legal move.
      expect(moves.length).toBeGreaterThan(0);
      const [r, c] = moves[0]!;
      s = engine.placeDisc(s, s.turn, r, c);
    }
    expect(s.status).toBe('finished');
    // Discs never exceed the 64-cell board and the scoreboard is consistent.
    const total = s.score.B + s.score.W;
    expect(total).toBeGreaterThanOrEqual(4);
    expect(total).toBeLessThanOrEqual(64);
    if (s.isDraw) {
      expect(s.score.B).toBe(s.score.W);
      expect(s.winner).toBeNull();
    } else {
      expect(s.winner === 'a' || s.winner === 'b').toBe(true);
      const leader = s.score.B > s.score.W ? 'a' : 'b';
      expect(s.winner).toBe(leader);
    }
  });
});
