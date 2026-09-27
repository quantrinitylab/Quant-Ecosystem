import { PartyGameSession, getGameSession, makeMove } from './party-game.service';

export type AiDifficulty = 'EASY' | 'MEDIUM' | 'UNBEATABLE';
export type BoardCell = 'X' | 'O' | null;

export interface AiMoveResult {
  chosenIndex: number;
  difficulty: AiDifficulty;
  evaluatedPaths: number;
  isWinningMove: boolean;
  isBlockingMove: boolean;
}

export const WINNING_COMBINATIONS: readonly [number, number, number][] = [
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

export const POSITION_PRIORITY: Readonly<Record<number, number>> = {
  4: 3, // Center (highest strategic value in 3x3)
  0: 2, // Corners
  2: 2,
  6: 2,
  8: 2,
  1: 1, // Edges
  3: 1,
  5: 1,
  7: 1,
};

export const QUANTY_AI_BOT = {
  userId: 'user_quanty_ai',
  username: 'Quanty AI',
} as const;

/**
 * Returns all indices of empty (null) cells on the 3x3 board.
 */
export function getAvailableMoves(board: BoardCell[]): number[] {
  const moves: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      moves.push(i);
    }
  }
  return moves;
}

/**
 * Evaluates the board state and returns the winner ('X' | 'O'), 'DRAW' if full with no winner,
 * or null if the game is still ongoing.
 */
export function checkWinner(board: BoardCell[]): 'X' | 'O' | 'DRAW' | null {
  for (const [a, b, c] of WINNING_COMBINATIONS) {
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every((cell) => cell !== null)) {
    return 'DRAW';
  }
  return null;
}

/**
 * Recursive Minimax algorithm with depth-weighted scoring and center/corner positional tie-breaking.
 * Depth weighting: Win = 10 - depth, Loss = depth - 10, Draw = 0.
 */
export function minimax(
  board: BoardCell[],
  depth: number,
  isMaximizing: boolean,
  aiSymbol: 'X' | 'O',
  opponentSymbol: 'X' | 'O',
  stats?: { evaluatedPaths: number },
): { score: number; index?: number } {
  if (stats) {
    stats.evaluatedPaths++;
  }

  const winner = checkWinner(board);
  if (winner === aiSymbol) {
    return { score: 10 - depth };
  }
  if (winner === opponentSymbol) {
    return { score: depth - 10 };
  }
  if (winner === 'DRAW') {
    return { score: 0 };
  }

  const availableMoves = getAvailableMoves(board);
  if (availableMoves.length === 0) {
    return { score: 0 };
  }

  let bestScore = isMaximizing ? -Infinity : Infinity;
  let bestIndex: number | undefined = availableMoves[0];

  for (const move of availableMoves) {
    board[move] = isMaximizing ? aiSymbol : opponentSymbol;
    const result = minimax(board, depth + 1, !isMaximizing, aiSymbol, opponentSymbol, stats);
    board[move] = null;

    if (isMaximizing) {
      if (result.score > bestScore) {
        bestScore = result.score;
        bestIndex = move;
      } else if (
        result.score === bestScore &&
        bestIndex !== undefined &&
        (POSITION_PRIORITY[move] ?? 0) > (POSITION_PRIORITY[bestIndex] ?? 0)
      ) {
        bestIndex = move;
      }
    } else {
      if (result.score < bestScore) {
        bestScore = result.score;
        bestIndex = move;
      } else if (
        result.score === bestScore &&
        bestIndex !== undefined &&
        (POSITION_PRIORITY[move] ?? 0) > (POSITION_PRIORITY[bestIndex] ?? 0)
      ) {
        bestIndex = move;
      }
    }
  }

  return { score: bestScore, index: bestIndex };
}

/**
 * Calculates the next AI move based on difficulty level:
 * - 'EASY': Random valid move.
 * - 'MEDIUM': 70% optimal Minimax move, 30% random move.
 * - 'UNBEATABLE': 100% optimal Minimax move with depth-weighting.
 *
 * Validates that the board is not full (throws 'BOARD_FULL').
 * Detects whether the chosen move is an immediate win or blocking move.
 */
export function calculateAiMove(
  board: BoardCell[],
  aiSymbol: 'X' | 'O',
  difficulty: AiDifficulty = 'UNBEATABLE',
): AiMoveResult {
  const availableMoves = getAvailableMoves(board);
  if (availableMoves.length === 0) {
    throw new Error('BOARD_FULL');
  }

  const opponentSymbol: 'X' | 'O' = aiSymbol === 'X' ? 'O' : 'X';
  const stats = { evaluatedPaths: 0 };

  let chosenIndex: number;

  if (difficulty === 'EASY') {
    const randomIndex = Math.floor(Math.random() * availableMoves.length);
    chosenIndex = availableMoves[randomIndex];
  } else if (difficulty === 'MEDIUM') {
    const useOptimal = Math.random() < 0.7;
    if (useOptimal) {
      const bestMove = minimax(board, 0, true, aiSymbol, opponentSymbol, stats);
      chosenIndex = bestMove.index ?? availableMoves[0];
    } else {
      const randomIndex = Math.floor(Math.random() * availableMoves.length);
      chosenIndex = availableMoves[randomIndex];
    }
  } else {
    // UNBEATABLE: 100% optimal Minimax move
    const bestMove = minimax(board, 0, true, aiSymbol, opponentSymbol, stats);
    chosenIndex = bestMove.index ?? availableMoves[0];
  }

  // Detect if move is a direct win
  const winTestBoard = [...board];
  winTestBoard[chosenIndex] = aiSymbol;
  const isWinningMove = checkWinner(winTestBoard) === aiSymbol;

  // Detect if move is an immediate block against opponent's win
  const blockTestBoard = [...board];
  blockTestBoard[chosenIndex] = opponentSymbol;
  const isBlockingMove = checkWinner(blockTestBoard) === opponentSymbol;

  return {
    chosenIndex,
    difficulty,
    evaluatedPaths: stats.evaluatedPaths,
    isWinningMove,
    isBlockingMove,
  };
}

/**
 * Executes a Quanty AI bot turn on an active PartyGameSession.
 */
export function executeBotTurn(
  gameId: string,
  difficulty: AiDifficulty = 'UNBEATABLE',
): { session: PartyGameSession; moveResult: AiMoveResult } {
  const session = getGameSession(gameId);
  if (!session) {
    throw new Error('GAME_NOT_FOUND');
  }
  if (session.status !== 'active') {
    throw new Error('GAME_NOT_ACTIVE');
  }

  const botSymbol: 'X' | 'O' =
    session.player1.userId === QUANTY_AI_BOT.userId
      ? session.player1.symbol
      : session.player2?.userId === QUANTY_AI_BOT.userId
        ? session.player2.symbol
        : 'O';

  const moveResult = calculateAiMove(session.board as BoardCell[], botSymbol, difficulty);
  const updatedSession = makeMove(session.id, QUANTY_AI_BOT.userId, moveResult.chosenIndex);

  return { session: updatedSession, moveResult };
}

export class TicTacToeAiService {
  static getAvailableMoves = getAvailableMoves;
  static checkWinner = checkWinner;
  static minimax = minimax;
  static calculateAiMove = calculateAiMove;
  static executeBotTurn = executeBotTurn;
}
