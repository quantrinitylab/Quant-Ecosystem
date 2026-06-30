import { describe, it, expect } from 'vitest';
import {
  ConnectFourEngine,
  ConnectFourError,
  type ConnectFourGameState,
} from '../services/connect-four-engine.service.js';

const engine = new ConnectFourEngine();

/** Apply a sequence of [playerId, column] drops and return the final state. */
function play(
  start: ConnectFourGameState,
  moves: ReadonlyArray<readonly [string, number]>,
): ConnectFourGameState {
  return moves.reduce((s, [pid, col]) => engine.dropDisc(s, pid, col), start);
}

describe('createGame', () => {
  it('requires exactly two unique players', () => {
    expect(() => engine.createGame(['a'])).toThrow(ConnectFourError);
    expect(() => engine.createGame(['a', 'b', 'c'])).toThrow(/exactly 2/);
    expect(() => engine.createGame(['a', 'a'])).toThrow(/unique/);
  });

  it('starts an empty 7x6 board with player 0 (R) to move', () => {
    const s = engine.createGame(['a', 'b']);
    expect(s.board).toHaveLength(6);
    expect(s.board[0]).toHaveLength(7);
    expect(s.board.flat().every((c) => c === null)).toBe(true);
    expect(s.turn).toBe('a');
    expect(s.status).toBe('active');
    expect(s.connect).toBe(4);
    expect(s.winner).toBeNull();
  });

  it('rejects out-of-range dimensions and connect lengths', () => {
    expect(() => engine.createGame(['a', 'b'], { columns: 2 })).toThrow(ConnectFourError);
    expect(() => engine.createGame(['a', 'b'], { rows: 99 })).toThrow(ConnectFourError);
    expect(() => engine.createGame(['a', 'b'], { connect: 2 })).toThrow(/connect length/);
    expect(() => engine.createGame(['a', 'b'], { columns: 4, rows: 4, connect: 5 })).toThrow(
      /connect length/,
    );
  });

  it('honors custom board dimensions', () => {
    const s = engine.createGame(['a', 'b'], { columns: 5, rows: 4, connect: 4 });
    expect(s.board).toHaveLength(4);
    expect(s.board[0]).toHaveLength(5);
    expect(s.connect).toBe(4);
  });
});

describe('dropDisc — placement and turns', () => {
  it('settles a disc on the lowest empty row and stacks upward', () => {
    let s = engine.createGame(['a', 'b']);
    s = engine.dropDisc(s, 'a', 3);
    expect(s.board[0]![3]).toBe('R');
    expect(s.lastMove).toMatchObject({ playerId: 'a', disc: 'R', column: 3, row: 0 });
    s = engine.dropDisc(s, 'b', 3);
    expect(s.board[1]![3]).toBe('Y');
    expect(s.board[0]![3]).toBe('R');
  });

  it('alternates turns', () => {
    let s = engine.createGame(['a', 'b']);
    expect(s.turn).toBe('a');
    s = engine.dropDisc(s, 'a', 0);
    expect(s.turn).toBe('b');
    s = engine.dropDisc(s, 'b', 1);
    expect(s.turn).toBe('a');
  });

  it('rejects a move out of turn', () => {
    const s = engine.createGame(['a', 'b']);
    expect(() => engine.dropDisc(s, 'b', 0)).toThrow(/not your turn/);
  });

  it('rejects an invalid column', () => {
    const s = engine.createGame(['a', 'b']);
    expect(() => engine.dropDisc(s, 'a', 7)).toThrow(/column must be/);
    expect(() => engine.dropDisc(s, 'a', -1)).toThrow(ConnectFourError);
    expect(() => engine.dropDisc(s, 'a', 1.5)).toThrow(ConnectFourError);
  });

  it('rejects dropping into a full column', () => {
    let s = engine.createGame(['a', 'b']);
    // Fill column 0 (6 cells) alternating without a 4-in-a-row vertical (would
    // need same disc; alternating avoids that).
    s = play(s, [
      ['a', 0],
      ['b', 0],
      ['a', 0],
      ['b', 0],
      ['a', 0],
      ['b', 0],
    ]);
    expect(() => engine.dropDisc(s, 'a', 0)).toThrow(/full/);
  });

  it('does not mutate the input state', () => {
    const s = engine.createGame(['a', 'b']);
    const snapshot = JSON.stringify(s);
    engine.dropDisc(s, 'a', 3);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('win detection', () => {
  it('detects a horizontal win', () => {
    let s = engine.createGame(['a', 'b']);
    s = play(s, [
      ['a', 0],
      ['b', 6],
      ['a', 1],
      ['b', 6],
      ['a', 2],
      ['b', 6],
      ['a', 3], // a fills row0 cols 0-3
    ]);
    expect(s.status).toBe('finished');
    expect(s.winner).toBe('a');
    expect(s.winningLine).toHaveLength(4);
  });

  it('detects a vertical win', () => {
    let s = engine.createGame(['a', 'b']);
    s = play(s, [
      ['a', 0],
      ['b', 1],
      ['a', 0],
      ['b', 1],
      ['a', 0],
      ['b', 1],
      ['a', 0], // a stacks col0 rows 0-3
    ]);
    expect(s.status).toBe('finished');
    expect(s.winner).toBe('a');
    expect(s.winningLine).toHaveLength(4);
  });

  it('detects a diagonal (up-right) win', () => {
    let s = engine.createGame(['a', 'b']);
    s = play(s, [
      ['a', 0], // R(0,0)
      ['b', 3], // Y(0,3)
      ['a', 1], // R(0,1)
      ['b', 3], // Y(1,3)
      ['a', 1], // R(1,1)
      ['b', 2], // Y(0,2)
      ['a', 2], // R(1,2)
      ['b', 3], // Y(2,3)
      ['a', 2], // R(2,2)
      ['b', 0], // Y(1,0)
      ['a', 3], // R(3,3) -> diagonal (0,0)(1,1)(2,2)(3,3)
    ]);
    expect(s.status).toBe('finished');
    expect(s.winner).toBe('a');
    expect(s.winningLine).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('detects a diagonal (up-left) win', () => {
    let s = engine.createGame(['a', 'b']);
    s = play(s, [
      ['a', 6], // R(0,6)
      ['b', 3], // Y(0,3)
      ['a', 5], // R(0,5)
      ['b', 3], // Y(1,3)
      ['a', 5], // R(1,5)
      ['b', 4], // Y(0,4)
      ['a', 4], // R(1,4)
      ['b', 3], // Y(2,3)
      ['a', 4], // R(2,4)
      ['b', 6], // Y(1,6)
      ['a', 3], // R(3,3) -> diagonal (0,6)(1,5)(2,4)(3,3)
    ]);
    expect(s.status).toBe('finished');
    expect(s.winner).toBe('a');
    expect(s.winningLine).toHaveLength(4);
  });

  it('blocks any move after the game is finished', () => {
    let s = engine.createGame(['a', 'b']);
    s = play(s, [
      ['a', 0],
      ['b', 1],
      ['a', 0],
      ['b', 1],
      ['a', 0],
      ['b', 1],
      ['a', 0],
    ]);
    expect(s.status).toBe('finished');
    expect(() => engine.dropDisc(s, 'b', 2)).toThrow(/over/);
  });
});

describe('draw and legal moves', () => {
  it('declares a draw when the board fills with no winner', () => {
    // 4x4 board, connect 4. Fill with a stagger that yields no 4-in-a-row.
    // Column pattern per pair of columns avoids verticals; row offset avoids
    // horizontals/diagonals.
    let s = engine.createGame(['a', 'b'], { columns: 4, rows: 4, connect: 4 });
    // Sequence crafted to fill all 16 cells without a line of 4.
    const moves: Array<[string, number]> = [
      ['a', 0],
      ['b', 1],
      ['a', 0],
      ['b', 1],
      ['a', 1],
      ['b', 0],
      ['a', 1],
      ['b', 0],
      ['a', 2],
      ['b', 3],
      ['a', 2],
      ['b', 3],
      ['a', 3],
      ['b', 2],
      ['a', 3],
      ['b', 2],
    ];
    s = play(s, moves);
    expect(s.status).toBe('finished');
    expect(s.isDraw).toBe(true);
    expect(s.winner).toBeNull();
    expect(engine.legalMoves(s)).toEqual([]);
  });

  it('legalMoves lists non-full columns and is empty once finished', () => {
    let s = engine.createGame(['a', 'b']);
    expect(engine.legalMoves(s)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    s = play(s, [
      ['a', 0],
      ['b', 0],
      ['a', 0],
      ['b', 0],
      ['a', 0],
      ['b', 0],
    ]);
    // Column 0 is now full.
    expect(engine.legalMoves(s)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('getPublicState returns an independent clone', () => {
    const s = engine.createGame(['a', 'b']);
    const pub = engine.getPublicState(s);
    pub.board[0]![0] = 'R';
    expect(s.board[0]![0]).toBeNull();
  });
});
