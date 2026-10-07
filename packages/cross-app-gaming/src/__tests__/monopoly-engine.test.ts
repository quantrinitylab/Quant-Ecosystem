import { describe, it, expect } from 'vitest';
import {
  MonopolyEngine,
  MonopolyError,
  BOARD,
  CHANCE_CARDS,
  COMMUNITY_CHEST_CARDS,
  computeRent,
  isOwnable,
  type RollDieFn,
  type DrawCardFn,
  type MonopolyGameState,
} from '../services/monopoly-engine.service.js';

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

/** A die that yields the given values in order (cycling if exhausted). */
function dieSequence(values: number[]): RollDieFn {
  let i = 0;
  return () => {
    const v = values[i % values.length]!;
    i += 1;
    return v;
  };
}

/** A card draw that always returns a fixed index into the (initial) deck. */
function fixedDraw(index: number): DrawCardFn {
  return () => index;
}

function newEngine(dice: number[], drawIndex = 0): MonopolyEngine {
  return new MonopolyEngine({ rollDie: dieSequence(dice), drawCard: fixedDraw(drawIndex) });
}

function findChanceIndex(id: string): number {
  return CHANCE_CARDS.findIndex((c) => c.id === id);
}
function findCommunityIndex(id: string): number {
  return COMMUNITY_CHEST_CARDS.findIndex((c) => c.id === id);
}

function player(state: MonopolyGameState, id: string) {
  return state.players.find((p) => p.id === id)!;
}

// ---------------------------------------------------------------------------
// Board sanity
// ---------------------------------------------------------------------------

describe('Monopoly board', () => {
  it('has 40 spaces with contiguous indices', () => {
    expect(BOARD).toHaveLength(40);
    BOARD.forEach((space, i) => expect(space.index).toBe(i));
  });

  it('has 22 streets, 4 railroads, 2 utilities', () => {
    expect(BOARD.filter((s) => s.type === 'street')).toHaveLength(22);
    expect(BOARD.filter((s) => s.type === 'railroad')).toHaveLength(4);
    expect(BOARD.filter((s) => s.type === 'utility')).toHaveLength(2);
  });

  it('isOwnable distinguishes purchasable spaces', () => {
    expect(isOwnable(BOARD[1]!)).toBe(true); // Mediterranean
    expect(isOwnable(BOARD[5]!)).toBe(true); // Reading Railroad
    expect(isOwnable(BOARD[12]!)).toBe(true); // Electric Company
    expect(isOwnable(BOARD[0]!)).toBe(false); // GO
    expect(isOwnable(BOARD[4]!)).toBe(false); // Income Tax
  });
});

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------

describe('createGame', () => {
  it('rejects fewer than 2 or more than 8 players', () => {
    const engine = new MonopolyEngine();
    expect(() => engine.createGame(['a'])).toThrow(MonopolyError);
    const tooMany = Array.from({ length: 9 }, (_, i) => `p${i}`);
    expect(() => engine.createGame(tooMany)).toThrow(/between 2 and 8/);
  });

  it('rejects duplicate player ids', () => {
    const engine = new MonopolyEngine();
    expect(() => engine.createGame(['a', 'a'])).toThrow(/unique/);
  });

  it('starts every player on GO with $1500 and all properties unowned', () => {
    const engine = new MonopolyEngine();
    const state = engine.createGame(['a', 'b']);
    expect(state.players).toHaveLength(2);
    expect(state.players.every((p) => p.position === 0 && p.cash === 1500)).toBe(true);
    expect(state.turn).toBe('a');
    expect(state.phase).toBe('roll');
    expect(state.status).toBe('active');
    const owned = Object.values(state.properties).filter((p) => p.ownerId !== null);
    expect(owned).toHaveLength(0);
    expect(Object.keys(state.properties)).toHaveLength(28); // 22 + 4 + 2
  });

  it('honors a custom starting cash', () => {
    const engine = new MonopolyEngine();
    const state = engine.createGame(['a', 'b'], { startingCash: 2000 });
    expect(player(state, 'a').cash).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// rollDice / movement
// ---------------------------------------------------------------------------

describe('rollDice and movement', () => {
  it('moves the player by the dice total and lands on an unowned property', () => {
    const engine = newEngine([3, 4]); // total 7 -> index 7 is Chance... use [1,2]=3
    const e2 = newEngine([1, 2]); // total 3 -> Baltic Avenue (unowned street)
    const state = e2.createGame(['a', 'b']);
    const next = e2.rollDice(state, 'a');
    expect(player(next, 'a').position).toBe(3);
    expect(next.pendingPurchase).toBe(3);
    expect(next.phase).toBe('resolve');
    // engine variable kept to ensure both constructions are valid
    expect(engine).toBeInstanceOf(MonopolyEngine);
  });

  it('rejects a roll when it is not your turn', () => {
    const engine = newEngine([1, 2]);
    const state = engine.createGame(['a', 'b']);
    expect(() => engine.rollDice(state, 'b')).toThrow(/not your turn/);
  });

  it('does not mutate the input state', () => {
    const engine = newEngine([1, 2]);
    const state = engine.createGame(['a', 'b']);
    const snapshot = JSON.stringify(state);
    engine.rollDice(state, 'a');
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('awards $200 for passing GO', () => {
    const engine = newEngine([1, 2]); // total 3
    let state = engine.createGame(['a', 'b']);
    player(state, 'a').position = 38; // 38 + 3 = 41 % 40 = 1 (wraps past GO)
    state = engine.rollDice(state, 'a');
    expect(player(state, 'a').position).toBe(1);
    expect(player(state, 'a').cash).toBe(1500 + 200);
  });
});

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

describe('buyProperty / declinePurchase', () => {
  it('buys the landed property and deducts the price', () => {
    const engine = newEngine([1, 2]); // -> Baltic (price 60)
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    state = engine.buyProperty(state, 'a');
    expect(state.properties[3]!.ownerId).toBe('a');
    expect(player(state, 'a').cash).toBe(1500 - 60);
    expect(state.pendingPurchase).toBeNull();
    expect(state.phase).toBe('end');
  });

  it('rejects buying with insufficient funds', () => {
    const engine = newEngine([1, 2]);
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    player(state, 'a').cash = 10;
    expect(() => engine.buyProperty(state, 'a')).toThrow(/insufficient funds/i);
  });

  it('rejects buying when nothing is pending', () => {
    const engine = newEngine([1, 1]); // doubles -> lands index 2 (Community Chest)
    let state = engine.createGame(['a', 'b'], {});
    state = engine.rollDice(state, 'a');
    expect(state.pendingPurchase).toBeNull();
    expect(() => engine.buyProperty(state, 'a')).toThrow(MonopolyError);
  });

  it('declining leaves the property with the bank', () => {
    const engine = newEngine([1, 2]);
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    state = engine.declinePurchase(state, 'a');
    expect(state.properties[3]!.ownerId).toBeNull();
    expect(state.phase).toBe('end');
  });
});

// ---------------------------------------------------------------------------
// Rent
// ---------------------------------------------------------------------------

describe('rent', () => {
  it('charges base street rent to a visitor', () => {
    const engine = newEngine([1, 2, 1, 2]); // both players to Baltic (3)
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    state = engine.buyProperty(state, 'a'); // a owns Baltic
    state = engine.endTurn(state, 'a');
    state = engine.rollDice(state, 'b'); // b lands on Baltic, pays rent 4
    expect(state.lastAction?.type).toBe('pay_rent');
    expect(player(state, 'b').cash).toBe(1500 - 4);
    expect(player(state, 'a').cash).toBe(1500 - 60 + 4);
  });

  it('doubles base rent when the owner holds the whole color group', () => {
    const engine = new MonopolyEngine();
    let state = engine.createGame(['a', 'b']);
    // Give a both brown streets (Mediterranean 1, Baltic 3).
    state.properties[1]!.ownerId = 'a';
    state.properties[3]!.ownerId = 'a';
    expect(computeRent(state, 1, 0)).toBe(2 * 2); // Mediterranean base 2, doubled
    expect(computeRent(state, 3, 0)).toBe(4 * 2);
  });

  it('scales railroad rent by the number owned', () => {
    const engine = new MonopolyEngine();
    const state = engine.createGame(['a', 'b']);
    state.properties[5]!.ownerId = 'a';
    expect(computeRent(state, 5, 0)).toBe(25);
    state.properties[15]!.ownerId = 'a';
    expect(computeRent(state, 5, 0)).toBe(50);
    state.properties[25]!.ownerId = 'a';
    expect(computeRent(state, 5, 0)).toBe(100);
    state.properties[35]!.ownerId = 'a';
    expect(computeRent(state, 5, 0)).toBe(200);
  });

  it('charges utility rent as a dice multiplier', () => {
    const engine = new MonopolyEngine();
    const state = engine.createGame(['a', 'b']);
    state.properties[12]!.ownerId = 'a';
    expect(computeRent(state, 12, 8)).toBe(4 * 8);
    state.properties[28]!.ownerId = 'a';
    expect(computeRent(state, 12, 8)).toBe(10 * 8);
  });

  it('charges no rent on a mortgaged property', () => {
    const engine = new MonopolyEngine();
    const state = engine.createGame(['a', 'b']);
    state.properties[3]!.ownerId = 'a';
    state.properties[3]!.mortgaged = true;
    expect(computeRent(state, 3, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Taxes and cards
// ---------------------------------------------------------------------------

describe('taxes and cards', () => {
  it('charges income tax on landing', () => {
    const engine = newEngine([2, 2]); // doubles -> index 4 Income Tax ($200)
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    expect(state.lastAction?.type).toBe('tax');
    expect(player(state, 'a').cash).toBe(1500 - 200);
  });

  it('applies a money-gain chance card', () => {
    const idx = findChanceIndex('ch_bank_dividend'); // +50
    const engine = newEngine([3, 4], idx); // total 7 -> Chance at index 7
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    expect(state.lastAction?.type).toBe('card');
    expect(player(state, 'a').cash).toBe(1500 + 50);
  });

  it('applies a go-to-jail chance card', () => {
    const idx = findChanceIndex('ch_go_to_jail');
    const engine = newEngine([3, 4], idx);
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    expect(player(state, 'a').inJail).toBe(true);
    expect(player(state, 'a').position).toBe(10);
  });

  it('grants a get-out-of-jail card', () => {
    const idx = findChanceIndex('ch_jail_free');
    const engine = newEngine([3, 4], idx);
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    expect(player(state, 'a').getOutOfJailCards).toBe(1);
  });

  it('advance-to-GO community card awards salary', () => {
    const idx = findCommunityIndex('cc_advance_go');
    const engine = newEngine([1, 1], idx); // doubles -> index 2 Community Chest
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    expect(player(state, 'a').position).toBe(0);
    expect(player(state, 'a').cash).toBe(1500 + 200);
  });
});

// ---------------------------------------------------------------------------
// Jail
// ---------------------------------------------------------------------------

describe('jail', () => {
  it('sends to jail after three consecutive doubles', () => {
    const engine = newEngine([2, 2, 3, 3, 1, 1]);
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a'); // doubles 1
    if (state.phase === 'resolve') state = engine.declinePurchase(state, 'a');
    state = engine.rollDice(state, 'a'); // doubles 2
    if (state.phase === 'resolve') state = engine.declinePurchase(state, 'a');
    state = engine.rollDice(state, 'a'); // doubles 3 -> jail
    expect(player(state, 'a').inJail).toBe(true);
    expect(player(state, 'a').position).toBe(10);
    expect(state.phase).toBe('end');
  });

  it('lands directly on Go To Jail', () => {
    // From GO need to reach 30. Use doubles to chain: 6,6=12;6,6=24;3,3=30.
    const engine = newEngine([6, 6, 6, 6, 3, 3]);
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a'); // 12
    if (state.phase === 'resolve') state = engine.declinePurchase(state, 'a');
    state = engine.rollDice(state, 'a'); // 24
    if (state.phase === 'resolve') state = engine.declinePurchase(state, 'a');
    state = engine.rollDice(state, 'a'); // 30 -> go to jail
    expect(player(state, 'a').inJail).toBe(true);
  });

  it('escapes jail by rolling doubles', () => {
    const engine = newEngine([2, 2]);
    let state = engine.createGame(['a', 'b']);
    player(state, 'a').inJail = true;
    player(state, 'a').position = 10;
    // a's turn, in jail, rolls doubles 2,2 -> escapes and moves 4 (10 -> 14)
    state = engine.rollDice(state, 'a');
    expect(player(state, 'a').inJail).toBe(false);
    expect(player(state, 'a').position).toBe(14);
  });

  it('pays the fine to leave jail voluntarily', () => {
    const engine = new MonopolyEngine();
    let state = engine.createGame(['a', 'b']);
    player(state, 'a').inJail = true;
    player(state, 'a').position = 10;
    state = engine.payJailFine(state, 'a');
    expect(player(state, 'a').inJail).toBe(false);
    expect(player(state, 'a').cash).toBe(1500 - 50);
  });

  it('uses a get-out-of-jail card', () => {
    const engine = new MonopolyEngine();
    let state = engine.createGame(['a', 'b']);
    player(state, 'a').inJail = true;
    player(state, 'a').getOutOfJailCards = 1;
    state = engine.useJailCard(state, 'a');
    expect(player(state, 'a').inJail).toBe(false);
    expect(player(state, 'a').getOutOfJailCards).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

describe('buildHouse', () => {
  it('requires owning the whole color group', () => {
    const engine = new MonopolyEngine();
    const state = engine.createGame(['a', 'b']);
    state.properties[1]!.ownerId = 'a'; // only Mediterranean, not Baltic
    expect(() => engine.buildHouse(state, 'a', 1)).toThrow(/color group/);
  });

  it('builds evenly and charges the house cost', () => {
    const engine = new MonopolyEngine();
    let state = engine.createGame(['a', 'b']);
    state.properties[1]!.ownerId = 'a';
    state.properties[3]!.ownerId = 'a';
    state = engine.buildHouse(state, 'a', 1);
    expect(state.properties[1]!.houses).toBe(1);
    expect(player(state, 'a').cash).toBe(1500 - 50);
    // Cannot build a 2nd house on Mediterranean before Baltic catches up.
    expect(() => engine.buildHouse(state, 'a', 1)).toThrow(/evenly/);
    state = engine.buildHouse(state, 'a', 3);
    expect(state.properties[3]!.houses).toBe(1);
  });

  it('caps at a hotel (5 tiers)', () => {
    const engine = new MonopolyEngine();
    let state = engine.createGame(['a', 'b']);
    state.properties[1]!.ownerId = 'a';
    state.properties[3]!.ownerId = 'a';
    for (let i = 0; i < 5; i++) {
      state = engine.buildHouse(state, 'a', 1);
      state = engine.buildHouse(state, 'a', 3);
    }
    expect(state.properties[1]!.houses).toBe(5);
    expect(() => engine.buildHouse(state, 'a', 1)).toThrow(/hotel/);
  });

  it('rejects building on a non-street', () => {
    const engine = new MonopolyEngine();
    const state = engine.createGame(['a', 'b']);
    expect(() => engine.buildHouse(state, 'a', 5)).toThrow(/streets/);
  });
});

// ---------------------------------------------------------------------------
// Bankruptcy and win
// ---------------------------------------------------------------------------

describe('bankruptcy and win', () => {
  it('bankrupts a player who cannot pay rent and ends the game', () => {
    const engine = newEngine([1, 2, 1, 2]);
    let state = engine.createGame(['a', 'b']);
    // a buys Baltic with a hotel-level rent forced by giving the group + houses.
    state = engine.rollDice(state, 'a');
    state = engine.buyProperty(state, 'a');
    // Force a monopoly + hotel so rent is huge, and bankrupt b.
    state.properties[1]!.ownerId = 'a';
    state.properties[3]!.houses = 5; // hotel on Baltic -> rent 450
    state = engine.endTurn(state, 'a');
    player(state, 'b').cash = 100; // cannot afford 450
    state = engine.rollDice(state, 'b'); // lands Baltic, owes 450 -> bankrupt
    expect(player(state, 'b').bankrupt).toBe(true);
    expect(state.status).toBe('finished');
    expect(state.winner).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

describe('turn flow', () => {
  it('advances to the next player on endTurn', () => {
    const engine = newEngine([1, 2]);
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    state = engine.declinePurchase(state, 'a');
    state = engine.endTurn(state, 'a');
    expect(state.turn).toBe('b');
    expect(state.phase).toBe('roll');
  });

  it('forces a re-roll after doubles before ending the turn', () => {
    const engine = newEngine([2, 2]); // doubles -> Income Tax, phase back to roll
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    expect(state.phase).toBe('roll');
    expect(() => engine.endTurn(state, 'a')).toThrow(/roll again/);
  });

  it('blocks endTurn while a purchase is pending', () => {
    const engine = newEngine([1, 2]);
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    expect(state.phase).toBe('resolve');
    expect(() => engine.endTurn(state, 'a')).toThrow(/resolve/);
  });

  it('getPublicState mirrors the core fields', () => {
    const engine = newEngine([1, 2]);
    let state = engine.createGame(['a', 'b']);
    state = engine.rollDice(state, 'a');
    const pub = engine.getPublicState(state);
    expect(pub.turn).toBe('a');
    expect(pub.pendingPurchase).toBe(3);
    expect(pub.players).toHaveLength(2);
  });
});
