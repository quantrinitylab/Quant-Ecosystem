import { describe, it, expect } from 'vitest';
import {
  UnoEngine,
  UnoError,
  buildDeck,
  isPlayable,
  isWildValue,
  nextTurn,
  type ShuffleFn,
  type UnoCard,
  type UnoColor,
  type UnoGameState,
  type UnoValue,
} from '../services/uno-engine.service.js';

// A deterministic "shuffle" that preserves order, so an ordered deck stays
// ordered and every outcome can be asserted exactly.
const identityShuffle: ShuffleFn = (cards) => [...cards];

function card(id: string, color: UnoColor | null, value: UnoValue): UnoCard {
  return { id, color, value };
}

function countCards(state: UnoGameState): number {
  return (
    state.players.reduce((sum, p) => sum + p.hand.length, 0) +
    state.drawPile.length +
    state.discardPile.length
  );
}

// Build a fully-specified active game state for effect tests.
function makeState(overrides: Partial<UnoGameState>): UnoGameState {
  return {
    players: [],
    drawPile: [],
    discardPile: [card('top', 'red', '5')],
    currentColor: 'red',
    currentValue: '5',
    turn: 'A',
    direction: 1,
    status: 'active',
    winner: null,
    pendingDraw: 0,
    lastAction: null,
    ...overrides,
  };
}

describe('buildDeck', () => {
  const deck = buildDeck();

  it('contains exactly 108 cards', () => {
    expect(deck).toHaveLength(108);
  });

  it('has unique card ids', () => {
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
  });

  it('has the correct composition per color', () => {
    for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
      const inColor = deck.filter((c) => c.color === color);
      expect(inColor).toHaveLength(25);
      expect(inColor.filter((c) => c.value === '0')).toHaveLength(1);
      for (let n = 1; n <= 9; n++) {
        expect(inColor.filter((c) => c.value === String(n))).toHaveLength(2);
      }
      expect(inColor.filter((c) => c.value === 'skip')).toHaveLength(2);
      expect(inColor.filter((c) => c.value === 'reverse')).toHaveLength(2);
      expect(inColor.filter((c) => c.value === 'draw_two')).toHaveLength(2);
    }
  });

  it('has 4 Wild and 4 Wild Draw Four (colorless)', () => {
    const wild = deck.filter((c) => c.value === 'wild');
    const wd4 = deck.filter((c) => c.value === 'wild_draw_four');
    expect(wild).toHaveLength(4);
    expect(wd4).toHaveLength(4);
    expect([...wild, ...wd4].every((c) => c.color === null)).toBe(true);
  });
});

describe('isPlayable / isWildValue', () => {
  it('matches by color', () => {
    expect(isPlayable(card('x', 'red', '9'), 'red', '3')).toBe(true);
  });
  it('matches by value across colors', () => {
    expect(isPlayable(card('x', 'blue', '3'), 'red', '3')).toBe(true);
  });
  it('rejects color+value mismatch', () => {
    expect(isPlayable(card('x', 'blue', '9'), 'red', '3')).toBe(false);
  });
  it('always allows wild cards', () => {
    expect(isPlayable(card('x', null, 'wild'), 'red', '3')).toBe(true);
    expect(isPlayable(card('x', null, 'wild_draw_four'), 'red', '3')).toBe(true);
  });
  it('isWildValue identifies wild values', () => {
    expect(isWildValue('wild')).toBe(true);
    expect(isWildValue('wild_draw_four')).toBe(true);
    expect(isWildValue('5')).toBe(false);
    expect(isWildValue('skip')).toBe(false);
  });
});

describe('nextTurn', () => {
  const state = makeState({
    players: [
      { id: 'A', hand: [] },
      { id: 'B', hand: [] },
      { id: 'C', hand: [] },
    ],
    turn: 'A',
  });

  it('advances forward by one', () => {
    expect(nextTurn(state)).toBe('B');
  });
  it('honors skip (advances two)', () => {
    expect(nextTurn(state, { skip: true })).toBe('C');
  });
  it('honors direction', () => {
    expect(nextTurn({ ...state, direction: -1 })).toBe('C');
  });
});

describe('UnoEngine.createGame', () => {
  const engine = new UnoEngine({ shuffle: identityShuffle });

  it('deals 7 cards to each player and a valid non-wild starting discard', () => {
    const state = engine.createGame(['A', 'B', 'C']);
    expect(state.players).toHaveLength(3);
    for (const p of state.players) expect(p.hand).toHaveLength(7);

    expect(state.discardPile).toHaveLength(1);
    const top = state.discardPile[0]!;
    expect(isWildValue(top.value)).toBe(false);
    expect(top.color).not.toBeNull();
    expect(state.currentColor).toBe(top.color);
    expect(state.currentValue).toBe(top.value);
    expect(state.turn).toBe('A');
    expect(state.direction).toBe(1);
    expect(state.status).toBe('active');
    expect(state.winner).toBeNull();
  });

  it('conserves all 108 cards across hands + piles', () => {
    const state = engine.createGame(['A', 'B', 'C', 'D']);
    expect(countCards(state)).toBe(108);
  });

  it('respects a custom hand size', () => {
    const state = engine.createGame(['A', 'B'], { handSize: 5 });
    for (const p of state.players) expect(p.hand).toHaveLength(5);
  });

  it('rejects fewer than 2 players', () => {
    expect(() => engine.createGame(['A'])).toThrow(UnoError);
    expect(() => engine.createGame(['A'])).toThrow(/between 2 and 10/);
  });

  it('rejects more than 10 players', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `p${i}`);
    expect(() => engine.createGame(ids)).toThrowError(
      expect.objectContaining({ code: 'INVALID_PLAYER_COUNT' }),
    );
  });

  it('rejects duplicate player ids', () => {
    expect(() => engine.createGame(['A', 'A'])).toThrowError(
      expect.objectContaining({ code: 'INVALID_PLAYER_COUNT' }),
    );
  });
});

describe('UnoEngine.playCard - validation', () => {
  const engine = new UnoEngine({ shuffle: identityShuffle });

  function baseState(): UnoGameState {
    return makeState({
      players: [
        { id: 'A', hand: [card('A-red-5', 'red', '5'), card('A-blue-9', 'blue', '9')] },
        { id: 'B', hand: [card('B-red-1', 'red', '1')] },
      ],
      turn: 'A',
      currentColor: 'red',
      currentValue: '3',
    });
  }

  it('rejects when it is not the player turn', () => {
    expect(() => engine.playCard(baseState(), 'B', 'B-red-1')).toThrowError(
      expect.objectContaining({ code: 'NOT_YOUR_TURN' }),
    );
  });

  it('rejects a card not in hand', () => {
    expect(() => engine.playCard(baseState(), 'A', 'does-not-exist')).toThrowError(
      expect.objectContaining({ code: 'CARD_NOT_IN_HAND' }),
    );
  });

  it('rejects an illegal play (color and value mismatch)', () => {
    expect(() => engine.playCard(baseState(), 'A', 'A-blue-9')).toThrowError(
      expect.objectContaining({ code: 'ILLEGAL_PLAY' }),
    );
  });

  it('rejects a finished game', () => {
    const finished = makeState({ ...baseState(), status: 'finished', winner: 'A' });
    expect(() => engine.playCard(finished, 'A', 'A-red-5')).toThrowError(
      expect.objectContaining({ code: 'GAME_OVER' }),
    );
  });

  it('does not mutate the input state', () => {
    const state = baseState();
    const snapshot = JSON.stringify(state);
    engine.playCard(state, 'A', 'A-red-5');
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('UnoEngine.playCard - effects', () => {
  const engine = new UnoEngine({ shuffle: identityShuffle });

  function threePlayers(handA: UnoCard[]): UnoGameState {
    return makeState({
      players: [
        // Filler keeps A's hand non-empty so playing the test card doesn't win.
        { id: 'A', hand: [...handA, card('A-filler', 'blue', '0')] },
        { id: 'B', hand: [card('B1', 'green', '2'), card('B2', 'green', '4')] },
        { id: 'C', hand: [card('C1', 'green', '6')] },
      ],
      drawPile: [
        card('d1', 'yellow', '1'),
        card('d2', 'yellow', '2'),
        card('d3', 'yellow', '3'),
        card('d4', 'yellow', '4'),
      ],
      turn: 'A',
      currentColor: 'red',
      currentValue: '5',
    });
  }

  it('number card sets color/value and passes to the next player', () => {
    const next = engine.playCard(threePlayers([card('A1', 'red', '7')]), 'A', 'A1');
    expect(next.currentColor).toBe('red');
    expect(next.currentValue).toBe('7');
    expect(next.turn).toBe('B');
    expect(next.discardPile.at(-1)?.id).toBe('A1');
  });

  it('Skip jumps the next player', () => {
    const next = engine.playCard(threePlayers([card('A1', 'red', 'skip')]), 'A', 'A1');
    expect(next.turn).toBe('C');
  });

  it('Reverse flips direction (3 players)', () => {
    const next = engine.playCard(threePlayers([card('A1', 'red', 'reverse')]), 'A', 'A1');
    expect(next.direction).toBe(-1);
    expect(next.turn).toBe('C');
  });

  it('Draw Two forces the next player to draw 2 and skips them', () => {
    const next = engine.playCard(threePlayers([card('A1', 'red', 'draw_two')]), 'A', 'A1');
    const b = next.players.find((p) => p.id === 'B')!;
    expect(b.hand).toHaveLength(4); // started with 2, drew 2
    expect(b.hand.map((c) => c.id)).toContain('d1');
    expect(b.hand.map((c) => c.id)).toContain('d2');
    expect(next.turn).toBe('C');
    expect(next.drawPile.map((c) => c.id)).toEqual(['d3', 'd4']);
  });

  it('Wild requires a chosen color', () => {
    expect(() => engine.playCard(threePlayers([card('A1', null, 'wild')]), 'A', 'A1')).toThrowError(
      expect.objectContaining({ code: 'COLOR_REQUIRED' }),
    );
  });

  it('Wild sets the chosen color and advances normally', () => {
    const next = engine.playCard(threePlayers([card('A1', null, 'wild')]), 'A', 'A1', 'blue');
    expect(next.currentColor).toBe('blue');
    expect(next.currentValue).toBe('wild');
    expect(next.turn).toBe('B');
    expect(next.lastAction?.chosenColor).toBe('blue');
  });

  it('Wild Draw Four sets color, forces 4 draws and skips the next player', () => {
    const next = engine.playCard(
      threePlayers([card('A1', null, 'wild_draw_four')]),
      'A',
      'A1',
      'yellow',
    );
    expect(next.currentColor).toBe('yellow');
    const b = next.players.find((p) => p.id === 'B')!;
    expect(b.hand).toHaveLength(6); // started with 2, drew 4
    expect(next.turn).toBe('C');
  });
});

describe('UnoEngine.playCard - 2-player reverse acts as skip', () => {
  const engine = new UnoEngine({ shuffle: identityShuffle });

  it('returns the turn to the player who played reverse', () => {
    const state = makeState({
      players: [
        { id: 'A', hand: [card('A1', 'red', 'reverse'), card('A2', 'red', '9')] },
        { id: 'B', hand: [card('B1', 'green', '2')] },
      ],
      turn: 'A',
      currentColor: 'red',
      currentValue: '5',
    });
    const next = engine.playCard(state, 'A', 'A1');
    expect(next.direction).toBe(-1);
    expect(next.turn).toBe('A');
  });
});

describe('UnoEngine.playCard - win detection', () => {
  const engine = new UnoEngine({ shuffle: identityShuffle });

  it('finishes the game when a hand empties', () => {
    const state = makeState({
      players: [
        { id: 'A', hand: [card('A1', 'red', '9')] },
        { id: 'B', hand: [card('B1', 'green', '2')] },
      ],
      turn: 'A',
      currentColor: 'red',
      currentValue: '5',
    });
    const next = engine.playCard(state, 'A', 'A1');
    expect(next.status).toBe('finished');
    expect(next.winner).toBe('A');
    expect(next.players.find((p) => p.id === 'A')!.hand).toHaveLength(0);
  });
});

describe('UnoEngine.drawCard', () => {
  const engine = new UnoEngine({ shuffle: identityShuffle });

  it('draws one card and ends the turn', () => {
    const state = makeState({
      players: [
        { id: 'A', hand: [card('A1', 'green', '2')] },
        { id: 'B', hand: [card('B1', 'green', '4')] },
      ],
      drawPile: [card('d1', 'yellow', '1'), card('d2', 'yellow', '2')],
      turn: 'A',
    });
    const next = engine.drawCard(state, 'A');
    const a = next.players.find((p) => p.id === 'A')!;
    expect(a.hand.map((c) => c.id)).toContain('d1');
    expect(a.hand).toHaveLength(2);
    expect(next.turn).toBe('B');
    expect(next.drawPile.map((c) => c.id)).toEqual(['d2']);
  });

  it('reshuffles the discard pile (minus top) when the draw pile is empty', () => {
    const state = makeState({
      players: [
        { id: 'A', hand: [] },
        { id: 'B', hand: [] },
      ],
      drawPile: [],
      discardPile: [card('old1', 'red', '1'), card('old2', 'red', '2'), card('top', 'red', '5')],
      turn: 'A',
    });
    const next = engine.drawCard(state, 'A');
    const a = next.players.find((p) => p.id === 'A')!;
    // identity shuffle: rest = [old1, old2] -> draw old1, old2 remains
    expect(a.hand.map((c) => c.id)).toEqual(['old1']);
    expect(next.drawPile.map((c) => c.id)).toEqual(['old2']);
    expect(next.discardPile.map((c) => c.id)).toEqual(['top']);
    expect(next.turn).toBe('B');
  });

  it('rejects drawing out of turn', () => {
    const state = makeState({
      players: [
        { id: 'A', hand: [] },
        { id: 'B', hand: [] },
      ],
      drawPile: [card('d1', 'yellow', '1')],
      turn: 'A',
    });
    expect(() => engine.drawCard(state, 'B')).toThrowError(
      expect.objectContaining({ code: 'NOT_YOUR_TURN' }),
    );
  });

  it('rejects drawing in a finished game', () => {
    const state = makeState({
      players: [
        { id: 'A', hand: [] },
        { id: 'B', hand: [] },
      ],
      status: 'finished',
      winner: 'B',
      turn: 'A',
    });
    expect(() => engine.drawCard(state, 'A')).toThrowError(
      expect.objectContaining({ code: 'GAME_OVER' }),
    );
  });
});

describe('UnoEngine.publicState', () => {
  const engine = new UnoEngine({ shuffle: identityShuffle });

  it('collapses hands to counts and exposes the top card', () => {
    const state = engine.createGame(['A', 'B']);
    const view = engine.publicState(state);
    expect(view.players).toEqual([
      { id: 'A', handCount: 7 },
      { id: 'B', handCount: 7 },
    ]);
    expect(view.topCard?.id).toBe(state.discardPile[0]!.id);
    expect(view.drawPileCount).toBe(state.drawPile.length);
  });
});
