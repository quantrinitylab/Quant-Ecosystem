// ============================================================================
// Cross-App Gaming - Monopoly Game Engine (pure rules logic)
// ============================================================================
//
// A standard 40-space Monopoly rules engine implemented as PURE, deterministic
// logic so it can be hosted by ANY Quant app (QuantNeon, QuantChat, QuantMax,
// ...) and unit-tested exhaustively.
//
// Design constraints (mirroring uno-engine / ludo-engine in this package):
//   - NO Prisma, NO I/O, NO @quant/server-core dependency.
//   - All randomness is INJECTABLE: the constructor takes optional `rollDie`
//     and card-draw functions. They default to Math.random-backed helpers.
//     This is GAME randomness (dice / shuffled card decks), NOT a security
//     primitive, so Math.random is acceptable as the default; tests inject
//     deterministic functions so every outcome can be asserted exactly.
//   - State is a serializable plain object. Public mutating methods clone the
//     state and return a NEW state, so callers always get a fresh value and the
//     input is never mutated.
//   - Illegal operations throw a local `MonopolyError` carrying a stable `code`.

/** Stable error codes for every illegal Monopoly operation. */
export type MonopolyErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  | 'WRONG_PHASE'
  | 'NOT_PURCHASABLE'
  | 'ALREADY_OWNED'
  | 'INSUFFICIENT_FUNDS'
  | 'NOT_OWNER'
  | 'CANNOT_BUILD'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_BANKRUPT';

/** Raised on any illegal Monopoly operation; carries an HTTP-mappable statusCode. */
export class MonopolyError extends Error {
  readonly statusCode = 400;
  constructor(
    message: string,
    readonly code: MonopolyErrorCode,
  ) {
    super(message);
    this.name = 'MonopolyError';
  }
}

// ----------------------------------------------------------------------------
// Board model
// ----------------------------------------------------------------------------

export type PropertyColor =
  | 'brown'
  | 'light_blue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'dark_blue';

export type SpaceType =
  | 'go'
  | 'street'
  | 'railroad'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'community_chest'
  | 'jail' // just visiting / in jail
  | 'free_parking'
  | 'go_to_jail';

/** A street space (ownable, can hold houses). */
export interface StreetSpace {
  index: number;
  type: 'street';
  name: string;
  color: PropertyColor;
  price: number;
  /** Build cost per house (and per hotel) for this color group. */
  houseCost: number;
  /** Rent for [base, 1 house, 2, 3, 4, hotel]. */
  rent: readonly [number, number, number, number, number, number];
  mortgage: number;
}

export interface RailroadSpace {
  index: number;
  type: 'railroad';
  name: string;
  price: number;
  mortgage: number;
}

export interface UtilitySpace {
  index: number;
  type: 'utility';
  name: string;
  price: number;
  mortgage: number;
}

export interface TaxSpace {
  index: number;
  type: 'tax';
  name: string;
  amount: number;
}

export interface SimpleSpace {
  index: number;
  type: 'go' | 'chance' | 'community_chest' | 'jail' | 'free_parking' | 'go_to_jail';
  name: string;
}

export type BoardSpace = StreetSpace | RailroadSpace | UtilitySpace | TaxSpace | SimpleSpace;

/** An ownable space carries a price (street / railroad / utility). */
export type OwnableSpace = StreetSpace | RailroadSpace | UtilitySpace;

export function isOwnable(space: BoardSpace): space is OwnableSpace {
  return space.type === 'street' || space.type === 'railroad' || space.type === 'utility';
}

/**
 * The standard US Monopoly board (40 spaces, indices 0-39). Prices, rents and
 * tax amounts follow the classic edition. Houses are built across a color group
 * and a "hotel" is represented as the 5th house tier (`rent[5]`).
 */
export const BOARD: readonly BoardSpace[] = [
  { index: 0, type: 'go', name: 'GO' },
  {
    index: 1,
    type: 'street',
    name: 'Mediterranean Avenue',
    color: 'brown',
    price: 60,
    houseCost: 50,
    rent: [2, 10, 30, 90, 160, 250],
    mortgage: 30,
  },
  { index: 2, type: 'community_chest', name: 'Community Chest' },
  {
    index: 3,
    type: 'street',
    name: 'Baltic Avenue',
    color: 'brown',
    price: 60,
    houseCost: 50,
    rent: [4, 20, 60, 180, 320, 450],
    mortgage: 30,
  },
  { index: 4, type: 'tax', name: 'Income Tax', amount: 200 },
  { index: 5, type: 'railroad', name: 'Reading Railroad', price: 200, mortgage: 100 },
  {
    index: 6,
    type: 'street',
    name: 'Oriental Avenue',
    color: 'light_blue',
    price: 100,
    houseCost: 50,
    rent: [6, 30, 90, 270, 400, 550],
    mortgage: 50,
  },
  { index: 7, type: 'chance', name: 'Chance' },
  {
    index: 8,
    type: 'street',
    name: 'Vermont Avenue',
    color: 'light_blue',
    price: 100,
    houseCost: 50,
    rent: [6, 30, 90, 270, 400, 550],
    mortgage: 50,
  },
  {
    index: 9,
    type: 'street',
    name: 'Connecticut Avenue',
    color: 'light_blue',
    price: 120,
    houseCost: 50,
    rent: [8, 40, 100, 300, 450, 600],
    mortgage: 60,
  },
  { index: 10, type: 'jail', name: 'Jail / Just Visiting' },
  {
    index: 11,
    type: 'street',
    name: 'St. Charles Place',
    color: 'pink',
    price: 140,
    houseCost: 100,
    rent: [10, 50, 150, 450, 625, 750],
    mortgage: 70,
  },
  { index: 12, type: 'utility', name: 'Electric Company', price: 150, mortgage: 75 },
  {
    index: 13,
    type: 'street',
    name: 'States Avenue',
    color: 'pink',
    price: 140,
    houseCost: 100,
    rent: [10, 50, 150, 450, 625, 750],
    mortgage: 70,
  },
  {
    index: 14,
    type: 'street',
    name: 'Virginia Avenue',
    color: 'pink',
    price: 160,
    houseCost: 100,
    rent: [12, 60, 180, 500, 700, 900],
    mortgage: 80,
  },
  { index: 15, type: 'railroad', name: 'Pennsylvania Railroad', price: 200, mortgage: 100 },
  {
    index: 16,
    type: 'street',
    name: 'St. James Place',
    color: 'orange',
    price: 180,
    houseCost: 100,
    rent: [14, 70, 200, 550, 750, 950],
    mortgage: 90,
  },
  { index: 17, type: 'community_chest', name: 'Community Chest' },
  {
    index: 18,
    type: 'street',
    name: 'Tennessee Avenue',
    color: 'orange',
    price: 180,
    houseCost: 100,
    rent: [14, 70, 200, 550, 750, 950],
    mortgage: 90,
  },
  {
    index: 19,
    type: 'street',
    name: 'New York Avenue',
    color: 'orange',
    price: 200,
    houseCost: 100,
    rent: [16, 80, 220, 600, 800, 1000],
    mortgage: 100,
  },
  { index: 20, type: 'free_parking', name: 'Free Parking' },
  {
    index: 21,
    type: 'street',
    name: 'Kentucky Avenue',
    color: 'red',
    price: 220,
    houseCost: 150,
    rent: [18, 90, 250, 700, 875, 1050],
    mortgage: 110,
  },
  { index: 22, type: 'chance', name: 'Chance' },
  {
    index: 23,
    type: 'street',
    name: 'Indiana Avenue',
    color: 'red',
    price: 220,
    houseCost: 150,
    rent: [18, 90, 250, 700, 875, 1050],
    mortgage: 110,
  },
  {
    index: 24,
    type: 'street',
    name: 'Illinois Avenue',
    color: 'red',
    price: 240,
    houseCost: 150,
    rent: [20, 100, 300, 750, 925, 1100],
    mortgage: 120,
  },
  { index: 25, type: 'railroad', name: 'B. & O. Railroad', price: 200, mortgage: 100 },
  {
    index: 26,
    type: 'street',
    name: 'Atlantic Avenue',
    color: 'yellow',
    price: 260,
    houseCost: 150,
    rent: [22, 110, 330, 800, 975, 1150],
    mortgage: 130,
  },
  {
    index: 27,
    type: 'street',
    name: 'Ventnor Avenue',
    color: 'yellow',
    price: 260,
    houseCost: 150,
    rent: [22, 110, 330, 800, 975, 1150],
    mortgage: 130,
  },
  { index: 28, type: 'utility', name: 'Water Works', price: 150, mortgage: 75 },
  {
    index: 29,
    type: 'street',
    name: 'Marvin Gardens',
    color: 'yellow',
    price: 280,
    houseCost: 150,
    rent: [24, 120, 360, 850, 1025, 1200],
    mortgage: 140,
  },
  { index: 30, type: 'go_to_jail', name: 'Go To Jail' },
  {
    index: 31,
    type: 'street',
    name: 'Pacific Avenue',
    color: 'green',
    price: 300,
    houseCost: 200,
    rent: [26, 130, 390, 900, 1100, 1275],
    mortgage: 150,
  },
  {
    index: 32,
    type: 'street',
    name: 'North Carolina Avenue',
    color: 'green',
    price: 300,
    houseCost: 200,
    rent: [26, 130, 390, 900, 1100, 1275],
    mortgage: 150,
  },
  { index: 33, type: 'community_chest', name: 'Community Chest' },
  {
    index: 34,
    type: 'street',
    name: 'Pennsylvania Avenue',
    color: 'green',
    price: 320,
    houseCost: 200,
    rent: [28, 150, 450, 1000, 1200, 1400],
    mortgage: 160,
  },
  { index: 35, type: 'railroad', name: 'Short Line', price: 200, mortgage: 100 },
  { index: 36, type: 'chance', name: 'Chance' },
  {
    index: 37,
    type: 'street',
    name: 'Park Place',
    color: 'dark_blue',
    price: 350,
    houseCost: 200,
    rent: [35, 175, 500, 1100, 1300, 1500],
    mortgage: 175,
  },
  { index: 38, type: 'tax', name: 'Luxury Tax', amount: 100 },
  {
    index: 39,
    type: 'street',
    name: 'Boardwalk',
    color: 'dark_blue',
    price: 400,
    houseCost: 200,
    rent: [50, 200, 600, 1400, 1700, 2000],
    mortgage: 200,
  },
];

const BOARD_SIZE = 40;
const GO_INDEX = 0;
const JAIL_INDEX = 10;
const GO_SALARY = 200;
const STARTING_CASH = 1500;
const MAX_HOUSES = 5; // 5 == hotel
const MAX_JAIL_TURNS = 3;
const JAIL_FINE = 50;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

/** Count of streets in each color group (for monopoly detection). */
const COLOR_GROUP_SIZE: Record<PropertyColor, number> = {
  brown: 2,
  light_blue: 3,
  pink: 3,
  orange: 3,
  red: 3,
  yellow: 3,
  green: 3,
  dark_blue: 2,
};

// ----------------------------------------------------------------------------
// Chance / Community Chest cards
// ----------------------------------------------------------------------------

/**
 * A card effect. Kept deliberately small but real:
 *   - `gain` / `pay`: adjust the drawing player's cash by `amount`.
 *   - `move_to`: advance to absolute board `index` (collecting GO salary if the
 *     move passes GO unless `noSalary`).
 *   - `go_to_jail`: send straight to jail (no salary).
 *   - `get_out_of_jail`: grant a "get out of jail free" card.
 */
export interface MonopolyCard {
  id: string;
  text: string;
  effect:
    | { kind: 'gain'; amount: number }
    | { kind: 'pay'; amount: number }
    | { kind: 'move_to'; index: number; noSalary?: boolean }
    | { kind: 'go_to_jail' }
    | { kind: 'get_out_of_jail' };
}

export const CHANCE_CARDS: readonly MonopolyCard[] = [
  {
    id: 'ch_advance_go',
    text: 'Advance to GO. Collect $200.',
    effect: { kind: 'move_to', index: 0 },
  },
  {
    id: 'ch_advance_illinois',
    text: 'Advance to Illinois Avenue.',
    effect: { kind: 'move_to', index: 24 },
  },
  {
    id: 'ch_advance_charles',
    text: 'Advance to St. Charles Place.',
    effect: { kind: 'move_to', index: 11 },
  },
  {
    id: 'ch_bank_dividend',
    text: 'Bank pays you dividend of $50.',
    effect: { kind: 'gain', amount: 50 },
  },
  { id: 'ch_jail_free', text: 'Get out of Jail Free.', effect: { kind: 'get_out_of_jail' } },
  { id: 'ch_go_to_jail', text: 'Go to Jail. Do not pass GO.', effect: { kind: 'go_to_jail' } },
  { id: 'ch_poor_tax', text: 'Pay poor tax of $15.', effect: { kind: 'pay', amount: 15 } },
  {
    id: 'ch_reading',
    text: 'Take a trip to Reading Railroad.',
    effect: { kind: 'move_to', index: 5 },
  },
  { id: 'ch_boardwalk', text: 'Advance to Boardwalk.', effect: { kind: 'move_to', index: 39 } },
  {
    id: 'ch_chairman',
    text: 'You have been elected Chairman. Pay $50.',
    effect: { kind: 'pay', amount: 50 },
  },
  {
    id: 'ch_loan_matures',
    text: 'Your building loan matures. Collect $150.',
    effect: { kind: 'gain', amount: 150 },
  },
];

export const COMMUNITY_CHEST_CARDS: readonly MonopolyCard[] = [
  {
    id: 'cc_advance_go',
    text: 'Advance to GO. Collect $200.',
    effect: { kind: 'move_to', index: 0 },
  },
  {
    id: 'cc_bank_error',
    text: 'Bank error in your favor. Collect $200.',
    effect: { kind: 'gain', amount: 200 },
  },
  { id: 'cc_doctor_fee', text: "Doctor's fee. Pay $50.", effect: { kind: 'pay', amount: 50 } },
  {
    id: 'cc_stock_sale',
    text: 'From sale of stock you get $50.',
    effect: { kind: 'gain', amount: 50 },
  },
  { id: 'cc_jail_free', text: 'Get out of Jail Free.', effect: { kind: 'get_out_of_jail' } },
  { id: 'cc_go_to_jail', text: 'Go to Jail. Do not pass GO.', effect: { kind: 'go_to_jail' } },
  {
    id: 'cc_holiday_fund',
    text: 'Holiday fund matures. Collect $100.',
    effect: { kind: 'gain', amount: 100 },
  },
  {
    id: 'cc_income_refund',
    text: 'Income tax refund. Collect $20.',
    effect: { kind: 'gain', amount: 20 },
  },
  {
    id: 'cc_birthday',
    text: 'It is your birthday. Collect $10.',
    effect: { kind: 'gain', amount: 10 },
  },
  { id: 'cc_hospital', text: 'Pay hospital fees of $100.', effect: { kind: 'pay', amount: 100 } },
  { id: 'cc_school_fee', text: 'Pay school fees of $50.', effect: { kind: 'pay', amount: 50 } },
  {
    id: 'cc_consultancy',
    text: 'Receive $25 consultancy fee.',
    effect: { kind: 'gain', amount: 25 },
  },
];

// ----------------------------------------------------------------------------
// Game state
// ----------------------------------------------------------------------------

export interface MonopolyPlayer {
  id: string;
  cash: number;
  /** Board index 0-39. */
  position: number;
  inJail: boolean;
  /** Turns spent in jail this stint (0-3). */
  jailTurns: number;
  bankrupt: boolean;
  /** Number of "get out of jail free" cards held. */
  getOutOfJailCards: number;
}

/** Per-ownable-space state, keyed by board index. */
export interface PropertyState {
  index: number;
  ownerId: string | null;
  /** 0-5 (5 == hotel). Streets only; always 0 for railroads/utilities. */
  houses: number;
  mortgaged: boolean;
}

/** A turn phase: `roll` -> (resolve a pending purchase) -> `end`. */
export type TurnPhase = 'roll' | 'resolve' | 'end';

export interface MonopolyAction {
  type:
    | 'roll'
    | 'buy'
    | 'pay_rent'
    | 'tax'
    | 'card'
    | 'go_to_jail'
    | 'build'
    | 'bankrupt'
    | 'end_turn';
  playerId: string;
  detail?: string;
  amount?: number;
  toPlayerId?: string;
}

export interface MonopolyGameState {
  players: MonopolyPlayer[];
  /** Ownable-space state keyed by board index (string keys for serializability). */
  properties: Record<number, PropertyState>;
  turn: string;
  phase: TurnPhase;
  status: 'active' | 'finished';
  winner: string | null;
  lastRoll: readonly [number, number] | null;
  /** Consecutive doubles rolled this turn (3 => go to jail). */
  doublesCount: number;
  /** Board index of an unowned ownable space the current player just landed on. */
  pendingPurchase: number | null;
  chanceOrder: string[];
  communityOrder: string[];
  lastAction: MonopolyAction | null;
}

/** A redacted public view (currently identical shape; hands are not secret in Monopoly). */
export interface MonopolyPublicState {
  players: MonopolyPlayer[];
  properties: Record<number, PropertyState>;
  turn: string;
  phase: TurnPhase;
  status: 'active' | 'finished';
  winner: string | null;
  lastRoll: readonly [number, number] | null;
  pendingPurchase: number | null;
  lastAction: MonopolyAction | null;
}

/** Injectable single-die roll returning 1-6. */
export type RollDieFn = () => number;
/** Injectable card draw: given a deck order, returns the index of the card to draw. */
export type DrawCardFn = (deckSize: number) => number;

export interface CreateGameOptions {
  /** Starting cash per player. Defaults to 1500. */
  startingCash?: number;
}

// ----------------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------------

function defaultRollDie(): number {
  // GAME dice (not a security primitive) — Math.random is acceptable here.
  return Math.floor(Math.random() * 6) + 1;
}

function defaultDrawCard(deckSize: number): number {
  return Math.floor(Math.random() * deckSize);
}

function clonePlayer(p: MonopolyPlayer): MonopolyPlayer {
  return { ...p };
}

function cloneProperty(p: PropertyState): PropertyState {
  return { ...p };
}

function cloneState(state: MonopolyGameState): MonopolyGameState {
  const properties: Record<number, PropertyState> = {};
  for (const key of Object.keys(state.properties)) {
    const idx = Number(key);
    properties[idx] = cloneProperty(state.properties[idx]!);
  }
  return {
    players: state.players.map(clonePlayer),
    properties,
    turn: state.turn,
    phase: state.phase,
    status: state.status,
    winner: state.winner,
    lastRoll: state.lastRoll ? [state.lastRoll[0], state.lastRoll[1]] : null,
    doublesCount: state.doublesCount,
    pendingPurchase: state.pendingPurchase,
    chanceOrder: [...state.chanceOrder],
    communityOrder: [...state.communityOrder],
    lastAction: state.lastAction ? { ...state.lastAction } : null,
  };
}

function spaceAt(index: number): BoardSpace {
  return BOARD[index]!;
}

/** Count how many railroads / utilities of a given type an owner holds. */
function countOwnedOfType(
  state: MonopolyGameState,
  ownerId: string,
  type: 'railroad' | 'utility',
): number {
  let count = 0;
  for (const key of Object.keys(state.properties)) {
    const idx = Number(key);
    if (spaceAt(idx).type === type && state.properties[idx]!.ownerId === ownerId) count++;
  }
  return count;
}

/** True when `ownerId` owns every street in `color` (a "monopoly"). */
function ownsColorGroup(state: MonopolyGameState, ownerId: string, color: PropertyColor): boolean {
  let owned = 0;
  for (const space of BOARD) {
    if (space.type === 'street' && space.color === color) {
      if (state.properties[space.index]!.ownerId === ownerId) owned++;
    }
  }
  return owned === COLOR_GROUP_SIZE[color];
}

/**
 * Rent owed for landing on an owned space. `diceTotal` is required for utility
 * rent. Returns 0 for mortgaged spaces or non-ownable spaces.
 */
export function computeRent(state: MonopolyGameState, index: number, diceTotal: number): number {
  const space = spaceAt(index);
  if (!isOwnable(space)) return 0;
  const prop = state.properties[index]!;
  if (prop.ownerId === null || prop.mortgaged) return 0;

  if (space.type === 'street') {
    if (prop.houses === 0 && ownsColorGroup(state, prop.ownerId, space.color)) {
      return space.rent[0] * 2;
    }
    return space.rent[prop.houses]!;
  }
  if (space.type === 'railroad') {
    const owned = countOwnedOfType(state, prop.ownerId, 'railroad');
    return owned > 0 ? 25 * 2 ** (owned - 1) : 0;
  }
  // utility
  const owned = countOwnedOfType(state, prop.ownerId, 'utility');
  return owned >= 2 ? 10 * diceTotal : 4 * diceTotal;
}

// ----------------------------------------------------------------------------
// Engine
// ----------------------------------------------------------------------------

/**
 * The Monopoly rules engine. Construct once (optionally with deterministic
 * `rollDie` / card-draw functions) and drive a game through `createGame` ->
 * `rollDice` -> (`buyProperty` | `declinePurchase`) -> `endTurn`. Every public
 * method returns a fresh state and never mutates its input.
 */
export class MonopolyEngine {
  private readonly rollDie: RollDieFn;
  private readonly drawCard: DrawCardFn;

  constructor(options: { rollDie?: RollDieFn; drawCard?: DrawCardFn } = {}) {
    this.rollDie = options.rollDie ?? defaultRollDie;
    this.drawCard = options.drawCard ?? defaultDrawCard;
  }

  /**
   * Deal a new game. 2-8 unique players, each starting on GO with `startingCash`
   * (default 1500). All ownable spaces start unowned.
   */
  createGame(playerIds: string[], options: CreateGameOptions = {}): MonopolyGameState {
    if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
      throw new MonopolyError(
        `Monopoly requires between ${MIN_PLAYERS} and ${MAX_PLAYERS} players`,
        'INVALID_PLAYER_COUNT',
      );
    }
    if (new Set(playerIds).size !== playerIds.length) {
      throw new MonopolyError('player ids must be unique', 'INVALID_PLAYER_COUNT');
    }

    const startingCash = options.startingCash ?? STARTING_CASH;
    const players: MonopolyPlayer[] = playerIds.map((id) => ({
      id,
      cash: startingCash,
      position: GO_INDEX,
      inJail: false,
      jailTurns: 0,
      bankrupt: false,
      getOutOfJailCards: 0,
    }));

    const properties: Record<number, PropertyState> = {};
    for (const space of BOARD) {
      if (isOwnable(space)) {
        properties[space.index] = {
          index: space.index,
          ownerId: null,
          houses: 0,
          mortgaged: false,
        };
      }
    }

    return {
      players,
      properties,
      turn: players[0]!.id,
      phase: 'roll',
      status: 'active',
      winner: null,
      lastRoll: null,
      doublesCount: 0,
      pendingPurchase: null,
      chanceOrder: CHANCE_CARDS.map((c) => c.id),
      communityOrder: COMMUNITY_CHEST_CARDS.map((c) => c.id),
      lastAction: null,
    };
  }

  /**
   * Roll the dice for the current player and resolve movement + the landing
   * effect. Handles jail (doubles to escape, or the 3rd-turn $50 fine), the
   * 3-consecutive-doubles "go to jail" rule, GO salary, rent, taxes and cards.
   * Leaves `phase` at `resolve` when the player landed on an unowned ownable
   * space (call `buyProperty` / `declinePurchase`), `roll` for a doubles bonus,
   * otherwise `end`.
   */
  rollDice(state: MonopolyGameState, playerId: string): MonopolyGameState {
    this.assertTurn(state, playerId, 'roll');
    const next = cloneState(state);
    const player = this.activePlayer(next, playerId);

    const d1 = this.clampDie(this.rollDie());
    const d2 = this.clampDie(this.rollDie());
    next.lastRoll = [d1, d2];
    const total = d1 + d2;
    const isDoubles = d1 === d2;

    if (player.inJail) {
      this.resolveJailRoll(next, player, total, isDoubles);
      return next;
    }

    if (isDoubles) {
      next.doublesCount += 1;
      if (next.doublesCount >= 3) {
        this.sendToJail(player);
        next.doublesCount = 0;
        next.phase = 'end';
        next.lastAction = { type: 'go_to_jail', playerId, detail: 'three consecutive doubles' };
        return next;
      }
    }

    this.advance(player, total);
    next.lastAction = { type: 'roll', playerId, amount: total };
    this.applyLanding(next, player, total);
    this.settlePhaseAfterMove(next, isDoubles);
    return next;
  }

  /** Buy the ownable space the current player just landed on (phase `resolve`). */
  buyProperty(state: MonopolyGameState, playerId: string): MonopolyGameState {
    this.assertTurn(state, playerId, 'resolve');
    if (state.pendingPurchase === null) {
      throw new MonopolyError('there is no property to purchase', 'NOT_PURCHASABLE');
    }
    const next = cloneState(state);
    const player = this.activePlayer(next, playerId);
    const index = next.pendingPurchase!;
    const space = spaceAt(index);
    if (!isOwnable(space)) {
      throw new MonopolyError('that space cannot be purchased', 'NOT_PURCHASABLE');
    }
    const prop = next.properties[index]!;
    if (prop.ownerId !== null) {
      throw new MonopolyError('that property is already owned', 'ALREADY_OWNED');
    }
    if (player.cash < space.price) {
      throw new MonopolyError('insufficient funds to buy this property', 'INSUFFICIENT_FUNDS');
    }

    player.cash -= space.price;
    prop.ownerId = playerId;
    next.pendingPurchase = null;
    next.lastAction = { type: 'buy', playerId, detail: space.name, amount: space.price };
    this.settlePhaseAfterResolve(next);
    return next;
  }

  /** Decline to buy the pending property (it stays with the bank; no auction). */
  declinePurchase(state: MonopolyGameState, playerId: string): MonopolyGameState {
    this.assertTurn(state, playerId, 'resolve');
    if (state.pendingPurchase === null) {
      throw new MonopolyError('there is no property to decline', 'NOT_PURCHASABLE');
    }
    const next = cloneState(state);
    next.pendingPurchase = null;
    next.lastAction = { type: 'end_turn', playerId, detail: 'declined purchase' };
    this.settlePhaseAfterResolve(next);
    return next;
  }

  /**
   * Build one house (or hotel as the 5th tier) on a street. Requires the player
   * to own the full color group (none mortgaged) and respects the even-build
   * rule (houses across a group may differ by at most one).
   */
  buildHouse(state: MonopolyGameState, playerId: string, index: number): MonopolyGameState {
    if (state.status === 'finished') throw new MonopolyError('the game is over', 'GAME_OVER');
    if (state.turn !== playerId) throw new MonopolyError('it is not your turn', 'NOT_YOUR_TURN');

    const space = spaceAt(index);
    if (space.type !== 'street') {
      throw new MonopolyError('houses can only be built on streets', 'CANNOT_BUILD');
    }
    const next = cloneState(state);
    const player = this.activePlayer(next, playerId);
    const prop = next.properties[index]!;

    if (prop.ownerId !== playerId)
      throw new MonopolyError('you do not own that street', 'NOT_OWNER');
    if (prop.mortgaged)
      throw new MonopolyError('cannot build on a mortgaged street', 'CANNOT_BUILD');
    if (!ownsColorGroup(next, playerId, space.color)) {
      throw new MonopolyError('you must own the whole color group to build', 'CANNOT_BUILD');
    }
    if (prop.houses >= MAX_HOUSES) {
      throw new MonopolyError('this street already has a hotel', 'CANNOT_BUILD');
    }
    // Even-build rule: only build on the group member(s) with the fewest houses.
    const groupMin = this.minHousesInGroup(next, space.color);
    if (prop.houses !== groupMin) {
      throw new MonopolyError('build evenly across the color group first', 'CANNOT_BUILD');
    }
    // No group member may be mortgaged.
    if (this.groupHasMortgage(next, space.color)) {
      throw new MonopolyError('cannot build while a group member is mortgaged', 'CANNOT_BUILD');
    }
    if (player.cash < space.houseCost) {
      throw new MonopolyError('insufficient funds to build', 'INSUFFICIENT_FUNDS');
    }

    player.cash -= space.houseCost;
    prop.houses += 1;
    next.lastAction = { type: 'build', playerId, detail: space.name, amount: space.houseCost };
    return next;
  }

  /** Pay the $50 fine to leave jail immediately (then the player may roll). */
  payJailFine(state: MonopolyGameState, playerId: string): MonopolyGameState {
    this.assertTurn(state, playerId, 'roll');
    const next = cloneState(state);
    const player = this.activePlayer(next, playerId);
    if (!player.inJail) throw new MonopolyError('you are not in jail', 'WRONG_PHASE');
    if (player.cash < JAIL_FINE) {
      throw new MonopolyError('insufficient funds to pay the jail fine', 'INSUFFICIENT_FUNDS');
    }
    player.cash -= JAIL_FINE;
    player.inJail = false;
    player.jailTurns = 0;
    next.lastAction = { type: 'tax', playerId, detail: 'jail fine', amount: JAIL_FINE };
    return next;
  }

  /** Use a held "get out of jail free" card (then the player may roll). */
  useJailCard(state: MonopolyGameState, playerId: string): MonopolyGameState {
    this.assertTurn(state, playerId, 'roll');
    const next = cloneState(state);
    const player = this.activePlayer(next, playerId);
    if (!player.inJail) throw new MonopolyError('you are not in jail', 'WRONG_PHASE');
    if (player.getOutOfJailCards <= 0) {
      throw new MonopolyError('you have no get-out-of-jail cards', 'WRONG_PHASE');
    }
    player.getOutOfJailCards -= 1;
    player.inJail = false;
    player.jailTurns = 0;
    next.lastAction = { type: 'card', playerId, detail: 'used get out of jail free' };
    return next;
  }

  /** End the current player's turn and advance to the next solvent player. */
  endTurn(state: MonopolyGameState, playerId: string): MonopolyGameState {
    if (state.status === 'finished') throw new MonopolyError('the game is over', 'GAME_OVER');
    if (state.turn !== playerId) throw new MonopolyError('it is not your turn', 'NOT_YOUR_TURN');
    if (state.phase === 'resolve') {
      throw new MonopolyError('resolve the pending property first', 'WRONG_PHASE');
    }
    if (
      state.phase === 'roll' &&
      state.lastRoll !== null &&
      state.lastRoll[0] === state.lastRoll[1]
    ) {
      const p = state.players.find((pl) => pl.id === playerId);
      if (p && !p.inJail) {
        throw new MonopolyError('you rolled doubles and must roll again', 'WRONG_PHASE');
      }
    }
    const next = cloneState(state);
    next.doublesCount = 0;
    next.pendingPurchase = null;
    next.lastAction = { type: 'end_turn', playerId };
    this.advanceTurn(next);
    return next;
  }

  /** A redacted public view of the game (safe to broadcast to all players). */
  getPublicState(state: MonopolyGameState): MonopolyPublicState {
    return {
      players: state.players.map(clonePlayer),
      properties: Object.fromEntries(
        Object.keys(state.properties).map((k) => [
          Number(k),
          cloneProperty(state.properties[Number(k)]!),
        ]),
      ),
      turn: state.turn,
      phase: state.phase,
      status: state.status,
      winner: state.winner,
      lastRoll: state.lastRoll ? [state.lastRoll[0], state.lastRoll[1]] : null,
      pendingPurchase: state.pendingPurchase,
      lastAction: state.lastAction ? { ...state.lastAction } : null,
    };
  }

  // --- internal helpers -----------------------------------------------------

  private assertTurn(state: MonopolyGameState, playerId: string, phase: TurnPhase): void {
    if (state.status === 'finished') throw new MonopolyError('the game is over', 'GAME_OVER');
    if (state.turn !== playerId) throw new MonopolyError('it is not your turn', 'NOT_YOUR_TURN');
    if (state.phase !== phase) {
      throw new MonopolyError(`expected phase ${phase} but was ${state.phase}`, 'WRONG_PHASE');
    }
  }

  private activePlayer(state: MonopolyGameState, playerId: string): MonopolyPlayer {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) throw new MonopolyError('player not found', 'PLAYER_NOT_FOUND');
    if (player.bankrupt) throw new MonopolyError('player is bankrupt', 'PLAYER_BANKRUPT');
    return player;
  }

  private clampDie(value: number): number {
    const n = Math.floor(value);
    if (n < 1) return 1;
    if (n > 6) return 6;
    return n;
  }

  /** Move a player forward by `steps`, awarding GO salary when passing GO. */
  private advance(player: MonopolyPlayer, steps: number): void {
    const newPos = (player.position + steps) % BOARD_SIZE;
    if (newPos < player.position) {
      player.cash += GO_SALARY; // passed (or landed on) GO
    }
    player.position = newPos;
  }

  /** Move a player to an absolute board index, awarding GO salary if passed. */
  private moveTo(player: MonopolyPlayer, index: number, awardGo: boolean): void {
    // Moving to a lower (or equal-to-GO) index means we wrapped past GO.
    if (awardGo && index < player.position) {
      player.cash += GO_SALARY;
    }
    player.position = index;
  }

  private sendToJail(player: MonopolyPlayer): void {
    player.position = JAIL_INDEX;
    player.inJail = true;
    player.jailTurns = 0;
  }

  private resolveJailRoll(
    state: MonopolyGameState,
    player: MonopolyPlayer,
    total: number,
    isDoubles: boolean,
  ): void {
    if (isDoubles) {
      player.inJail = false;
      player.jailTurns = 0;
      this.advance(player, total);
      this.applyLanding(state, player, total);
      // Escaping via doubles does NOT grant a bonus roll.
      this.settlePhaseAfterMove(state, false);
      return;
    }
    player.jailTurns += 1;
    if (player.jailTurns >= MAX_JAIL_TURNS) {
      // Must pay the fine and move.
      if (player.cash >= JAIL_FINE) {
        player.cash -= JAIL_FINE;
      } else {
        this.bankrupt(state, player, null);
        return;
      }
      player.inJail = false;
      player.jailTurns = 0;
      this.advance(player, total);
      this.applyLanding(state, player, total);
      this.settlePhaseAfterMove(state, false);
      return;
    }
    // Stay in jail this turn.
    state.lastAction = {
      type: 'roll',
      playerId: player.id,
      detail: 'stayed in jail',
      amount: total,
    };
    state.phase = 'end';
  }

  /** Resolve the effect of the space the player just landed on. */
  private applyLanding(state: MonopolyGameState, player: MonopolyPlayer, diceTotal: number): void {
    const space = spaceAt(player.position);

    if (space.type === 'go_to_jail') {
      this.sendToJail(player);
      state.lastAction = { type: 'go_to_jail', playerId: player.id };
      return;
    }
    if (space.type === 'tax') {
      state.lastAction = {
        type: 'tax',
        playerId: player.id,
        detail: space.name,
        amount: space.amount,
      };
      this.payBank(state, player, space.amount);
      return;
    }
    if (space.type === 'chance') {
      this.drawAndApply(state, player, 'chance');
      return;
    }
    if (space.type === 'community_chest') {
      this.drawAndApply(state, player, 'community');
      return;
    }
    if (isOwnable(space)) {
      const prop = state.properties[space.index]!;
      if (prop.ownerId === null) {
        state.pendingPurchase = space.index;
        return;
      }
      if (prop.ownerId !== player.id && !prop.mortgaged) {
        const rent = computeRent(state, space.index, diceTotal);
        const owner = state.players.find((p) => p.id === prop.ownerId);
        if (owner && rent > 0) {
          state.lastAction = {
            type: 'pay_rent',
            playerId: player.id,
            toPlayerId: owner.id,
            detail: space.name,
            amount: rent,
          };
          this.payPlayer(state, player, owner, rent);
        }
      }
      return;
    }
    // go / jail (just visiting) / free_parking: no effect.
  }

  private drawAndApply(
    state: MonopolyGameState,
    player: MonopolyPlayer,
    deck: 'chance' | 'community',
  ): void {
    const order = deck === 'chance' ? state.chanceOrder : state.communityOrder;
    const cards = deck === 'chance' ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;
    if (order.length === 0) return;
    const pick = this.clampIndex(this.drawCard(order.length), order.length);
    const cardId = order[pick]!;
    // Rotate the drawn card to the back of the deck (classic behaviour).
    order.splice(pick, 1);
    order.push(cardId);
    const card = cards.find((c) => c.id === cardId)!;
    state.lastAction = { type: 'card', playerId: player.id, detail: card.text };

    const effect = card.effect;
    switch (effect.kind) {
      case 'gain':
        player.cash += effect.amount;
        break;
      case 'pay':
        this.payBank(state, player, effect.amount);
        break;
      case 'get_out_of_jail':
        player.getOutOfJailCards += 1;
        break;
      case 'go_to_jail':
        this.sendToJail(player);
        break;
      case 'move_to':
        this.moveTo(player, effect.index, effect.noSalary !== true);
        this.applyLanding(state, player, 0);
        break;
    }
  }

  private clampIndex(value: number, size: number): number {
    const n = Math.floor(value);
    if (n < 0) return 0;
    if (n >= size) return size - 1;
    return n;
  }

  /** Set phase after a normal move: resolve > bonus roll (doubles) > end. */
  private settlePhaseAfterMove(state: MonopolyGameState, isDoubles: boolean): void {
    if (state.status === 'finished') return;
    if (state.pendingPurchase !== null) {
      state.phase = 'resolve';
      return;
    }
    const current = state.players.find((p) => p.id === state.turn);
    if (isDoubles && current && !current.inJail) {
      state.phase = 'roll';
      return;
    }
    state.phase = 'end';
  }

  /** Set phase after a purchase decision (bonus roll if the roll was doubles). */
  private settlePhaseAfterResolve(state: MonopolyGameState): void {
    if (state.status === 'finished') return;
    const wasDoubles = state.lastRoll !== null && state.lastRoll[0] === state.lastRoll[1];
    const current = state.players.find((p) => p.id === state.turn);
    state.phase = wasDoubles && current && !current.inJail ? 'roll' : 'end';
  }

  /** Pay the bank; bankrupt to the bank when unaffordable. */
  private payBank(state: MonopolyGameState, player: MonopolyPlayer, amount: number): void {
    if (player.cash >= amount) {
      player.cash -= amount;
      return;
    }
    this.bankrupt(state, player, null);
  }

  /** Pay another player; bankrupt to that creditor when unaffordable. */
  private payPlayer(
    state: MonopolyGameState,
    player: MonopolyPlayer,
    creditor: MonopolyPlayer,
    amount: number,
  ): void {
    if (player.cash >= amount) {
      player.cash -= amount;
      creditor.cash += amount;
      return;
    }
    creditor.cash += player.cash;
    player.cash = 0;
    this.bankrupt(state, player, creditor);
  }

  /**
   * Bankrupt `player`. Their assets transfer to `creditor` (or revert to the
   * bank when creditor is null). Triggers a win check.
   */
  private bankrupt(
    state: MonopolyGameState,
    player: MonopolyPlayer,
    creditor: MonopolyPlayer | null,
  ): void {
    player.bankrupt = true;
    player.inJail = false;
    if (creditor) creditor.cash += player.cash;
    player.cash = 0;
    for (const key of Object.keys(state.properties)) {
      const idx = Number(key);
      const prop = state.properties[idx]!;
      if (prop.ownerId === player.id) {
        if (creditor) {
          prop.ownerId = creditor.id;
          // Houses are sold back to the bank on bankruptcy transfer.
          prop.houses = 0;
        } else {
          prop.ownerId = null;
          prop.houses = 0;
          prop.mortgaged = false;
        }
      }
    }
    state.lastAction = {
      type: 'bankrupt',
      playerId: player.id,
      toPlayerId: creditor ? creditor.id : undefined,
    };
    this.checkWin(state);
  }

  private checkWin(state: MonopolyGameState): void {
    const solvent = state.players.filter((p) => !p.bankrupt);
    if (solvent.length <= 1) {
      state.status = 'finished';
      state.winner = solvent.length === 1 ? solvent[0]!.id : null;
      state.phase = 'end';
    }
  }

  private minHousesInGroup(state: MonopolyGameState, color: PropertyColor): number {
    let min = MAX_HOUSES;
    for (const space of BOARD) {
      if (space.type === 'street' && space.color === color) {
        const h = state.properties[space.index]!.houses;
        if (h < min) min = h;
      }
    }
    return min;
  }

  private groupHasMortgage(state: MonopolyGameState, color: PropertyColor): boolean {
    for (const space of BOARD) {
      if (space.type === 'street' && space.color === color) {
        if (state.properties[space.index]!.mortgaged) return true;
      }
    }
    return false;
  }

  /** Advance the turn to the next non-bankrupt player. */
  private advanceTurn(state: MonopolyGameState): void {
    const ids = state.players.map((p) => p.id);
    const start = ids.indexOf(state.turn);
    for (let step = 1; step <= ids.length; step++) {
      const candidate = state.players[(start + step) % ids.length]!;
      if (!candidate.bankrupt) {
        state.turn = candidate.id;
        state.phase = 'roll';
        return;
      }
    }
    // No other solvent player — game is over.
    this.checkWin(state);
  }
}
