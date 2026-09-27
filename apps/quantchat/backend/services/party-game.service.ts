export type GameType = 'tic_tac_toe' | 'connect_four';
export type GameStatus = 'waiting' | 'active' | 'completed' | 'abandoned';
export type CellValue = 'X' | 'O' | null;

export interface GamePlayer {
  userId: string;
  username: string;
  symbol: 'X' | 'O';
}

export interface PartyGameSession {
  id: string;
  chatChannelId: string;
  gameType: GameType;
  status: GameStatus;
  player1: GamePlayer;
  player2?: GamePlayer;
  currentTurnUserId: string;
  board: CellValue[]; // 9 cells for Tic-Tac-Toe
  winnerUserId: string | 'draw' | null;
  winningLine?: number[]; // [0, 1, 2] indices
  startedAt: string;
  lastMoveAt: string;
}

export const WINNING_LINES: readonly [number, number, number][] = [
  // Rows
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  // Columns
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  // Diagonals
  [0, 4, 8],
  [2, 4, 6],
] as const;

const sessions = new Map<string, PartyGameSession>();

/**
 * Creates a new party game session in 'waiting' status with player1 assigned 'X'.
 */
export function createGameSession(
  chatChannelId: string,
  player1: { userId: string; username: string },
  gameType: GameType = 'tic_tac_toe',
): PartyGameSession {
  const id = `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();

  const session: PartyGameSession = {
    id,
    chatChannelId,
    gameType,
    status: 'waiting',
    player1: {
      userId: player1.userId,
      username: player1.username,
      symbol: 'X',
    },
    currentTurnUserId: player1.userId,
    board: Array(9).fill(null),
    winnerUserId: null,
    startedAt: now,
    lastMoveAt: now,
  };

  sessions.set(id, session);
  return session;
}

/**
 * Allows player2 to join the game session, transitioning status to 'active'
 * with player2 assigned 'O' and setting initial turn to player1.
 */
export function joinGameSession(
  gameId: string,
  player2: { userId: string; username: string },
): PartyGameSession {
  const session = sessions.get(gameId);
  if (!session) {
    throw new Error('GAME_NOT_FOUND');
  }

  if (session.status !== 'waiting') {
    throw new Error('CANNOT_JOIN');
  }

  if (player2.userId === session.player1.userId) {
    throw new Error('CANNOT_PLAY_SELF');
  }

  session.player2 = {
    userId: player2.userId,
    username: player2.username,
    symbol: 'O',
  };
  session.status = 'active';
  session.currentTurnUserId = session.player1.userId;
  session.lastMoveAt = new Date().toISOString();

  return session;
}

/**
 * Validates and executes a turn move on the board for the current player.
 * Checks for win or draw conditions and toggles turns accordingly.
 */
export function makeMove(gameId: string, userId: string, cellIndex: number): PartyGameSession {
  const session = sessions.get(gameId);
  if (!session) {
    throw new Error('GAME_NOT_FOUND');
  }

  if (session.status !== 'active') {
    throw new Error('GAME_NOT_ACTIVE');
  }

  if (userId !== session.currentTurnUserId) {
    throw new Error('NOT_YOUR_TURN');
  }

  if (cellIndex < 0 || cellIndex > 8 || !Number.isInteger(cellIndex)) {
    throw new Error('INVALID_CELL');
  }

  if (session.board[cellIndex] !== null) {
    throw new Error('CELL_OCCUPIED');
  }

  const playerSymbol =
    userId === session.player1.userId
      ? session.player1.symbol
      : session.player2 && userId === session.player2.userId
        ? session.player2.symbol
        : null;

  if (!playerSymbol) {
    throw new Error('PLAYER_NOT_IN_GAME');
  }

  session.board[cellIndex] = playerSymbol;
  session.lastMoveAt = new Date().toISOString();

  // Check for winning lines
  let hasWon = false;
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (
      session.board[a] !== null &&
      session.board[a] === session.board[b] &&
      session.board[a] === session.board[c]
    ) {
      session.status = 'completed';
      session.winnerUserId = userId;
      session.winningLine = [a, b, c];
      hasWon = true;
      break;
    }
  }

  if (!hasWon) {
    // Check for draw condition (all 9 cells filled with no winner)
    const isDraw = session.board.every((cell) => cell !== null);
    if (isDraw) {
      session.status = 'completed';
      session.winnerUserId = 'draw';
    } else {
      // Toggle turn to next player
      session.currentTurnUserId =
        userId === session.player1.userId ? session.player2!.userId : session.player1.userId;
    }
  }

  return session;
}

/**
 * Retrieves the current game session by ID, or null if not found.
 */
export function getGameSession(gameId: string): PartyGameSession | null {
  return sessions.get(gameId) || null;
}

/**
 * Resets the in-memory store for unit and integration testing.
 */
export function clearGamesForTesting(): void {
  sessions.clear();
}

/**
 * Handles turn timeouts when a player takes longer than the timeout period (default: 60s).
 */
export function handleTurnTimeout(gameId: string, timeoutSeconds: number = 60): PartyGameSession {
  const session = sessions.get(gameId);
  if (!session) {
    throw new Error('GAME_NOT_FOUND');
  }

  if (session.status !== 'active') {
    return session;
  }

  const lastMove = new Date(session.lastMoveAt).getTime();
  const elapsedSeconds = (Date.now() - lastMove) / 1000;

  if (elapsedSeconds >= timeoutSeconds) {
    session.status = 'completed';
    session.winnerUserId =
      session.currentTurnUserId === session.player1.userId
        ? session.player2?.userId || null
        : session.player1.userId;
  }

  return session;
}

export class PartyGameService {
  static createGameSession = createGameSession;
  static joinGameSession = joinGameSession;
  static makeMove = makeMove;
  static getGameSession = getGameSession;
  static clearGamesForTesting = clearGamesForTesting;
  static handleTurnTimeout = handleTurnTimeout;
}
