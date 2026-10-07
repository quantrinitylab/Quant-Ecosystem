import { describe, it, expect } from 'vitest';
import { LudoEngine, LudoError, type LudoGameState } from '../services/ludo-engine.service.js';

/** Build an engine whose dice returns the given values in order. */
function seqEngine(rolls: number[]): LudoEngine {
  const queue = [...rolls];
  return new LudoEngine({
    rollDice: () => {
      const v = queue.shift();
      if (v === undefined) throw new Error('dice sequence exhausted');
      return v;
    },
  });
}

function setProgress(state: LudoGameState, tokenId: string, progress: number | null): void {
  const tok = state.tokens.find((t) => t.id === tokenId);
  if (!tok) throw new Error(`test token not found: ${tokenId}`);
  tok.progress = progress;
}

const ENGINE = new LudoEngine();

describe('LudoEngine.createGame', () => {
  it('creates an initial state with all tokens in the yard', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    expect(state.players).toEqual([
      { id: 'p1', color: 'red' },
      { id: 'p2', color: 'green' },
    ]);
    expect(state.tokens).toHaveLength(8);
    expect(state.tokens.every((t) => t.progress === null)).toBe(true);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.status).toBe('active');
    expect(state.winner).toBeNull();
    expect(state.lastRoll).toBeNull();
  });

  it('assigns colours by seat order for 4 players', () => {
    const state = ENGINE.createGame(['a', 'b', 'c', 'd']);
    expect(state.players.map((p) => p.color)).toEqual(['red', 'green', 'yellow', 'blue']);
    expect(state.tokens).toHaveLength(16);
  });

  it('can start on a specific player', () => {
    const state = ENGINE.createGame(['p1', 'p2', 'p3'], { startingPlayerId: 'p3' });
    expect(state.currentPlayerIndex).toBe(2);
  });

  describe('player-count validation', () => {
    it('rejects fewer than 2 players', () => {
      expect(() => ENGINE.createGame(['solo'])).toThrowError(LudoError);
      expect(() => ENGINE.createGame(['solo'])).toThrowError(
        expect.objectContaining({ code: 'INVALID_PLAYER_COUNT' }),
      );
    });

    it('rejects more than 4 players', () => {
      expect(() => ENGINE.createGame(['a', 'b', 'c', 'd', 'e'])).toThrowError(
        expect.objectContaining({ code: 'INVALID_PLAYER_COUNT' }),
      );
    });

    it('rejects duplicate player ids', () => {
      expect(() => ENGINE.createGame(['p1', 'p1'])).toThrowError(
        expect.objectContaining({ code: 'DUPLICATE_PLAYER' }),
      );
    });

    it('rejects empty/blank player ids', () => {
      expect(() => ENGINE.createGame(['p1', '   '])).toThrowError(
        expect.objectContaining({ code: 'INVALID_PLAYER' }),
      );
    });

    it('rejects an unknown startingPlayerId', () => {
      expect(() => ENGINE.createGame(['p1', 'p2'], { startingPlayerId: 'ghost' })).toThrowError(
        expect.objectContaining({ code: 'INVALID_PLAYER' }),
      );
    });
  });
});

describe('LudoEngine.rollDice — releasing from the yard', () => {
  it('only a 6 releases a token from the yard', () => {
    const engine = seqEngine([3]);
    const state = engine.createGame(['p1', 'p2']);
    const res = engine.rollDice(state, 'p1');

    expect(res.dice).toBe(3);
    expect(res.legalMoves).toEqual([]); // nothing can move out of the yard
    // turn passes to p2 because there were no legal moves
    expect(res.state.currentPlayerIndex).toBe(1);
    expect(res.state.lastRoll).toBeNull();
  });

  it('a 6 yields a release move for every yard token', () => {
    const engine = seqEngine([6]);
    const state = engine.createGame(['p1', 'p2']);
    const res = engine.rollDice(state, 'p1');

    expect(res.dice).toBe(6);
    expect(res.legalMoves).toHaveLength(4);
    expect(res.legalMoves.every((m) => m.kind === 'release' && m.from === null && m.to === 0)).toBe(
      true,
    );
    // roll is stored, still p1's turn awaiting a move
    expect(res.state.lastRoll).toBe(6);
    expect(res.state.currentPlayerIndex).toBe(0);
  });
});

describe('LudoEngine — turns & sixes', () => {
  it('rolling a 6 grants another turn (same player rolls again)', () => {
    const engine = seqEngine([6]);
    let state = engine.createGame(['p1', 'p2']);
    const rolled = engine.rollDice(state, 'p1');
    state = engine.moveToken(rolled.state, 'p1', 'p1-t0');

    expect(state.tokens.find((t) => t.id === 'p1-t0')!.progress).toBe(0);
    // extra turn: still p1, must roll again
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.lastRoll).toBeNull();
  });

  it('three consecutive 6s forfeit the turn', () => {
    const engine = seqEngine([6, 6, 6]);
    let state = engine.createGame(['p1', 'p2']);

    // first six: release t0
    let r = engine.rollDice(state, 'p1');
    expect(r.state.consecutiveSixes).toBe(1);
    state = engine.moveToken(r.state, 'p1', 'p1-t0');

    // second six: advance t0
    r = engine.rollDice(state, 'p1');
    expect(r.state.consecutiveSixes).toBe(2);
    expect(r.legalMoves.length).toBeGreaterThan(0);
    state = engine.moveToken(r.state, 'p1', 'p1-t0');

    // third six: forfeit, no move, turn passes
    r = engine.rollDice(state, 'p1');
    expect(r.dice).toBe(6);
    expect(r.legalMoves).toEqual([]);
    expect(r.state.currentPlayerIndex).toBe(1);
    expect(r.state.consecutiveSixes).toBe(0);
    expect(r.state.lastRoll).toBeNull();
  });

  it('normal movement advances a token and passes the turn on a non-6', () => {
    const engine = seqEngine([6, 4]);
    let state = engine.createGame(['p1', 'p2']);

    // get t0 onto the track via a six (extra turn)
    let r = engine.rollDice(state, 'p1');
    state = engine.moveToken(r.state, 'p1', 'p1-t0');

    // now roll a 4 and advance
    r = engine.rollDice(state, 'p1');
    expect(r.legalMoves.find((m) => m.tokenId === 'p1-t0')).toMatchObject({ from: 0, to: 4 });
    state = engine.moveToken(r.state, 'p1', 'p1-t0');

    expect(state.tokens.find((t) => t.id === 'p1-t0')!.progress).toBe(4);
    expect(state.currentPlayerIndex).toBe(1); // turn advanced on a non-6
    expect(state.lastRoll).toBeNull();
  });
});

describe('LudoEngine — capture & safe squares', () => {
  it('capture sends a lone opponent token back to its yard', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    // p1 red token at progress 16 (abs 16); p2 green token at progress 7 (abs 20)
    setProgress(state, 'p1-t0', 16);
    setProgress(state, 'p2-t0', 7);
    state.lastRoll = 4; // 16 + 4 = 20, a non-safe square

    const next = ENGINE.moveToken(state, 'p1', 'p1-t0');
    expect(next.tokens.find((t) => t.id === 'p1-t0')!.progress).toBe(20);
    expect(next.tokens.find((t) => t.id === 'p2-t0')!.progress).toBeNull(); // captured
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('does NOT capture on a safe square', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    // square 21 is a safe star square. p1 lands on 21; p2 sits on 21 (progress 8).
    setProgress(state, 'p1-t0', 17);
    setProgress(state, 'p2-t0', 8);
    state.lastRoll = 4; // 17 + 4 = 21 (safe)

    const next = ENGINE.moveToken(state, 'p1', 'p1-t0');
    expect(next.tokens.find((t) => t.id === 'p1-t0')!.progress).toBe(21);
    expect(next.tokens.find((t) => t.id === 'p2-t0')!.progress).toBe(8); // NOT captured
  });

  it('does NOT capture a 2+ token block (stacking is protected)', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    setProgress(state, 'p1-t0', 16);
    setProgress(state, 'p2-t0', 7); // abs 20
    setProgress(state, 'p2-t1', 7); // abs 20 -> a block of two
    state.lastRoll = 4; // p1 lands on abs 20

    const next = ENGINE.moveToken(state, 'p1', 'p1-t0');
    expect(next.tokens.find((t) => t.id === 'p2-t0')!.progress).toBe(7);
    expect(next.tokens.find((t) => t.id === 'p2-t1')!.progress).toBe(7);
  });
});

describe('LudoEngine — home column & winning', () => {
  it('requires an exact roll to finish (overshoot is illegal)', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    setProgress(state, 'p1-t0', 54); // needs exactly 2 to reach 56
    state.lastRoll = 3; // would overshoot to 57

    expect(() => ENGINE.moveToken(state, 'p1', 'p1-t0')).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_MOVE' }),
    );
  });

  it('finishes a token on an exact roll', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    setProgress(state, 'p1-t0', 54);
    state.lastRoll = 2;

    const next = ENGINE.moveToken(state, 'p1', 'p1-t0');
    expect(next.tokens.find((t) => t.id === 'p1-t0')!.progress).toBe(56);
    expect(next.status).toBe('active'); // other tokens not home yet
  });

  it('declares a winner when all 4 tokens reach home', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    setProgress(state, 'p1-t0', 56);
    setProgress(state, 'p1-t1', 56);
    setProgress(state, 'p1-t2', 56);
    setProgress(state, 'p1-t3', 54);
    state.lastRoll = 2;

    const next = ENGINE.moveToken(state, 'p1', 'p1-t3');
    expect(next.status).toBe('finished');
    expect(next.winner).toBe('p1');
    expect(next.lastRoll).toBeNull();
  });

  it('rejects any action after the game is over', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    setProgress(state, 'p1-t0', 56);
    setProgress(state, 'p1-t1', 56);
    setProgress(state, 'p1-t2', 56);
    setProgress(state, 'p1-t3', 54);
    state.lastRoll = 2;
    const finished = ENGINE.moveToken(state, 'p1', 'p1-t3');

    expect(() => ENGINE.rollDice(finished, 'p2')).toThrowError(
      expect.objectContaining({ code: 'GAME_OVER' }),
    );
    expect(() => ENGINE.moveToken(finished, 'p2', 'p2-t0')).toThrowError(
      expect.objectContaining({ code: 'GAME_OVER' }),
    );
  });
});

describe('LudoEngine — error handling', () => {
  it('rejects a roll out of turn', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    expect(() => ENGINE.rollDice(state, 'p2')).toThrowError(
      expect.objectContaining({ code: 'NOT_YOUR_TURN' }),
    );
  });

  it('rejects a move out of turn', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    state.lastRoll = 6;
    expect(() => ENGINE.moveToken(state, 'p2', 'p2-t0')).toThrowError(
      expect.objectContaining({ code: 'NOT_YOUR_TURN' }),
    );
  });

  it('rejects moving before rolling', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    expect(() => ENGINE.moveToken(state, 'p1', 'p1-t0')).toThrowError(
      expect.objectContaining({ code: 'NO_ROLL' }),
    );
  });

  it('rejects rolling twice without moving', () => {
    const engine = seqEngine([6]);
    const state = engine.createGame(['p1', 'p2']);
    const res = engine.rollDice(state, 'p1'); // produces legal moves, roll pending
    expect(() => engine.rollDice(res.state, 'p1')).toThrowError(
      expect.objectContaining({ code: 'ALREADY_ROLLED' }),
    );
  });

  it('rejects an unknown / unowned token', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    state.lastRoll = 6;
    expect(() => ENGINE.moveToken(state, 'p1', 'nope')).toThrowError(
      expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }),
    );
    expect(() => ENGINE.moveToken(state, 'p1', 'p2-t0')).toThrowError(
      expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }),
    );
  });

  it('rejects an illegal move (token has no legal move for the roll)', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    state.lastRoll = 3; // token still in yard, only a 6 releases it
    expect(() => ENGINE.moveToken(state, 'p1', 'p1-t0')).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_MOVE' }),
    );
  });

  it('rejects an out-of-range injected dice value', () => {
    const engine = seqEngine([9]);
    const state = engine.createGame(['p1', 'p2']);
    expect(() => engine.rollDice(state, 'p1')).toThrowError(
      expect.objectContaining({ code: 'INVALID_DICE' }),
    );
  });
});

describe('LudoEngine — immutability', () => {
  it('rollDice does not mutate the input state', () => {
    const engine = seqEngine([6]);
    const state = engine.createGame(['p1', 'p2']);
    const snapshot = JSON.stringify(state);
    engine.rollDice(state, 'p1');
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('moveToken does not mutate the input state', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    setProgress(state, 'p1-t0', 16);
    setProgress(state, 'p2-t0', 7);
    state.lastRoll = 4;
    const snapshot = JSON.stringify(state);

    ENGINE.moveToken(state, 'p1', 'p1-t0');
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('LudoEngine.publicState', () => {
  it('produces a serializable derived view', () => {
    const state = ENGINE.createGame(['p1', 'p2']);
    setProgress(state, 'p1-t0', 0); // on its start square (abs 0)
    setProgress(state, 'p2-t0', 5); // abs (13 + 5) % 52 = 18
    setProgress(state, 'p1-t1', 54); // home column
    setProgress(state, 'p1-t2', 56); // finished

    const view = ENGINE.publicState(state);
    expect(view.currentPlayerId).toBe('p1');
    expect(view.status).toBe('active');

    const byId = Object.fromEntries(view.tokens.map((t) => [t.id, t]));
    expect(byId['p1-t0']).toMatchObject({ location: 'track', square: 0 });
    expect(byId['p2-t0']).toMatchObject({ location: 'track', square: 18 });
    expect(byId['p1-t1']).toMatchObject({ location: 'home', square: null });
    expect(byId['p1-t2']).toMatchObject({ location: 'finished', square: null });
    expect(byId['p1-t3']).toMatchObject({ location: 'yard', square: null });

    // view is JSON-serializable
    expect(() => JSON.stringify(view)).not.toThrow();
  });
});
