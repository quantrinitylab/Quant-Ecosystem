// ============================================================================
// Cross-App Gaming - Ludo Rules Engine (PURE deterministic logic)
// ============================================================================
//
// A complete, standard 4-player Ludo rules engine implemented as PURE LOGIC:
// no Prisma, no IO, no @quant/server-core. Every method clones its input and
// returns a NEW immutable state, so callers can persist / replay / diff freely.
// Randomness (the dice) is injected and defaults to Math.random, exactly like
// the other engines in this package, so tests can drive an EXACT dice sequence
// and assert deterministic outcomes.
//
// ---------------------------------------------------------------------------
// BOARD MODEL (per-token relative "progress")
// ---------------------------------------------------------------------------
// The board is the standard 52-square shared ring + a 6-square home column per
// player + 4 yard slots per player. Rather than track raw board coordinates we
// track, for every token, a single relative `progress` value measured from that
// token's own start square:
//
//   progress === null  -> token is in its YARD (not yet released)
//   progress 0..50     -> token is on the shared RING (51 squares walked,
//                         0 === the player's coloured start square)
//   progress 51..56    -> token is in its private 6-square HOME COLUMN
//   progress === 56    -> token has FINISHED (reached final home)
//
// The absolute ring square for a token is `(startOffset[color] + progress) % 52`
// while `progress <= 50`. Home-column squares (51..56) are private to each
// colour, so no capture can ever happen there.
//
// START OFFSETS (where each colour joins the ring): red 0, green 13,
// yellow 26, blue 39 — the standard equidistant quadrant entries.
//
// ---------------------------------------------------------------------------
// RULES IMPLEMENTED (standard Ludo)
// ---------------------------------------------------------------------------
// - A token leaves the yard ONLY on a roll of 6, landing on its start square
//   (progress 0).
// - Rolling a 6 grants an extra turn, BUT three consecutive 6s in one turn
//   forfeits the turn (no move is applied on the third six).
// - A token advances exactly `dice` steps. To finish it must land EXACTLY on
//   progress 56; any roll that would overshoot 56 is ILLEGAL.
// - CAPTURE: landing on a ring square occupied by EXACTLY ONE opponent token
//   sends that opponent token back to its yard — UNLESS the square is one of
//   the 8 standard SAFE squares {0, 8, 13, 21, 26, 34, 39, 47} (each colour's
//   start + the four star squares).
// - STACKING / BLOCKS: we ALLOW stacking. Two-or-more same-owner tokens on one
//   square form a "block" that cannot be captured (capture only fires against a
//   LONE opponent token). Stacking never blocks passage — kept deliberately
//   simple, as permitted by the brief.
// - WIN: a player wins when ALL 4 of their tokens have finished (progress 56);
//   status becomes 'finished' and `winner` is set.
//
// ---------------------------------------------------------------------------
// API (two-step, deterministic)
// ---------------------------------------------------------------------------
//   createGame(playerIds, options?) -> LudoGameState
//   rollDice(state, playerId)       -> { state, dice, legalMoves }
//   moveToken(state, playerId, tokenId) -> LudoGameState
//   publicState(state)              -> LudoPublicState (serializable view)
//
// `rollDice` rolls for the current player and returns the legal moves for that
// roll. If there are NO legal moves (or a third consecutive six), it advances
// the turn itself and returns an empty `legalMoves`. Otherwise the caller must
// follow up with `moveToken`, passing one of the returned token ids.

/** Raised on invalid input / illegal action; carries an HTTP-mappable code. */
export class LudoError extends Error {
  readonly statusCode = 400;
  constructor(
    message: string,
    readonly code: LudoErrorCode,
  ) {
    super(message);
    this.name = 'LudoError';
  }
}

export type LudoErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'DUPLICATE_PLAYER'
  | 'INVALID_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'NO_ROLL'
  | 'ALREADY_ROLLED'
  | 'ILLEGAL_MOVE'
  | 'TOKEN_NOT_FOUND'
  | 'GAME_OVER'
  | 'INVALID_DICE';

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

/** Where a token currently sits, derived from its `progress`. */
export type LudoTokenLocation = 'yard' | 'track' | 'home' | 'finished';

export interface LudoPlayer {
  id: string;
  color: LudoColor;
}

export interface LudoToken {
  id: string;
  playerId: string;
  color: LudoColor;
  /** Stable 0..3 index of this token within its owner. */
  index: number;
  /** null = yard, 0..50 = ring, 51..55 = home column, 56 = finished. */
  progress: number | null;
}

export interface LudoGameState {
  players: LudoPlayer[];
  tokens: LudoToken[];
  currentPlayerIndex: number;
  status: 'active' | 'finished';
  winner: string | null;
  /** The dice value awaiting a `moveToken`, or null when a roll is required. */
  lastRoll: number | null;
  /** Consecutive 6s rolled so far in the current player's turn sequence. */
  consecutiveSixes: number;
}

export interface LudoLegalMove {
  tokenId: string;
  /** Source progress (null when releasing from the yard). */
  from: number | null;
  /** Destination progress (0..56). */
  to: number;
  kind: 'release' | 'advance' | 'finish';
  /** Id of the opponent token this move would capture, or null. */
  captures: string | null;
}

export interface LudoRollResult {
  state: LudoGameState;
  dice: number;
  legalMoves: LudoLegalMove[];
}

export interface LudoPublicToken {
  id: string;
  playerId: string;
  color: LudoColor;
  index: number;
  location: LudoTokenLocation;
  progress: number | null;
  /** Absolute ring square (0..51) while on the ring, else null. */
  square: number | null;
}

export interface LudoPublicState {
  players: LudoPlayer[];
  currentPlayerId: string;
  status: 'active' | 'finished';
  winner: string | null;
  lastRoll: number | null;
  consecutiveSixes: number;
  tokens: LudoPublicToken[];
}

export interface CreateGameOptions {
  /** Optionally start the game on a specific player (must be one of playerIds). */
  startingPlayerId?: string;
}

// --- board constants ---------------------------------------------------------

/** Number of squares on the shared ring. */
const RING_SIZE = 52;
/** Relative progress for the final home square (token has finished). */
const FINISH_PROGRESS = 56;
/** Highest relative progress that is still on the shared ring. */
const LAST_RING_PROGRESS = 50;
/** Seat order -> colour assignment. */
const COLORS: readonly LudoColor[] = ['red', 'green', 'yellow', 'blue'];
/** Where each colour joins the shared ring. */
const START_OFFSETS: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};
/** The 8 standard safe squares: each colour's start + the four star squares. */
const SAFE_SQUARES: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
/** Three consecutive 6s forfeits the turn. */
const MAX_CONSECUTIVE_SIXES = 3;
const TOKENS_PER_PLAYER = 4;

export class LudoEngine {
  private readonly rollFn: () => number;

  constructor(options?: { rollDice?: () => number }) {
    this.rollFn = options?.rollDice ?? (() => Math.floor(Math.random() * 6) + 1);
  }

  // --- lifecycle -----------------------------------------------------------

  /**
   * Create a fresh game with all tokens in the yard. Validates 2..4 unique,
   * non-empty player ids. Colours are assigned by seat order
   * (red, green, yellow, blue).
   */
  createGame(playerIds: string[], options: CreateGameOptions = {}): LudoGameState {
    if (!Array.isArray(playerIds) || playerIds.length < 2 || playerIds.length > 4) {
      throw new LudoError('Ludo requires between 2 and 4 players', 'INVALID_PLAYER_COUNT');
    }
    const cleaned = playerIds.map((id) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new LudoError('player ids must be non-empty strings', 'INVALID_PLAYER');
      }
      return id.trim();
    });
    if (new Set(cleaned).size !== cleaned.length) {
      throw new LudoError('player ids must be unique', 'DUPLICATE_PLAYER');
    }

    const players: LudoPlayer[] = cleaned.map((id, seat) => ({
      id,
      color: COLORS[seat] as LudoColor,
    }));

    const tokens: LudoToken[] = [];
    for (const player of players) {
      for (let i = 0; i < TOKENS_PER_PLAYER; i++) {
        tokens.push({
          id: `${player.id}-t${i}`,
          playerId: player.id,
          color: player.color,
          index: i,
          progress: null,
        });
      }
    }

    let currentPlayerIndex = 0;
    if (options.startingPlayerId !== undefined) {
      const idx = players.findIndex((p) => p.id === options.startingPlayerId);
      if (idx === -1) {
        throw new LudoError('startingPlayerId is not a player in this game', 'INVALID_PLAYER');
      }
      currentPlayerIndex = idx;
    }

    return {
      players,
      tokens,
      currentPlayerIndex,
      status: 'active',
      winner: null,
      lastRoll: null,
      consecutiveSixes: 0,
    };
  }

  // --- turn actions --------------------------------------------------------

  /**
   * Roll the dice for `playerId` (must be the current player). Returns a NEW
   * state together with the rolled value and the legal moves for it.
   *
   * - If a third consecutive six is rolled, the turn is forfeited (no move) and
   *   the turn advances; `legalMoves` is empty.
   * - If there are no legal moves for the roll, the turn advances (or, on a
   *   playable six, the player would simply have nothing to do) and
   *   `legalMoves` is empty.
   * - Otherwise the roll is stored on the state and the caller must follow up
   *   with `moveToken`.
   */
  rollDice(state: LudoGameState, playerId: string): LudoRollResult {
    this.assertActive(state);
    this.assertCurrentPlayer(state, playerId);
    if (state.lastRoll !== null) {
      throw new LudoError('a move is already pending for the last roll', 'ALREADY_ROLLED');
    }

    const dice = this.rollFn();
    if (!Number.isInteger(dice) || dice < 1 || dice > 6) {
      throw new LudoError(`dice roll out of range: ${String(dice)}`, 'INVALID_DICE');
    }

    const next = cloneState(state);
    const isSix = dice === 6;
    const consecutiveSixes = isSix ? next.consecutiveSixes + 1 : 0;

    // Third consecutive six -> forfeit the whole turn, no move applied.
    if (isSix && consecutiveSixes >= MAX_CONSECUTIVE_SIXES) {
      advanceTurn(next);
      return { state: next, dice, legalMoves: [] };
    }

    const legalMoves = this.computeLegalMoves(next, dice);
    if (legalMoves.length === 0) {
      // Nothing to do this roll — turn passes (even on a six with no moves).
      advanceTurn(next);
      return { state: next, dice, legalMoves: [] };
    }

    next.lastRoll = dice;
    next.consecutiveSixes = consecutiveSixes;
    return { state: next, dice, legalMoves };
  }

  /**
   * Apply the move of `tokenId` for the previously rolled dice. Validates turn,
   * that a roll is pending, token ownership, and that the move is legal for the
   * last roll. Applies movement + capture, grants an extra turn on a 6, and
   * otherwise advances the turn. Returns a NEW state.
   */
  moveToken(state: LudoGameState, playerId: string, tokenId: string): LudoGameState {
    this.assertActive(state);
    this.assertCurrentPlayer(state, playerId);
    if (state.lastRoll === null) {
      throw new LudoError('you must roll the dice before moving', 'NO_ROLL');
    }

    const owned = state.tokens.find((t) => t.id === tokenId && t.playerId === playerId);
    if (!owned) {
      throw new LudoError(`token not found for player: ${tokenId}`, 'TOKEN_NOT_FOUND');
    }

    const dice = state.lastRoll;
    const legal = this.computeLegalMoves(state, dice).find((m) => m.tokenId === tokenId);
    if (!legal) {
      throw new LudoError('that token cannot make a legal move for the roll', 'ILLEGAL_MOVE');
    }

    const next = cloneState(state);
    const moving = next.tokens.find((t) => t.id === tokenId) as LudoToken;
    moving.progress = legal.to;

    if (legal.captures) {
      const victim = next.tokens.find((t) => t.id === legal.captures) as LudoToken;
      victim.progress = null; // sent back to the yard
    }

    // Win check: all of this player's tokens have finished.
    const finishedAll = next.tokens
      .filter((t) => t.playerId === playerId)
      .every((t) => t.progress === FINISH_PROGRESS);
    if (finishedAll) {
      next.status = 'finished';
      next.winner = playerId;
      next.lastRoll = null;
      next.consecutiveSixes = 0;
      return next;
    }

    if (dice === 6) {
      // Extra turn: same player rolls again. Keep the six-streak running so a
      // third consecutive six still forfeits, but require a fresh roll.
      next.lastRoll = null;
    } else {
      advanceTurn(next);
    }
    return next;
  }

  // --- views ---------------------------------------------------------------

  /** A serializable, derived view safe to send to clients. */
  publicState(state: LudoGameState): LudoPublicState {
    const current = state.players[state.currentPlayerIndex] as LudoPlayer;
    return {
      players: state.players.map((p) => ({ ...p })),
      currentPlayerId: current.id,
      status: state.status,
      winner: state.winner,
      lastRoll: state.lastRoll,
      consecutiveSixes: state.consecutiveSixes,
      tokens: state.tokens.map((t) => ({
        id: t.id,
        playerId: t.playerId,
        color: t.color,
        index: t.index,
        location: locationOf(t.progress),
        progress: t.progress,
        square: absoluteSquare(t.color, t.progress),
      })),
    };
  }

  // --- internals -----------------------------------------------------------

  /** Legal moves for the CURRENT player given a `dice` value. */
  private computeLegalMoves(state: LudoGameState, dice: number): LudoLegalMove[] {
    const player = state.players[state.currentPlayerIndex] as LudoPlayer;
    const moves: LudoLegalMove[] = [];

    for (const token of state.tokens) {
      if (token.playerId !== player.id) continue;

      if (token.progress === null) {
        // Only a six releases a token from the yard, onto its start square.
        if (dice === 6) {
          moves.push({
            tokenId: token.id,
            from: null,
            to: 0,
            kind: 'release',
            captures: findCaptureTarget(state, token, 0),
          });
        }
        continue;
      }

      const to = token.progress + dice;
      if (to > FINISH_PROGRESS) continue; // overshoot is illegal

      moves.push({
        tokenId: token.id,
        from: token.progress,
        to,
        kind: to === FINISH_PROGRESS ? 'finish' : 'advance',
        captures: findCaptureTarget(state, token, to),
      });
    }

    return moves;
  }

  private assertActive(state: LudoGameState): void {
    if (state.status === 'finished') {
      throw new LudoError('the game is already finished', 'GAME_OVER');
    }
  }

  private assertCurrentPlayer(state: LudoGameState, playerId: string): void {
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id !== playerId) {
      throw new LudoError('it is not your turn', 'NOT_YOUR_TURN');
    }
  }
}

// --- module-private helpers --------------------------------------------------

/** Deep clone of a game state (plain data only). */
function cloneState(state: LudoGameState): LudoGameState {
  return {
    players: state.players.map((p) => ({ ...p })),
    tokens: state.tokens.map((t) => ({ ...t })),
    currentPlayerIndex: state.currentPlayerIndex,
    status: state.status,
    winner: state.winner,
    lastRoll: state.lastRoll,
    consecutiveSixes: state.consecutiveSixes,
  };
}

/** Advance to the next player and reset per-turn roll bookkeeping. */
function advanceTurn(state: LudoGameState): void {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.lastRoll = null;
  state.consecutiveSixes = 0;
}

/** Absolute ring square for a token, or null when off the ring. */
function absoluteSquare(color: LudoColor, progress: number | null): number | null {
  if (progress === null || progress > LAST_RING_PROGRESS) return null;
  return (START_OFFSETS[color] + progress) % RING_SIZE;
}

function locationOf(progress: number | null): LudoTokenLocation {
  if (progress === null) return 'yard';
  if (progress === FINISH_PROGRESS) return 'finished';
  if (progress > LAST_RING_PROGRESS) return 'home';
  return 'track';
}

/**
 * If `mover` lands on `toProgress`, return the id of an opponent token it would
 * capture, or null. Capture only fires against a LONE opponent token on a
 * non-safe ring square; a 2+ same-owner stack (a block) is protected.
 */
function findCaptureTarget(
  state: LudoGameState,
  mover: LudoToken,
  toProgress: number,
): string | null {
  if (toProgress > LAST_RING_PROGRESS) return null; // home column: never captures
  const square = absoluteSquare(mover.color, toProgress);
  if (square === null) return null;
  if (SAFE_SQUARES.has(square)) return null;

  const opponents = state.tokens.filter(
    (t) => t.playerId !== mover.playerId && absoluteSquare(t.color, t.progress) === square,
  );
  return opponents.length === 1 && opponents[0] ? opponents[0].id : null;
}
