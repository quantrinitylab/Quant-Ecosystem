import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGameSession,
  joinGameSession,
  makeMove,
  getGameSession,
  clearGamesForTesting,
  handleTurnTimeout,
  PartyGameService,
} from '../services/party-game.service';

describe('GameMint & Tic Tac Toe In-Chat Turn-Based Party Game Engine', () => {
  beforeEach(() => {
    clearGamesForTesting();
  });

  describe('Session Creation and Joining', () => {
    it('creates game session assigning player 1 and initializing waiting status', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^game_\d+_[a-z0-9]+$/);
      expect(session.chatChannelId).toBe('chat_general');
      expect(session.gameType).toBe('tic_tac_toe');
      expect(session.status).toBe('waiting');
      expect(session.player1).toEqual({
        userId: 'user_alice',
        username: 'alice',
        symbol: 'X',
      });
      expect(session.player2).toBeUndefined();
      expect(session.currentTurnUserId).toBe('user_alice');
      expect(session.board).toHaveLength(9);
      expect(session.board.every((cell) => cell === null)).toBe(true);
      expect(session.winnerUserId).toBeNull();
      expect(session.winningLine).toBeUndefined();
      expect(session.startedAt).toBeDefined();
      expect(session.lastMoveAt).toBeDefined();

      const retrieved = getGameSession(session.id);
      expect(retrieved).toEqual(session);
    });

    it('allows player 2 to join, transitioning status to active with player 1 turn', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });

      const joined = joinGameSession(session.id, {
        userId: 'user_bob',
        username: 'bob',
      });

      expect(joined.status).toBe('active');
      expect(joined.player2).toEqual({
        userId: 'user_bob',
        username: 'bob',
        symbol: 'O',
      });
      expect(joined.currentTurnUserId).toBe('user_alice');
    });

    it('rejects joining if session does not exist, is not waiting, or player plays self', () => {
      expect(() =>
        joinGameSession('non_existent_game', {
          userId: 'user_bob',
          username: 'bob',
        }),
      ).toThrow('GAME_NOT_FOUND');

      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });

      expect(() =>
        joinGameSession(session.id, {
          userId: 'user_alice',
          username: 'alice',
        }),
      ).toThrow('CANNOT_PLAY_SELF');

      joinGameSession(session.id, {
        userId: 'user_bob',
        username: 'bob',
      });

      expect(() =>
        joinGameSession(session.id, {
          userId: 'user_charlie',
          username: 'charlie',
        }),
      ).toThrow('CANNOT_JOIN');
    });
  });

  describe('Move Validation & Turn Progression', () => {
    it('updates board cell and toggles turn between players', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });
      joinGameSession(session.id, {
        userId: 'user_bob',
        username: 'bob',
      });

      // Player 1 makes first move at cell 0
      const afterMove1 = makeMove(session.id, 'user_alice', 0);
      expect(afterMove1.board[0]).toBe('X');
      expect(afterMove1.currentTurnUserId).toBe('user_bob');

      // Player 2 responds at cell 4
      const afterMove2 = makeMove(session.id, 'user_bob', 4);
      expect(afterMove2.board[4]).toBe('O');
      expect(afterMove2.currentTurnUserId).toBe('user_alice');
    });

    it('throws error when moving out of turn or targeting occupied cell', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });
      joinGameSession(session.id, {
        userId: 'user_bob',
        username: 'bob',
      });

      // Bob attempts to move first when it is Alice's turn
      expect(() => makeMove(session.id, 'user_bob', 0)).toThrow('NOT_YOUR_TURN');

      // Alice moves at cell 0
      makeMove(session.id, 'user_alice', 0);

      // Bob attempts to move to the already occupied cell 0
      expect(() => makeMove(session.id, 'user_bob', 0)).toThrow('CELL_OCCUPIED');

      // Out-of-bounds cell indices
      expect(() => makeMove(session.id, 'user_bob', -1)).toThrow('INVALID_CELL');
      expect(() => makeMove(session.id, 'user_bob', 9)).toThrow('INVALID_CELL');
      expect(() => makeMove(session.id, 'user_bob', 2.5)).toThrow('INVALID_CELL');
    });

    it('throws error if game is not active or game session not found', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });

      // Game is still waiting for player 2
      expect(() => makeMove(session.id, 'user_alice', 0)).toThrow('GAME_NOT_ACTIVE');

      expect(() => makeMove('unknown_id', 'user_alice', 0)).toThrow('GAME_NOT_FOUND');
    });
  });

  describe('Winning Line Detection', () => {
    it('detects horizontal row win (indices 0, 1, 2) and records winning indices', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });
      joinGameSession(session.id, {
        userId: 'user_bob',
        username: 'bob',
      });

      // Row 0 win for Alice
      makeMove(session.id, 'user_alice', 0); // Alice: 0
      makeMove(session.id, 'user_bob', 3); // Bob: 3
      makeMove(session.id, 'user_alice', 1); // Alice: 1
      makeMove(session.id, 'user_bob', 4); // Bob: 4
      const result = makeMove(session.id, 'user_alice', 2); // Alice: 2 -> WIN!

      expect(result.status).toBe('completed');
      expect(result.winnerUserId).toBe('user_alice');
      expect(result.winningLine).toEqual([0, 1, 2]);
    });

    it('detects vertical column win (indices 1, 4, 7) for player 2', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });
      joinGameSession(session.id, {
        userId: 'user_bob',
        username: 'bob',
      });

      makeMove(session.id, 'user_alice', 0); // Alice: 0
      makeMove(session.id, 'user_bob', 1); // Bob: 1
      makeMove(session.id, 'user_alice', 2); // Alice: 2
      makeMove(session.id, 'user_bob', 4); // Bob: 4
      makeMove(session.id, 'user_alice', 8); // Alice: 8
      const result = makeMove(session.id, 'user_bob', 7); // Bob: 7 -> WIN!

      expect(result.status).toBe('completed');
      expect(result.winnerUserId).toBe('user_bob');
      expect(result.winningLine).toEqual([1, 4, 7]);
    });

    it('detects primary diagonal win (indices 0, 4, 8)', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });
      joinGameSession(session.id, {
        userId: 'user_bob',
        username: 'bob',
      });

      makeMove(session.id, 'user_alice', 0); // Alice: 0
      makeMove(session.id, 'user_bob', 1); // Bob: 1
      makeMove(session.id, 'user_alice', 4); // Alice: 4
      makeMove(session.id, 'user_bob', 2); // Bob: 2
      const result = makeMove(session.id, 'user_alice', 8); // Alice: 8 -> WIN!

      expect(result.status).toBe('completed');
      expect(result.winnerUserId).toBe('user_alice');
      expect(result.winningLine).toEqual([0, 4, 8]);
    });

    it('detects secondary anti-diagonal win (indices 2, 4, 6)', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });
      joinGameSession(session.id, {
        userId: 'user_bob',
        username: 'bob',
      });

      makeMove(session.id, 'user_alice', 2); // Alice: 2
      makeMove(session.id, 'user_bob', 0); // Bob: 0
      makeMove(session.id, 'user_alice', 4); // Alice: 4
      makeMove(session.id, 'user_bob', 1); // Bob: 1
      const result = makeMove(session.id, 'user_alice', 6); // Alice: 6 -> WIN!

      expect(result.status).toBe('completed');
      expect(result.winnerUserId).toBe('user_alice');
      expect(result.winningLine).toEqual([2, 4, 6]);
    });
  });

  describe('Draw Condition & Turn Timeout', () => {
    it('declares draw when all 9 cells are filled with no winning line', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });
      joinGameSession(session.id, {
        userId: 'user_bob',
        username: 'bob',
      });

      // Board layout for draw:
      // X O X
      // X O O
      // O X X
      makeMove(session.id, 'user_alice', 0); // Alice (X) at 0
      makeMove(session.id, 'user_bob', 1); // Bob (O) at 1
      makeMove(session.id, 'user_alice', 2); // Alice (X) at 2
      makeMove(session.id, 'user_bob', 4); // Bob (O) at 4
      makeMove(session.id, 'user_alice', 3); // Alice (X) at 3
      makeMove(session.id, 'user_bob', 5); // Bob (O) at 5
      makeMove(session.id, 'user_alice', 7); // Alice (X) at 7
      makeMove(session.id, 'user_bob', 6); // Bob (O) at 6
      const result = makeMove(session.id, 'user_alice', 8); // Alice (X) at 8 -> DRAW!

      expect(result.status).toBe('completed');
      expect(result.winnerUserId).toBe('draw');
      expect(result.winningLine).toBeUndefined();
      expect(result.board.every((cell) => cell !== null)).toBe(true);

      // Attempts to move on completed game must fail
      expect(() => makeMove(session.id, 'user_bob', 0)).toThrow('GAME_NOT_ACTIVE');
    });

    it('handles turn timeout and awards victory to opponent', () => {
      const session = createGameSession('chat_general', {
        userId: 'user_alice',
        username: 'alice',
      });
      joinGameSession(session.id, {
        userId: 'user_bob',
        username: 'bob',
      });

      // Simulate Alice taking > 60 seconds
      session.lastMoveAt = new Date(Date.now() - 65 * 1000).toISOString();

      const timeoutResult = handleTurnTimeout(session.id, 60);
      expect(timeoutResult.status).toBe('completed');
      expect(timeoutResult.winnerUserId).toBe('user_bob');
    });

    it('works identically via PartyGameService static methods', () => {
      const session = PartyGameService.createGameSession('chat_suite', {
        userId: 'u_p1',
        username: 'p1',
      });
      expect(PartyGameService.getGameSession(session.id)?.id).toBe(session.id);
    });
  });
});
