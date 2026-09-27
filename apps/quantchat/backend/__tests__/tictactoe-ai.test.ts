import { describe, it, expect, beforeEach } from 'vitest';
import {
  AiDifficulty,
  BoardCell,
  WINNING_COMBINATIONS,
  POSITION_PRIORITY,
  QUANTY_AI_BOT,
  getAvailableMoves,
  checkWinner,
  minimax,
  calculateAiMove,
  executeBotTurn,
  TicTacToeAiService,
} from '../services/tictactoe-ai.service';
import {
  createGameSession,
  joinGameSession,
  clearGamesForTesting,
  getGameSession,
} from '../services/party-game.service';

describe('Tic Tac Toe Minimax AI Decision Engine (Quanty AI Bot)', () => {
  beforeEach(() => {
    clearGamesForTesting();
  });

  describe('Board Inspection & Available Moves', () => {
    it('returns all 9 indices for an empty board', () => {
      const board: BoardCell[] = Array(9).fill(null);
      const available = getAvailableMoves(board);
      expect(available).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('returns empty array when board has no available cells', () => {
      const board: BoardCell[] = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
      const available = getAvailableMoves(board);
      expect(available).toEqual([]);
    });

    it('returns exact empty cell indices for partially occupied board', () => {
      const board: BoardCell[] = ['X', null, 'O', null, 'X', null, null, 'O', 'X'];
      const available = getAvailableMoves(board);
      expect(available).toEqual([1, 3, 5, 6]);
    });
  });

  describe('Winner Evaluation (checkWinner)', () => {
    it('detects horizontal row wins accurately', () => {
      // Row 0
      expect(checkWinner(['X', 'X', 'X', null, 'O', null, 'O', null, null])).toBe('X');
      // Row 1
      expect(checkWinner([null, null, null, 'O', 'O', 'O', 'X', null, 'X'])).toBe('O');
      // Row 2
      expect(checkWinner(['O', null, null, null, 'O', null, 'X', 'X', 'X'])).toBe('X');
    });

    it('detects vertical column wins accurately', () => {
      // Col 0
      expect(checkWinner(['O', 'X', null, 'O', 'X', null, 'O', null, null])).toBe('O');
      // Col 1
      expect(checkWinner(['O', 'X', null, null, 'X', null, 'O', 'X', null])).toBe('X');
      // Col 2
      expect(checkWinner([null, 'X', 'O', null, null, 'O', 'X', null, 'O'])).toBe('O');
    });

    it('detects diagonal wins accurately', () => {
      // Main diagonal [0, 4, 8]
      expect(checkWinner(['X', 'O', null, null, 'X', 'O', null, null, 'X'])).toBe('X');
      // Anti diagonal [2, 4, 6]
      expect(checkWinner(['X', null, 'O', null, 'O', 'X', 'O', null, null])).toBe('O');
    });

    it('detects draw when all cells are filled with no winner', () => {
      const drawBoard: BoardCell[] = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
      expect(checkWinner(drawBoard)).toBe('DRAW');
    });

    it('returns null when game is still active without winner', () => {
      const activeBoard: BoardCell[] = ['X', 'O', null, null, 'X', null, null, null, 'O'];
      expect(checkWinner(activeBoard)).toBeNull();
    });
  });

  describe('UNBEATABLE Minimax Decision Logic', () => {
    it('takes center cell on opening move when available', () => {
      const emptyBoard: BoardCell[] = Array(9).fill(null);
      const move = calculateAiMove(emptyBoard, 'X', 'UNBEATABLE');

      expect(move.chosenIndex).toBe(4);
      expect(move.difficulty).toBe('UNBEATABLE');
      expect(move.isWinningMove).toBe(false);
      expect(move.isBlockingMove).toBe(false);
      expect(move.evaluatedPaths).toBeGreaterThan(0);
    });

    it('takes center cell when responding to opponent opening corner move', () => {
      const board: BoardCell[] = Array(9).fill(null);
      board[0] = 'X'; // Opponent played corner 0

      const move = calculateAiMove(board, 'O', 'UNBEATABLE');
      expect(move.chosenIndex).toBe(4); // Center must be taken to secure draw/win
      expect(move.isWinningMove).toBe(false);
      expect(move.isBlockingMove).toBe(false);
    });

    it('takes immediate winning move when available', () => {
      // AI is 'X', row 0 has [X, X, null] -> index 2 wins immediately
      const board: BoardCell[] = ['X', 'X', null, 'O', 'O', null, null, null, null];

      const move = calculateAiMove(board, 'X', 'UNBEATABLE');
      expect(move.chosenIndex).toBe(2);
      expect(move.isWinningMove).toBe(true);
      expect(move.isBlockingMove).toBe(false);
    });

    it('blocks opponent immediate winning line', () => {
      // Opponent 'O' has row 0: [O, O, null] threatening win on 2. AI is 'X'
      const board: BoardCell[] = ['O', 'O', null, 'X', null, null, null, null, null];

      const move = calculateAiMove(board, 'X', 'UNBEATABLE');
      expect(move.chosenIndex).toBe(2);
      expect(move.isWinningMove).toBe(false);
      expect(move.isBlockingMove).toBe(true);
    });

    it('prioritizes immediate win over blocking opponent when both exist', () => {
      // AI is 'X'. AI can win at 2 ([X, X, null]), Opponent can win at 5 ([O, O, null])
      const board: BoardCell[] = ['X', 'X', null, 'O', 'O', null, null, null, null];

      const move = calculateAiMove(board, 'X', 'UNBEATABLE');
      expect(move.chosenIndex).toBe(2);
      expect(move.isWinningMove).toBe(true);
    });

    it('depth-weighted score gives higher preference to faster wins', () => {
      // Direct win at depth 1 returns score 9 (10 - 1)
      const directWinBoard: BoardCell[] = ['X', 'X', null, null, null, null, null, null, null];
      const directWinResult = minimax(directWinBoard, 0, true, 'X', 'O');
      expect(directWinResult.index).toBe(2);
      expect(directWinResult.score).toBe(9);
    });
  });

  describe('Difficulty Levels & Board Validation', () => {
    it('throws BOARD_FULL error when board has no available cells', () => {
      const fullBoard: BoardCell[] = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];

      expect(() => calculateAiMove(fullBoard, 'X', 'UNBEATABLE')).toThrow('BOARD_FULL');
      expect(() => calculateAiMove(fullBoard, 'O', 'EASY')).toThrow('BOARD_FULL');
      expect(() => calculateAiMove(fullBoard, 'X', 'MEDIUM')).toThrow('BOARD_FULL');
    });

    it('EASY difficulty returns a valid empty cell index', () => {
      const board: BoardCell[] = ['X', 'O', 'X', null, 'O', null, null, 'X', null];
      const move = calculateAiMove(board, 'X', 'EASY');
      expect([3, 5, 6, 8]).toContain(move.chosenIndex);
      expect(move.difficulty).toBe('EASY');
    });

    it('MEDIUM difficulty returns a valid empty cell index with correct metadata', () => {
      const board: BoardCell[] = ['X', 'O', null, null, 'X', null, null, null, 'O'];
      const move = calculateAiMove(board, 'O', 'MEDIUM');
      expect([2, 3, 5, 6, 7]).toContain(move.chosenIndex);
      expect(move.difficulty).toBe('MEDIUM');
    });

    it('defaults to UNBEATABLE difficulty when difficulty parameter is omitted', () => {
      const board: BoardCell[] = ['O', 'O', null, 'X', null, null, null, null, null];
      const move = calculateAiMove(board, 'X');
      expect(move.difficulty).toBe('UNBEATABLE');
      expect(move.chosenIndex).toBe(2); // Blocks opponent
      expect(move.isBlockingMove).toBe(true);
    });
  });

  describe('Unbeatable Invariant (Simulated Games)', () => {
    it('UNBEATABLE AI never loses across simulated games against random opponent', () => {
      // Run 20 simulated matches where AI plays both X and O against random moves
      for (let game = 0; game < 20; game++) {
        const board: BoardCell[] = Array(9).fill(null);
        const aiSymbol: 'X' | 'O' = game % 2 === 0 ? 'X' : 'O';
        const humanSymbol: 'X' | 'O' = aiSymbol === 'X' ? 'O' : 'X';

        let currentTurn: 'X' | 'O' = 'X';
        let winner: 'X' | 'O' | 'DRAW' | null = null;

        while (!winner) {
          const available = getAvailableMoves(board);
          if (available.length === 0) {
            winner = 'DRAW';
            break;
          }

          if (currentTurn === aiSymbol) {
            const aiMove = calculateAiMove(board, aiSymbol, 'UNBEATABLE');
            board[aiMove.chosenIndex] = aiSymbol;
          } else {
            // Random human move
            const randomMove = available[Math.floor(Math.random() * available.length)];
            board[randomMove] = humanSymbol;
          }

          winner = checkWinner(board);
          currentTurn = currentTurn === 'X' ? 'O' : 'X';
        }

        // UNBEATABLE invariant: AI must win or draw; AI NEVER loses to random moves!
        expect(winner).not.toBe(humanSymbol);
        expect(['DRAW', aiSymbol]).toContain(winner);
      }
    });
  });

  describe('PartyGameSession State Machine Integration', () => {
    it('executes Quanty AI bot turn on an active session seamlessly', () => {
      const session = createGameSession('chat_party', {
        userId: 'user_human',
        username: 'HumanPlayer',
      });

      // Quanty AI joins as player 2 ('O')
      joinGameSession(session.id, {
        userId: QUANTY_AI_BOT.userId,
        username: QUANTY_AI_BOT.username,
      });

      // Human plays opening move at index 0
      session.board[0] = 'X';
      session.currentTurnUserId = QUANTY_AI_BOT.userId;

      const { session: afterBotSession, moveResult } = executeBotTurn(session.id, 'UNBEATABLE');
      expect(afterBotSession.board[moveResult.chosenIndex]).toBe('O');
      expect(moveResult.chosenIndex).toBe(4); // AI takes center cell
      expect(afterBotSession.currentTurnUserId).toBe('user_human'); // Turn passed back to human
    });

    it('throws error when executing bot turn on non-existent or inactive game', () => {
      expect(() => executeBotTurn('non_existent_game')).toThrow('GAME_NOT_FOUND');

      const waitingSession = createGameSession('chat_1', {
        userId: 'user_1',
        username: 'Player1',
      });
      expect(() => executeBotTurn(waitingSession.id)).toThrow('GAME_NOT_ACTIVE');
    });
  });
});
