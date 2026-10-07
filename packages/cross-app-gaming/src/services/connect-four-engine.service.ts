// ============================================================================
// Cross-App Gaming - Connect Four Game Engine (pure rules logic)
// ============================================================================
//
// A complete, standard 7x6 Connect Four rules engine implemented as PURE,
// deterministic logic so it can be hosted by ANY Quant app (QuantNeon,
// QuantChat, QuantMax, ...) and unit-tested exhaustively.
//
// Connect Four is a perfect-information game (no hidden state, no randomness),
// so — unlike Uno/Ludo/Monopoly — there is nothing to inject: every outcome is
// a pure function of the moves played.
//
// Design constraints (mirroring the rest of this package):
//   - NO Prisma, NO I/O, NO @quant/server-core dependency.
//   - State is a serializable plain object. Public mutating methods clone the
//     state and return a NEW state, so callers always get a fresh value and the
//     input is never mutated.
//   - Illegal operations throw a local `ConnectFourError` carrying a stable
//     `code`.

/** Stable error codes for every illegal Connect Four operation. */
export type ConnectFourErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  | 'INVALID_COLUMN'
  | 'COLUMN_FULL';

/** Raised on any illegal Connect Four operation; carries an HTTP-mappable statusCode. */
export class ConnectFourError extends Error {
  readonly statusCode = 400;
  constructor(
    message: string,
    readonly code: ConnectFourErrorCode,
  ) {
    super(message);
    this.name = 'ConnectFourError';
  }
}

/** A disc belongs to player 1 ('R') or player 2 ('Y'); empty cells are null. */
export type Disc = 'R' | 'Y';
export type Cell = Disc | null;

export interface ConnectFourMove {
  playerId: string;
  disc: Disc;
  column: number;
  row: number;
}

/**
 * The full, serializable game state.
 *
 * `board` is row-major with `board[0]` = the BOTTOM row (where discs settle) and
 * `board[ROWS-1]` = the top row. `board[r][c]` is the cell at row `r`, column `c`.
 */
export interface ConnectFourGameState {
  /** Exactly two players; index 0 plays 'R', index 1 plays 'Y'. */
  players: [string, string];
  board: Cell[][];
  /** playerId whose turn it is (while active). */
  turn: string;
  status: 'active' | 'finished';
  winner: string | null;
  isDraw: boolean;
  /** Discs-in-a-row required to win (standard 4). */
  connect: number;
  /** The four winning coordinates `[row, col]` when won, else null. */
  winningLine: ReadonlyArray<readonly [number, number]> | null;
  lastMove: ConnectFourMove | null;
}

/** A public view — identical to the state (Connect Four is perfect information). */
export type ConnectFourPublicState = ConnectFourGameState;

export interface CreateGameOptions {
  /** Board width (columns). Defaults to 7 (standard). */
  columns?: number;
  /** Board height (rows). Defaults to 6 (standard). */
  rows?: number;
  /** Discs in a row needed to win. Defaults to 4 (standard). */
  connect?: number;
}

const DEFAULT_COLUMNS = 7;
const DEFAULT_ROWS = 6;
const DEFAULT_CONNECT = 4;
const MIN_DIMENSION = 4;
const MAX_DIMENSION = 12;

/** The four directions to scan for a line: E, N, NE, NW (as [dRow, dCol]). */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal up-right
  [1, -1], // diagonal up-left
];

function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => [...row]);
}

function cloneState(state: ConnectFourGameState): ConnectFourGameState {
  return {
    players: [state.players[0], state.players[1]],
    board: cloneBoard(state.board),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    isDraw: state.isDraw,
    connect: state.connect,
    winningLine: state.winningLine ? state.winningLine.map(([r, c]) => [r, c] as const) : null,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

/**
 * The Connect Four rules engine. Construct once and drive a game through
 * `createGame` / `dropDisc`. Every public method returns a fresh state and
 * never mutates its input.
 */
export class ConnectFourEngine {
  /**
   * Deal a new game. Requires exactly two unique players (index 0 plays 'R',
   * index 1 plays 'Y'). The board starts empty and player 0 moves first.
   */
  createGame(playerIds: string[], options: CreateGameOptions = {}): ConnectFourGameState {
    if (playerIds.length !== 2) {
      throw new ConnectFourError('Connect Four requires exactly 2 players', 'INVALID_PLAYER_COUNT');
    }
    if (playerIds[0] === playerIds[1]) {
      throw new ConnectFourError('player ids must be unique', 'INVALID_PLAYER_COUNT');
    }

    const columns = options.columns ?? DEFAULT_COLUMNS;
    const rows = options.rows ?? DEFAULT_ROWS;
    if (
      columns < MIN_DIMENSION ||
      columns > MAX_DIMENSION ||
      rows < MIN_DIMENSION ||
      rows > MAX_DIMENSION
    ) {
      throw new ConnectFourError(
        `board dimensions must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}`,
        'INVALID_COLUMN',
      );
    }
    const connect = options.connect ?? DEFAULT_CONNECT;
    if (connect < 3 || connect > Math.min(columns, rows)) {
      throw new ConnectFourError(
        'connect length must be between 3 and the smaller board dimension',
        'INVALID_COLUMN',
      );
    }

    const board: Cell[][] = Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => null as Cell),
    );

    return {
      players: [playerIds[0]!, playerIds[1]!],
      board,
      turn: playerIds[0]!,
      status: 'active',
      winner: null,
      isDraw: false,
      connect,
      winningLine: null,
      lastMove: null,
    };
  }

  /**
   * Drop the current player's disc into `column`. The disc settles on the
   * lowest empty row. Validates turn ownership, the column index and that the
   * column is not full; then checks for a win (any `connect`-in-a-row) or a
   * draw (full board) and advances the turn.
   */
  dropDisc(state: ConnectFourGameState, playerId: string, column: number): ConnectFourGameState {
    if (state.status === 'finished') {
      throw new ConnectFourError('the game is already over', 'GAME_OVER');
    }
    if (state.turn !== playerId) {
      throw new ConnectFourError('it is not your turn', 'NOT_YOUR_TURN');
    }
    const cols = state.board[0]!.length;
    if (!Number.isInteger(column) || column < 0 || column >= cols) {
      throw new ConnectFourError(`column must be an integer 0..${cols - 1}`, 'INVALID_COLUMN');
    }

    const next = cloneState(state);
    const row = this.lowestEmptyRow(next.board, column);
    if (row < 0) {
      throw new ConnectFourError('that column is full', 'COLUMN_FULL');
    }

    const playerIndex = next.players[0] === playerId ? 0 : 1;
    const disc: Disc = playerIndex === 0 ? 'R' : 'Y';
    next.board[row]![column] = disc;
    next.lastMove = { playerId, disc, column, row };

    const line = this.findWinningLine(next.board, row, column, disc, next.connect);
    if (line) {
      next.status = 'finished';
      next.winner = playerId;
      next.winningLine = line;
    } else if (this.isBoardFull(next.board)) {
      next.status = 'finished';
      next.isDraw = true;
    } else {
      next.turn = next.players[playerIndex === 0 ? 1 : 0];
    }
    return next;
  }

  /** The columns (0-based) that still have at least one empty cell. */
  legalMoves(state: ConnectFourGameState): number[] {
    if (state.status === 'finished') return [];
    const cols = state.board[0]!.length;
    const moves: number[] = [];
    for (let c = 0; c < cols; c++) {
      if (this.lowestEmptyRow(state.board, c) >= 0) moves.push(c);
    }
    return moves;
  }

  /** A public view of the game (perfect information — returns a fresh clone). */
  getPublicState(state: ConnectFourGameState): ConnectFourPublicState {
    return cloneState(state);
  }

  // --- internal helpers -----------------------------------------------------

  /** Lowest empty row index in `column`, or -1 when the column is full. */
  private lowestEmptyRow(board: Cell[][], column: number): number {
    for (let r = 0; r < board.length; r++) {
      if (board[r]![column] === null) return r;
    }
    return -1;
  }

  private isBoardFull(board: Cell[][]): boolean {
    return board[board.length - 1]!.every((cell) => cell !== null);
  }

  /**
   * From the just-placed disc at (`row`,`col`), look for a run of `connect`
   * matching discs along any of the four axes. Returns the winning coordinates
   * (length `connect`) or null.
   */
  private findWinningLine(
    board: Cell[][],
    row: number,
    col: number,
    disc: Disc,
    connect: number,
  ): Array<readonly [number, number]> | null {
    for (const [dr, dc] of DIRECTIONS) {
      const line: Array<readonly [number, number]> = [[row, col]];
      // Extend forward.
      this.collect(board, row, col, dr, dc, disc, line);
      // Extend backward.
      this.collect(board, row, col, -dr, -dc, disc, line);
      if (line.length >= connect) {
        // Return a contiguous winning window of exactly `connect` cells, sorted.
        const sorted = line.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        return sorted.slice(0, connect);
      }
    }
    return null;
  }

  private collect(
    board: Cell[][],
    row: number,
    col: number,
    dr: number,
    dc: number,
    disc: Disc,
    line: Array<readonly [number, number]>,
  ): void {
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < board.length && c >= 0 && c < board[0]!.length && board[r]![c] === disc) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }
  }
}
