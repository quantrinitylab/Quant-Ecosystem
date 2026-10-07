// ============================================================================
// Cross-App Gaming - Uno Game Engine (pure rules logic)
// ============================================================================
//
// A complete, standard 108-card Uno rules engine implemented as PURE,
// deterministic logic so it can be hosted by ANY Quant app (QuantNeon,
// QuantChat, QuantMax, ...) and unit-tested exhaustively.
//
// Design constraints (mirroring the rest of this package):
//   - NO Prisma, NO I/O, NO @quant/server-core dependency.
//   - All randomness is INJECTABLE: the constructor takes an optional `shuffle`
//     function. It defaults to a Fisher-Yates shuffle backed by Math.random.
//     This is a GAME deck shuffle (not a security primitive), so Math.random is
//     acceptable as the default; tests inject a deterministic shuffle so every
//     outcome can be asserted exactly.
//   - State is a serializable plain object. Public mutating methods clone the
//     state and return a NEW state, so callers always get a fresh value and the
//     input is never mutated.
//   - Illegal operations throw a local `UnoError` carrying a stable `code`.

/** Stable error codes for every illegal Uno operation. */
export type UnoErrorCode =
  | 'NOT_YOUR_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'ILLEGAL_PLAY'
  | 'COLOR_REQUIRED'
  | 'GAME_OVER'
  | 'INVALID_PLAYER_COUNT';

/** Raised on any illegal Uno operation; carries an HTTP-mappable statusCode. */
export class UnoError extends Error {
  readonly statusCode = 400;
  constructor(
    message: string,
    readonly code: UnoErrorCode,
  ) {
    super(message);
    this.name = 'UnoError';
  }
}

export type UnoColor = 'red' | 'yellow' | 'green' | 'blue';

export type UnoNumberValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type UnoActionValue = 'skip' | 'reverse' | 'draw_two';
export type UnoWildValue = 'wild' | 'wild_draw_four';
export type UnoValue = UnoNumberValue | UnoActionValue | UnoWildValue;

/** A single card. Wild cards have `color: null` until played. */
export interface UnoCard {
  id: string;
  /** null only for `wild` / `wild_draw_four` cards. */
  color: UnoColor | null;
  value: UnoValue;
}

export interface UnoPlayer {
  id: string;
  hand: UnoCard[];
}

export interface UnoAction {
  type: 'deal' | 'play' | 'draw';
  playerId: string;
  cardId?: string;
  card?: UnoCard;
  chosenColor?: UnoColor;
  /** Number of cards an opponent was forced to draw by this action. */
  forcedDraw?: number;
}

/** The full, serializable game state. Holds every player's hand. */
export interface UnoGameState {
  players: UnoPlayer[];
  drawPile: UnoCard[];
  /** Last element is the active "top" card. */
  discardPile: UnoCard[];
  currentColor: UnoColor;
  currentValue: UnoValue;
  /** playerId whose turn it is. */
  turn: string;
  direction: 1 | -1;
  status: 'active' | 'finished';
  winner: string | null;
  /** Accumulated stacked draw (always 0 here — draws apply immediately). */
  pendingDraw: number;
  lastAction: UnoAction | null;
}

/** A redacted view: hands collapsed to counts (hands are private per player). */
export interface UnoPublicState {
  players: { id: string; handCount: number }[];
  drawPileCount: number;
  topCard: UnoCard | null;
  currentColor: UnoColor;
  currentValue: UnoValue;
  turn: string;
  direction: 1 | -1;
  status: 'active' | 'finished';
  winner: string | null;
  pendingDraw: number;
  lastAction: UnoAction | null;
}

export type ShuffleFn = (cards: UnoCard[]) => UnoCard[];

export interface CreateGameOptions {
  /** Cards dealt to each player at setup. Defaults to 7 (standard Uno). */
  handSize?: number;
}

const COLORS: readonly UnoColor[] = ['red', 'yellow', 'green', 'blue'];
const COLOR_SET: ReadonlySet<string> = new Set(COLORS);
const DEFAULT_HAND_SIZE = 7;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

/** True for the two colorless wild card values. */
export function isWildValue(value: UnoValue): value is UnoWildValue {
  return value === 'wild' || value === 'wild_draw_four';
}

/**
 * Build a fresh, ordered, standard 108-card Uno deck.
 *
 * Per color (red/yellow/green/blue): one 0, two each of 1-9, two each of
 * Skip / Reverse / Draw Two = 25 cards. Four colors = 100. Plus 4 Wild and
 * 4 Wild Draw Four = 108 total. Card ids are deterministic so an identity
 * shuffle yields a fully predictable game.
 */
export function buildDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  for (const color of COLORS) {
    deck.push({ id: `${color}-0`, color, value: '0' });
    for (let n = 1; n <= 9; n++) {
      const value = String(n) as UnoNumberValue;
      deck.push({ id: `${color}-${value}-a`, color, value });
      deck.push({ id: `${color}-${value}-b`, color, value });
    }
    for (const value of ['skip', 'reverse', 'draw_two'] as const) {
      deck.push({ id: `${color}-${value}-a`, color, value });
      deck.push({ id: `${color}-${value}-b`, color, value });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `wild-${i}`, color: null, value: 'wild' });
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `wild_draw_four-${i}`, color: null, value: 'wild_draw_four' });
  }
  return deck;
}

/**
 * Whether `card` may legally be played on top of the given color/value.
 * Wild cards are always playable; otherwise the card must match the active
 * color OR the active value.
 */
export function isPlayable(card: UnoCard, currentColor: UnoColor, currentValue: UnoValue): boolean {
  if (isWildValue(card.value)) return true;
  if (card.color === currentColor) return true;
  if (card.value === currentValue) return true;
  return false;
}

/**
 * Pure turn computation: the playerId `steps` positions away from the current
 * turn, honoring direction. `skip` advances an extra position (used by Skip /
 * Draw Two / Wild Draw Four). Returns the current turn unchanged if the state
 * is not active.
 */
export function nextTurn(state: UnoGameState, options: { skip?: boolean } = {}): string {
  const n = state.players.length;
  const currentIndex = state.players.findIndex((p) => p.id === state.turn);
  if (currentIndex < 0 || n === 0) return state.turn;
  const steps = options.skip ? 2 : 1;
  const idx = advanceIndex(currentIndex, state.direction, steps, n);
  return state.players[idx]!.id;
}

function advanceIndex(currentIndex: number, direction: 1 | -1, steps: number, n: number): number {
  return (((currentIndex + direction * steps) % n) + n) % n;
}

function cloneCard(card: UnoCard): UnoCard {
  return { id: card.id, color: card.color, value: card.value };
}

function cloneState(state: UnoGameState): UnoGameState {
  return {
    players: state.players.map((p) => ({ id: p.id, hand: p.hand.map(cloneCard) })),
    drawPile: state.drawPile.map(cloneCard),
    discardPile: state.discardPile.map(cloneCard),
    currentColor: state.currentColor,
    currentValue: state.currentValue,
    turn: state.turn,
    direction: state.direction,
    status: state.status,
    winner: state.winner,
    pendingDraw: state.pendingDraw,
    lastAction: state.lastAction ? { ...state.lastAction } : null,
  };
}

/**
 * The Uno rules engine. Construct once (optionally with a deterministic
 * `shuffle`) and drive a game through `createGame` / `playCard` / `drawCard`.
 * Every public method returns a fresh state and never mutates its input.
 */
export class UnoEngine {
  private readonly shuffle: ShuffleFn;

  constructor(options: { shuffle?: ShuffleFn } = {}) {
    this.shuffle = options.shuffle ?? defaultShuffle;
  }

  /**
   * Deal a new game: `handSize` cards each (default 7), the first non-wild card
   * becomes the initial discard and sets the starting color/value, and the
   * turn starts with the first player. Throws INVALID_PLAYER_COUNT for fewer
   * than 2 or more than 10 players (or duplicate ids).
   */
  createGame(playerIds: string[], options: CreateGameOptions = {}): UnoGameState {
    if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
      throw new UnoError(
        `Uno requires between ${MIN_PLAYERS} and ${MAX_PLAYERS} players`,
        'INVALID_PLAYER_COUNT',
      );
    }
    if (new Set(playerIds).size !== playerIds.length) {
      throw new UnoError('player ids must be unique', 'INVALID_PLAYER_COUNT');
    }

    const handSize = options.handSize ?? DEFAULT_HAND_SIZE;
    const drawPile = this.shuffle(buildDeck());
    const players: UnoPlayer[] = playerIds.map((id) => ({ id, hand: [] }));

    for (let i = 0; i < handSize; i++) {
      for (const player of players) {
        const card = drawPile.shift();
        if (card) player.hand.push(card);
      }
    }

    // First non-wild card becomes the starting discard. Any wild encountered is
    // moved to the bottom of the draw pile so the deck composition is preserved.
    let initial: UnoCard | undefined;
    while (drawPile.length > 0) {
      const card = drawPile.shift()!;
      if (isWildValue(card.value)) {
        drawPile.push(card);
        continue;
      }
      initial = card;
      break;
    }
    if (!initial || initial.color === null) {
      // Should be unreachable with a standard deck + valid hand sizes.
      throw new UnoError('unable to place a starting card', 'INVALID_PLAYER_COUNT');
    }

    const firstPlayer = players[0]!;
    return {
      players,
      drawPile,
      discardPile: [initial],
      currentColor: initial.color,
      currentValue: initial.value,
      turn: firstPlayer.id,
      direction: 1,
      status: 'active',
      winner: null,
      pendingDraw: 0,
      lastAction: { type: 'deal', playerId: firstPlayer.id, card: cloneCard(initial) },
    };
  }

  /**
   * Play `cardId` from `playerId`'s hand. Validates turn ownership, card
   * possession and legality, applies the card's effect (color/value change,
   * skip, reverse, forced draws, wild color choice), advances the turn and
   * detects a win when the hand empties.
   */
  playCard(
    state: UnoGameState,
    playerId: string,
    cardId: string,
    chosenColor?: UnoColor,
  ): UnoGameState {
    if (state.status === 'finished') {
      throw new UnoError('the game is already over', 'GAME_OVER');
    }
    if (state.turn !== playerId) {
      throw new UnoError('it is not your turn', 'NOT_YOUR_TURN');
    }

    const next = cloneState(state);
    const n = next.players.length;
    const playerIndex = next.players.findIndex((p) => p.id === playerId);
    const player = next.players[playerIndex]!;

    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex < 0) {
      throw new UnoError('card is not in your hand', 'CARD_NOT_IN_HAND');
    }
    const card = player.hand[cardIndex]!;

    if (!isPlayable(card, next.currentColor, next.currentValue)) {
      throw new UnoError('that card cannot be played right now', 'ILLEGAL_PLAY');
    }

    const wild = isWildValue(card.value);
    if (wild && (chosenColor === undefined || !COLOR_SET.has(chosenColor))) {
      throw new UnoError('a wild card requires a chosen color', 'COLOR_REQUIRED');
    }

    // Remove the card from the hand and place it on the discard pile.
    player.hand.splice(cardIndex, 1);
    next.discardPile.push(cloneCard(card));

    // Update the active color / value.
    next.currentColor = wild ? (chosenColor as UnoColor) : (card.color as UnoColor);
    next.currentValue = card.value;

    // Determine direction change, how far the turn advances and forced draws.
    let direction = next.direction;
    let steps = 1;
    let forcedDraw = 0;
    switch (card.value) {
      case 'skip':
        steps = 2;
        break;
      case 'reverse':
        direction = (direction * -1) as 1 | -1;
        // In a 2-player game, Reverse acts like Skip (turn returns to player).
        steps = n === 2 ? 2 : 1;
        break;
      case 'draw_two':
        forcedDraw = 2;
        steps = 2;
        break;
      case 'wild_draw_four':
        forcedDraw = 4;
        steps = 2;
        break;
      default:
        steps = 1;
    }
    next.direction = direction;

    // Apply forced draws to the immediately-next player (who is then skipped).
    if (forcedDraw > 0) {
      const targetIndex = advanceIndex(playerIndex, direction, 1, n);
      const target = next.players[targetIndex]!;
      for (let i = 0; i < forcedDraw; i++) {
        const drawn = this.drawOne(next);
        if (drawn) target.hand.push(drawn);
      }
    }

    next.lastAction = {
      type: 'play',
      playerId,
      cardId,
      card: cloneCard(card),
      ...(wild ? { chosenColor: chosenColor as UnoColor } : {}),
      ...(forcedDraw > 0 ? { forcedDraw } : {}),
    };

    // Win detection: an empty hand ends the game immediately.
    if (player.hand.length === 0) {
      next.status = 'finished';
      next.winner = playerId;
      return next;
    }

    next.turn = next.players[advanceIndex(playerIndex, direction, steps, n)]!.id;
    return next;
  }

  /**
   * Draw a single card for `playerId`. When the draw pile is empty it is
   * replenished by reshuffling the discard pile (minus its top card) via the
   * injected shuffle. Drawing ends the turn.
   */
  drawCard(state: UnoGameState, playerId: string): UnoGameState {
    if (state.status === 'finished') {
      throw new UnoError('the game is already over', 'GAME_OVER');
    }
    if (state.turn !== playerId) {
      throw new UnoError('it is not your turn', 'NOT_YOUR_TURN');
    }

    const next = cloneState(state);
    const playerIndex = next.players.findIndex((p) => p.id === playerId);
    const player = next.players[playerIndex]!;

    const drawn = this.drawOne(next);
    if (drawn) player.hand.push(drawn);

    next.lastAction = {
      type: 'draw',
      playerId,
      ...(drawn ? { card: cloneCard(drawn) } : {}),
    };

    next.turn = nextTurn(next);
    return next;
  }

  /** Redacted view with hands collapsed to counts. */
  publicState(state: UnoGameState): UnoPublicState {
    return {
      players: state.players.map((p) => ({ id: p.id, handCount: p.hand.length })),
      drawPileCount: state.drawPile.length,
      topCard: state.discardPile.length
        ? cloneCard(state.discardPile[state.discardPile.length - 1]!)
        : null,
      currentColor: state.currentColor,
      currentValue: state.currentValue,
      turn: state.turn,
      direction: state.direction,
      status: state.status,
      winner: state.winner,
      pendingDraw: state.pendingDraw,
      lastAction: state.lastAction ? { ...state.lastAction } : null,
    };
  }

  // --- internals -----------------------------------------------------------

  /** Draw the top card, reshuffling the discard pile in when the deck is empty. */
  private drawOne(state: UnoGameState): UnoCard | null {
    if (state.drawPile.length === 0) {
      this.reshuffleDiscard(state);
    }
    return state.drawPile.shift() ?? null;
  }

  /** Move the discard pile (except its top card) back into a shuffled draw pile. */
  private reshuffleDiscard(state: UnoGameState): void {
    if (state.discardPile.length <= 1) return;
    const top = state.discardPile[state.discardPile.length - 1]!;
    const rest = state.discardPile.slice(0, -1);
    state.discardPile = [top];
    state.drawPile = this.shuffle(rest);
  }
}

/** Default in-place-safe Fisher-Yates shuffle backed by Math.random (game-only). */
function defaultShuffle(cards: UnoCard[]): UnoCard[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
