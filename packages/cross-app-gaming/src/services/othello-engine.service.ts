// ============================================================================
// Cross-App Gaming - Reversi / Othello Game Engine (pure rules logic)
// ============================================================================
//
// A complete, standard 8x8 Reversi (Othello) rules engine implemented as PURE,
// deterministic logic so it can be hosted by ANY Quant app (QuantNeon,
// QuantChat, QuantMax, ...) and unit-tested exhaustively.
//
// Othello is a perfect-information game (no hidden state, no randomness), so —
// unlike Uno/Ludo/Monopoly — there is nothing to inject: every outcome is a
// pure function of the moves played.
//
// Design constraints (mirroring the rest of this package):
//   - NO Prisma, NO I/O, NO @quant/server-core dependency.
//   - State is a serializable plain object. Public mutating methods clone the
//     state and return a NEW state, so callers always get a fresh value and the
//     input is never mutated.
//   - Illegal operations throw a local `OthelloError` carrying a stable `code`.

/** Stable error codes for every illegal Othello operation. */
export type OthelloErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  | 'INVALID_CELL'
  | 'CELL_TAKEN'
  | 'ILLEGAL_MOVE';

/** Raised on any illegal Othello operation; carries an HTTP-mappable statusCode. */
export class OthelloError extends Error {
  readonly statusCode = 400;
  constructor(
    message: string,
    readonly code: OthelloErrorCode,
  ) {
    super(message);
    this.name = 'OthelloError';
  }
}

/** A disc is Black ('B', moves first) or White ('W'); empty cells are null. */
export type Disc = 'B' | 'W';
export type Cell = Disc | null;

/** A board coordinate `[row, col]`. */
export type Coord = readonly [number, number];

export interface OthelloMove {
  playerId: string;
  disc: Disc;
  row: number;
  col: number;
  /** Coordinates of opponent discs flipped by this move. */
  flipped: Coord[];
}

export interface OthelloGameState {
  /** Exactly two players; index 0 plays Black ('B') and moves first. */
  players: [string, string];
  board: Cell[][];
  /** playerId whose turn it is (while active). */
  turn: string;
  status: 'active' | 'finished';
  winner: string | null;
  isDraw: boolean;
  /** Disc counts for quick scoreboards. */
  score: { B: number; W: number };
  /** Number of times the turn was auto-passed (no legal move) most recently. */
  lastWasPass: boolean;
  lastMove: OthelloMove | null;
}

/** A public view — identical to the state (Othello is perfect information). */
export type OthelloPublicState = OthelloGameState;

const SIZE = 8;

/** The eight straight-line directions as `[dRow, dCol]`. */
const DIRECTIONS: ReadonlyArray<Coord> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => [...row]);
}

function cloneState(state: OthelloGameState): OthelloGameState {
  return {
    players: [state.players[0], state.players[1]],
    board: cloneBoard(state.board),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    isDraw: state.isDraw,
    score: { B: state.score.B, W: state.score.W },
    lastWasPass: state.lastWasPass,
    lastMove: state.lastMove
      ? { ...state.lastMove, flipped: state.lastMove.flipped.map(([r, c]) => [r, c] as const) }
      : null,
  };
}

function opponent(disc: Disc): Disc {
  return disc === 'B' ? 'W' : 'B';
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function countDiscs(board: Cell[][]): { B: number; W: number } {
  let B = 0;
  let W = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === 'B') B += 1;
      else if (cell === 'W') W += 1;
    }
  }
  return { B, W };
}

/**
 * The Reversi/Othello rules engine. Construct once and drive a game through
 * `createGame` / `placeDisc`. Every public method returns a fresh state and
 * never mutates its input.
 */
export class OthelloEngine {
  /**
   * Deal a new game. Requires exactly two unique players (index 0 plays Black
   * and moves first). The board starts with the standard four center discs.
   */
  createGame(playerIds: string[]): OthelloGameState {
    if (playerIds.length !== 2) {
      throw new OthelloError('Othello requires exactly 2 players', 'INVALID_PLAYER_COUNT');
    }
    if (playerIds[0] === playerIds[1]) {
      throw new OthelloError('player ids must be unique', 'INVALID_PLAYER_COUNT');
    }

    const board: Cell[][] = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => null as Cell),
    );
    // Standard Othello opening (0-indexed): center 2x2 diagonal.
    board[3]![3] = 'W';
    board[3]![4] = 'B';
    board[4]![3] = 'B';
    board[4]![4] = 'W';

    return {
      players: [playerIds[0]!, playerIds[1]!],
      board,
      turn: playerIds[0]!,
      status: 'active',
      winner: null,
      isDraw: false,
      score: countDiscs(board),
      lastWasPass: false,
      lastMove: null,
    };
  }

  /**
   * Place the current player's disc at (`row`,`col`). The move must flank at
   * least one straight line of opponent discs terminated by the player's own
   * disc; all flanked discs flip. After the move the turn passes to the
   * opponent — unless the opponent has no legal move (then it passes back), and
   * if neither player can move the game ends with the disc-majority winner.
   */
  placeDisc(state: OthelloGameState, playerId: string, row: number, col: number): OthelloGameState {
    if (state.status === 'finished') {
      throw new OthelloError('the game is already over', 'GAME_OVER');
    }
    if (state.turn !== playerId) {
      throw new OthelloError('it is not your turn', 'NOT_YOUR_TURN');
    }
    if (!Number.isInteger(row) || !Number.isInteger(col) || !inBounds(row, col)) {
      throw new OthelloError('cell out of bounds', 'INVALID_CELL');
    }
    if (state.board[row]![col] !== null) {
      throw new OthelloError('that cell is already taken', 'CELL_TAKEN');
    }

    const disc = this.discFor(state, playerId);
    const flips = this.flipsFor(state.board, row, col, disc);
    if (flips.length === 0) {
      throw new OthelloError('that move flips nothing and is illegal', 'ILLEGAL_MOVE');
    }

    const next = cloneState(state);
    next.board[row]![col] = disc;
    for (const [r, c] of flips) {
      next.board[r]![c] = disc;
    }
    next.score = countDiscs(next.board);
    next.lastMove = { playerId, disc, row, col, flipped: flips };

    // Advance the turn, handling passes and game end.
    const opponentId = next.players[next.players[0] === playerId ? 1 : 0];
    const oppDisc = opponent(disc);
    if (this.hasLegalMove(next.board, oppDisc)) {
      next.turn = opponentId;
      next.lastWasPass = false;
    } else if (this.hasLegalMove(next.board, disc)) {
      // Opponent has no move and is skipped; the mover goes again.
      next.turn = playerId;
      next.lastWasPass = true;
    } else {
      this.finish(next);
    }
    return next;
  }

  /** Legal moves for `playerId` (defaults to whoever is to move) as `[row,col]`. */
  legalMoves(state: OthelloGameState, playerId?: string): Coord[] {
    if (state.status === 'finished') return [];
    const id = playerId ?? state.turn;
    const disc = this.discFor(state, id);
    const moves: Coord[] = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (state.board[r]![c] === null && this.flipsFor(state.board, r, c, disc).length > 0) {
          moves.push([r, c]);
        }
      }
    }
    return moves;
  }

  /** A public view of the game (perfect information — returns a fresh clone). */
  getPublicState(state: OthelloGameState): OthelloPublicState {
    return cloneState(state);
  }

  // --- internal helpers -----------------------------------------------------

  private discFor(state: OthelloGameState, playerId: string): Disc {
    return state.players[0] === playerId ? 'B' : 'W';
  }

  /**
   * All opponent discs that would flip if `disc` were placed at (`row`,`col`).
   * A line flips when it is one-or-more opponent discs immediately followed by
   * one of the player's own discs (with no gaps / edges in between).
   */
  private flipsFor(board: Cell[][], row: number, col: number, disc: Disc): Coord[] {
    if (board[row]![col] !== null) return [];
    const opp = opponent(disc);
    const flips: Coord[] = [];
    for (const [dr, dc] of DIRECTIONS) {
      const line: Coord[] = [];
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c) && board[r]![c] === opp) {
        line.push([r, c]);
        r += dr;
        c += dc;
      }
      // The run of opponent discs must be capped by our own disc to flip.
      if (line.length > 0 && inBounds(r, c) && board[r]![c] === disc) {
        flips.push(...line);
      }
    }
    return flips;
  }

  private hasLegalMove(board: Cell[][], disc: Disc): boolean {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r]![c] === null && this.flipsFor(board, r, c, disc).length > 0) {
          return true;
        }
      }
    }
    return false;
  }

  private finish(state: OthelloGameState): void {
    state.status = 'finished';
    state.lastWasPass = false;
    const { B, W } = state.score;
    if (B > W) {
      state.winner = state.players[0];
    } else if (W > B) {
      state.winner = state.players[1];
    } else {
      state.isDraw = true;
      state.winner = null;
    }
  }
}
