// ============================================================================
// QuantNeon - In-feed Games Service (Prisma-backed, durable)
// ============================================================================
//
// Lets users play quick games with friends from the QuantNeon feed (the
// Instagram "play games in chat/feed" pattern). This is the per-app session
// host for feed-embedded games; cross-app shared sessions/leaderboards
// (@quant/cross-app-gaming) are a follow-up.
//
// Ships one fully-playable, real game (Tic-Tac-Toe) end-to-end: catalog -> start
// -> join -> turn-based moves -> win/draw detection. Other catalog entries are
// honestly marked `coming_soon`.
//
// GAME SESSIONS are now DURABLE: previously the service kept every session in an
// in-memory `Map<string, GameSession>`, so all sessions — and whose turn it was
// — were lost on restart/redeploy and never shared across backend instances.
// This rewrite persists sessions to the Prisma `NeonGameSession` model
// (@@map neon_game_sessions). `board` and `players` are JSON columns, parsed to
// arrays on read and passed as arrays on write.
//
// The game CATALOG and `listGames`/`getGame` remain in-memory/sync (static
// data). Everything that touches a session (`startGame`, `getSession`,
// `listActiveSessions`, `joinGame`, `submitMove`, `leaveGame`) is now ASYNC.
// All game logic (Tic-Tac-Toe win/draw detection, turn advance, forfeit-on-leave,
// auto-start at minPlayers) and every GameError code are preserved EXACTLY; the
// only change is STORAGE.
//
// The Prisma client is injected through a NARROW interface (`NeonGamePrisma`)
// covering only the `neonGameSession` delegate operations this service issues,
// mirroring the repo's established DI pattern (see RoomService /
// PrismaKeyStorage). This keeps the service unit-testable against an in-memory
// fake with no live Postgres. The injectable clock (`now`) is retained.
//
// PLAYABLE ENGINES: Uno, Ludo and Monopoly are now fully playable through this
// host by delegating to the pure rules engines in `@quant/cross-app-gaming`
// (UnoEngine / LudoEngine / MonopolyEngine). Their serializable game state is
// stored in the same `board` JSON column used by Tic-Tac-Toe (the column holds
// the 9-cell array for TTT and the engine state object for the others). Moves
// are dispatched per-game in `submitMove`; engine errors are mapped to
// `GameError` codes. Tic-Tac-Toe's logic is preserved exactly.

import {
  UnoEngine,
  UnoError,
  LudoEngine,
  LudoError,
  MonopolyEngine,
  MonopolyError,
  ConnectFourEngine,
  ConnectFourError,
  OthelloEngine,
  OthelloError,
} from '@quant/cross-app-gaming';
import type {
  UnoColor,
  UnoGameState,
  LudoGameState,
  MonopolyGameState,
  ConnectFourGameState,
  OthelloGameState,
} from '@quant/cross-app-gaming';

export type GameStatus = 'playable' | 'coming_soon';
export type SessionState = 'waiting' | 'active' | 'finished' | 'abandoned';

export interface GameCatalogEntry {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  turnBased: boolean;
  status: GameStatus;
}

export interface GameSession {
  id: string;
  gameId: string;
  host: string;
  players: string[];
  state: SessionState;
  /** userId whose turn it is (turn-based games, while active). */
  turn: string | null;
  /** Tic-Tac-Toe board: 9 cells, each null | 'X' | 'O'. */
  board: (string | null)[];
  /**
   * Serializable engine state for Uno/Ludo/Monopoly sessions (undefined for
   * Tic-Tac-Toe, which uses `board`). Stored in the same `board` JSON column.
   */
  engineState?: unknown;
  winner: string | null;
  isDraw: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class GameError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'GAME_NOT_FOUND'
      | 'GAME_NOT_PLAYABLE'
      | 'SESSION_NOT_FOUND'
      | 'SESSION_FULL'
      | 'SESSION_NOT_ACTIVE'
      | 'NOT_YOUR_TURN'
      | 'INVALID_MOVE'
      | 'ALREADY_JOINED',
  ) {
    super(message);
    this.name = 'GameError';
  }
}

/**
 * A move payload. Tic-Tac-Toe uses `{ cell }`; the engine games use a tagged
 * `type` discriminator routed to the matching engine method in `submitMove`.
 */
export type NeonGameMove =
  | { cell: number } // tic-tac-toe
  | { type: 'uno_play'; cardId: string; chosenColor?: UnoColor }
  | { type: 'uno_draw' }
  | { type: 'ludo_roll' }
  | { type: 'ludo_move'; tokenId: string }
  | { type: 'monopoly_roll' }
  | { type: 'monopoly_buy' }
  | { type: 'monopoly_decline' }
  | { type: 'monopoly_build'; index: number }
  | { type: 'monopoly_end' }
  | { type: 'monopoly_jail_fine' }
  | { type: 'monopoly_jail_card' }
  | { type: 'connect_four_drop'; column: number }
  | { type: 'othello_place'; row: number; col: number };

// ---------------------------------------------------------------------------
// Persisted row shape (the subset of columns this service reads/writes).
// `players` and `board` are JSON columns (stored as arrays).
// ---------------------------------------------------------------------------

/** A persisted `NeonGameSession` row. */
export interface NeonGameSessionRow {
  id: string;
  gameId: string;
  host: string;
  players: unknown;
  state: string;
  turn: string | null;
  board: unknown;
  winner: string | null;
  isDraw: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Narrow view of the Prisma client — exactly the `neonGameSession` delegate
 * operations {@link NeonGamesService} issues. Injected via the constructor so
 * the service can run against the real client in production and an in-memory
 * fake in tests.
 */
export interface NeonGamePrisma {
  neonGameSession: {
    create(args: { data: Record<string, unknown> }): Promise<NeonGameSessionRow>;
    findUnique(args: { where: { id: string } }): Promise<NeonGameSessionRow | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<NeonGameSessionRow>;
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
    }): Promise<NeonGameSessionRow[]>;
  };
}

const CATALOG: GameCatalogEntry[] = [
  {
    id: 'tic-tac-toe',
    name: 'Tic-Tac-Toe',
    description: 'Classic 3x3. First to line up three wins.',
    minPlayers: 2,
    maxPlayers: 2,
    turnBased: true,
    status: 'playable',
  },
  {
    id: 'uno',
    name: 'Uno',
    description: 'Match colors and numbers. First to empty their hand wins.',
    minPlayers: 2,
    maxPlayers: 4,
    turnBased: true,
    status: 'playable',
  },
  {
    id: 'ludo',
    name: 'Ludo',
    description: 'Race all four tokens home. Roll a 6 to leave base.',
    minPlayers: 2,
    maxPlayers: 4,
    turnBased: true,
    status: 'playable',
  },
  {
    id: 'monopoly',
    name: 'Monopoly',
    description: 'Buy property, collect rent, bankrupt your rivals.',
    minPlayers: 2,
    maxPlayers: 4,
    turnBased: true,
    status: 'playable',
  },
  {
    id: 'connect-four',
    name: 'Connect Four',
    description: 'Drop discs and line up four in a row to win.',
    minPlayers: 2,
    maxPlayers: 2,
    turnBased: true,
    status: 'playable',
  },
  {
    id: 'othello',
    name: 'Reversi (Othello)',
    description: 'Flank and flip discs; the majority at the end wins.',
    minPlayers: 2,
    maxPlayers: 2,
    turnBased: true,
    status: 'playable',
  },
];

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export class NeonGamesService {
  private readonly unoEngine: UnoEngine;
  private readonly ludoEngine: LudoEngine;
  private readonly monopolyEngine: MonopolyEngine;
  private readonly connectFourEngine: ConnectFourEngine;
  private readonly othelloEngine: OthelloEngine;

  constructor(
    private readonly prisma: NeonGamePrisma,
    private readonly now: () => Date = () => new Date(),
    engines: {
      uno?: UnoEngine;
      ludo?: LudoEngine;
      monopoly?: MonopolyEngine;
      connectFour?: ConnectFourEngine;
      othello?: OthelloEngine;
    } = {},
  ) {
    this.unoEngine = engines.uno ?? new UnoEngine();
    this.ludoEngine = engines.ludo ?? new LudoEngine();
    this.monopolyEngine = engines.monopoly ?? new MonopolyEngine();
    this.connectFourEngine = engines.connectFour ?? new ConnectFourEngine();
    this.othelloEngine = engines.othello ?? new OthelloEngine();
  }

  // --- Static catalog (in-memory / sync) ----------------------------------

  listGames(): GameCatalogEntry[] {
    return CATALOG.map((g) => ({ ...g }));
  }

  getGame(gameId: string): GameCatalogEntry | undefined {
    return CATALOG.find((g) => g.id === gameId);
  }

  // --- Durable sessions (Prisma-backed / async) ---------------------------

  async listActiveSessions(gameId?: string): Promise<GameSession[]> {
    const where: Record<string, unknown> = { state: { in: ['waiting', 'active'] } };
    if (gameId) where['gameId'] = gameId;
    const rows = await this.prisma.neonGameSession.findMany({ where });
    return rows.map((row) => this.toSession(row));
  }

  async getSession(sessionId: string): Promise<GameSession> {
    const row = await this.prisma.neonGameSession.findUnique({ where: { id: sessionId } });
    if (!row) throw new GameError('Session not found', 'SESSION_NOT_FOUND');
    return this.toSession(row);
  }

  async startGame(gameId: string, hostId: string): Promise<GameSession> {
    const game = this.getGame(gameId);
    if (!game) throw new GameError('Game not found', 'GAME_NOT_FOUND');
    if (game.status !== 'playable') {
      throw new GameError(`${game.name} is not playable yet`, 'GAME_NOT_PLAYABLE');
    }
    const t = this.now();
    const row = await this.prisma.neonGameSession.create({
      data: {
        gameId,
        host: hostId,
        players: [hostId],
        state: 'waiting',
        turn: null,
        board: Array(9).fill(null),
        winner: null,
        isDraw: false,
        createdAt: t,
        updatedAt: t,
      },
    });
    return this.toSession(row);
  }

  async joinGame(sessionId: string, userId: string): Promise<GameSession> {
    const session = await this.getSession(sessionId);
    const game = this.getGame(session.gameId)!;
    if (session.players.includes(userId)) {
      throw new GameError('Already joined this session', 'ALREADY_JOINED');
    }
    if (session.state !== 'waiting') {
      throw new GameError('Session is not accepting players', 'SESSION_NOT_ACTIVE');
    }
    if (session.players.length >= game.maxPlayers) {
      throw new GameError('Session is full', 'SESSION_FULL');
    }
    session.players.push(userId);
    // Auto-start once minimum players have joined (turn goes to the host first).
    if (session.players.length >= game.minPlayers) {
      session.state = 'active';
      if (session.gameId === 'tic-tac-toe') {
        session.turn = session.players[0]!;
      } else {
        this.initEngineState(session);
      }
    }
    session.updatedAt = this.now();
    return this.persist(session);
  }

  /**
   * Apply a move. Dispatches by game:
   *  - tic-tac-toe: `{ cell }` (0..8) — place mark, detect win/draw, advance.
   *  - uno/ludo/monopoly: a tagged `{ type }` payload routed to the engine.
   * Validates the session is active; turn ownership is enforced here for TTT and
   * by the engines for the others. Engine errors are mapped to `GameError`.
   */
  async submitMove(sessionId: string, userId: string, action: NeonGameMove): Promise<GameSession> {
    const session = await this.getSession(sessionId);
    if (session.state !== 'active') {
      throw new GameError('Session is not active', 'SESSION_NOT_ACTIVE');
    }
    if (session.gameId === 'tic-tac-toe') {
      return this.submitTicTacToeMove(session, userId, action);
    }
    return this.submitEngineMove(session, userId, action);
  }

  private async submitTicTacToeMove(
    session: GameSession,
    userId: string,
    action: NeonGameMove,
  ): Promise<GameSession> {
    if (session.turn !== userId) {
      throw new GameError('It is not your turn', 'NOT_YOUR_TURN');
    }
    if (!('cell' in action)) {
      throw new GameError('Tic-Tac-Toe moves require a cell', 'INVALID_MOVE');
    }
    const { cell } = action;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
      throw new GameError('Cell must be an integer 0..8', 'INVALID_MOVE');
    }
    if (session.board[cell] !== null) {
      throw new GameError('Cell already taken', 'INVALID_MOVE');
    }

    const mark = session.players[0] === userId ? 'X' : 'O';
    session.board[cell] = mark;

    if (this.hasWon(session.board, mark)) {
      session.state = 'finished';
      session.winner = userId;
      session.turn = null;
    } else if (session.board.every((c) => c !== null)) {
      session.state = 'finished';
      session.isDraw = true;
      session.turn = null;
    } else {
      // Advance to the other player.
      session.turn = session.players.find((p) => p !== userId) ?? null;
    }
    session.updatedAt = this.now();
    return this.persist(session);
  }

  /** Dispatch a move to the matching pure rules engine and sync the session. */
  private async submitEngineMove(
    session: GameSession,
    userId: string,
    action: NeonGameMove,
  ): Promise<GameSession> {
    if (session.engineState === undefined || session.engineState === null) {
      throw new GameError('Game has not started', 'SESSION_NOT_ACTIVE');
    }
    if (!('type' in action)) {
      throw new GameError('Engine moves require a type', 'INVALID_MOVE');
    }

    try {
      if (session.gameId === 'uno') {
        const state = session.engineState as UnoGameState;
        let next: UnoGameState;
        if (action.type === 'uno_play') {
          next = this.unoEngine.playCard(state, userId, action.cardId, action.chosenColor);
        } else if (action.type === 'uno_draw') {
          next = this.unoEngine.drawCard(state, userId);
        } else {
          throw new GameError('Unsupported Uno move', 'INVALID_MOVE');
        }
        this.syncFromEngine(session, next);
      } else if (session.gameId === 'ludo') {
        const state = session.engineState as LudoGameState;
        let next: LudoGameState;
        if (action.type === 'ludo_roll') {
          next = this.ludoEngine.rollDice(state, userId).state;
        } else if (action.type === 'ludo_move') {
          next = this.ludoEngine.moveToken(state, userId, action.tokenId);
        } else {
          throw new GameError('Unsupported Ludo move', 'INVALID_MOVE');
        }
        this.syncFromEngine(session, next);
      } else if (session.gameId === 'monopoly') {
        const next = this.applyMonopolyMove(
          session.engineState as MonopolyGameState,
          userId,
          action,
        );
        this.syncFromEngine(session, next);
      } else if (session.gameId === 'connect-four') {
        const state = session.engineState as ConnectFourGameState;
        if (action.type !== 'connect_four_drop') {
          throw new GameError('Unsupported Connect Four move', 'INVALID_MOVE');
        }
        const next = this.connectFourEngine.dropDisc(state, userId, action.column);
        this.syncFromEngine(session, next);
      } else if (session.gameId === 'othello') {
        const state = session.engineState as OthelloGameState;
        if (action.type !== 'othello_place') {
          throw new GameError('Unsupported Othello move', 'INVALID_MOVE');
        }
        const next = this.othelloEngine.placeDisc(state, userId, action.row, action.col);
        this.syncFromEngine(session, next);
      } else {
        throw new GameError(`${session.gameId} is not playable yet`, 'GAME_NOT_PLAYABLE');
      }
    } catch (err) {
      this.rethrowEngineError(err);
    }

    session.updatedAt = this.now();
    return this.persist(session);
  }

  private applyMonopolyMove(
    state: MonopolyGameState,
    userId: string,
    action: Extract<NeonGameMove, { type: string }>,
  ): MonopolyGameState {
    switch (action.type) {
      case 'monopoly_roll':
        return this.monopolyEngine.rollDice(state, userId);
      case 'monopoly_buy':
        return this.monopolyEngine.buyProperty(state, userId);
      case 'monopoly_decline':
        return this.monopolyEngine.declinePurchase(state, userId);
      case 'monopoly_build':
        return this.monopolyEngine.buildHouse(state, userId, action.index);
      case 'monopoly_end':
        return this.monopolyEngine.endTurn(state, userId);
      case 'monopoly_jail_fine':
        return this.monopolyEngine.payJailFine(state, userId);
      case 'monopoly_jail_card':
        return this.monopolyEngine.useJailCard(state, userId);
      default:
        throw new GameError('Unsupported Monopoly move', 'INVALID_MOVE');
    }
  }

  /** Leave/abandon a session. */
  async leaveGame(sessionId: string, userId: string): Promise<GameSession> {
    const session = await this.getSession(sessionId);
    if (!session.players.includes(userId)) return session;
    session.players = session.players.filter((p) => p !== userId);
    if (session.state !== 'finished') {
      if (session.players.length === 0) {
        session.state = 'abandoned';
        session.turn = null;
      } else if (session.state === 'active') {
        // Remaining player wins by forfeit.
        session.state = 'finished';
        session.winner = session.players[0]!;
        session.turn = null;
      } else {
        session.host = session.players[0]!;
      }
    }
    session.updatedAt = this.now();
    return this.persist(session);
  }

  private hasWon(board: (string | null)[], mark: string): boolean {
    return WIN_LINES.some((line) => line.every((i) => board[i] === mark));
  }

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------

  /** Persist the mutated session fields and return the mapped result. */
  private async persist(session: GameSession): Promise<GameSession> {
    const row = await this.prisma.neonGameSession.update({
      where: { id: session.id },
      data: {
        host: session.host,
        players: session.players,
        state: session.state,
        turn: session.turn,
        board: session.gameId === 'tic-tac-toe' ? session.board : (session.engineState ?? null),
        winner: session.winner,
        isDraw: session.isDraw,
        updatedAt: session.updatedAt,
      },
    });
    return this.toSession(row);
  }

  /** Map a persisted row (parsing players/board JSON) to the GameSession shape. */
  private toSession(row: NeonGameSessionRow): GameSession {
    const isTtt = row.gameId === 'tic-tac-toe';
    return {
      id: row.id,
      gameId: row.gameId,
      host: row.host,
      players: this.parseStringArray(row.players),
      state: this.parseState(row.state),
      turn: row.turn ?? null,
      board: isTtt ? this.parseBoard(row.board) : Array(9).fill(null),
      engineState: isTtt ? undefined : (row.board ?? undefined),
      winner: row.winner ?? null,
      isDraw: row.isDraw,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Initialize the engine state for a non-TTT game at auto-start. */
  private initEngineState(session: GameSession): void {
    switch (session.gameId) {
      case 'uno':
        session.engineState = this.unoEngine.createGame(session.players);
        break;
      case 'ludo':
        session.engineState = this.ludoEngine.createGame(session.players);
        break;
      case 'monopoly':
        session.engineState = this.monopolyEngine.createGame(session.players);
        break;
      case 'connect-four':
        session.engineState = this.connectFourEngine.createGame(session.players);
        break;
      case 'othello':
        session.engineState = this.othelloEngine.createGame(session.players);
        break;
      default:
        throw new GameError(`${session.gameId} is not playable yet`, 'GAME_NOT_PLAYABLE');
    }
    session.turn = this.engineTurn(session.gameId, session.engineState);
  }

  /** Sync the session lifecycle fields from a fresh engine state. */
  private syncFromEngine(
    session: GameSession,
    next: { status: 'active' | 'finished'; winner: string | null },
  ): void {
    session.engineState = next;
    if (next.status === 'finished') {
      session.state = 'finished';
      session.winner = next.winner ?? null;
      session.turn = null;
      // Some engines (e.g. Connect Four) expose a draw flag on the state.
      const draw = (next as { isDraw?: boolean }).isDraw;
      if (typeof draw === 'boolean') session.isDraw = draw;
    } else {
      session.turn = this.engineTurn(session.gameId, next);
    }
  }

  /** Resolve whose turn it is from an engine state (Ludo uses currentPlayerIndex). */
  private engineTurn(gameId: string, state: unknown): string | null {
    if (gameId === 'ludo') {
      const s = state as LudoGameState;
      return s.players[s.currentPlayerIndex]?.id ?? null;
    }
    return (state as { turn?: string | null }).turn ?? null;
  }

  /** Map an engine error (Uno/Ludo/Monopoly) to a GameError; rethrow others. */
  private rethrowEngineError(err: unknown): never {
    if (err instanceof GameError) throw err;
    if (
      err instanceof UnoError ||
      err instanceof LudoError ||
      err instanceof MonopolyError ||
      err instanceof ConnectFourError ||
      err instanceof OthelloError
    ) {
      if (err.code === 'NOT_YOUR_TURN') throw new GameError(err.message, 'NOT_YOUR_TURN');
      if (err.code === 'GAME_OVER') throw new GameError(err.message, 'SESSION_NOT_ACTIVE');
      throw new GameError(err.message, 'INVALID_MOVE');
    }
    throw err;
  }

  private parseState(value: string): SessionState {
    return value === 'active' || value === 'finished' || value === 'abandoned' ? value : 'waiting';
  }

  /** Coerce a JSON column into a string[] (players). */
  private parseStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((v) => String(v));
    return [];
  }

  /** Coerce a JSON column into the 9-cell board (null | 'X' | 'O'). */
  private parseBoard(value: unknown): (string | null)[] {
    if (Array.isArray(value)) {
      return value.map((c) => (c === null || c === undefined ? null : String(c)));
    }
    return Array(9).fill(null);
  }
}
