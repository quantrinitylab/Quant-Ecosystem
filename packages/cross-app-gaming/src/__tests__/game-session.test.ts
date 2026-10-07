import { describe, it, expect } from 'vitest';
import { GameSessionService } from '../services/game-session.service.js';

describe('GameSessionService', () => {
  function createService() {
    return new GameSessionService({
      defaultMaxPlayers: 4,
      defaultAllowSpectators: true,
    });
  }

  describe('createSession', () => {
    it('should create a session with correct defaults', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');

      expect(session.id).toBeDefined();
      expect(session.gameId).toBe('trivia');
      expect(session.appContext).toBe('chat_embed');
      expect(session.state).toBe('waiting');
      expect(session.host).toBe('host-1');
      expect(session.players).toHaveLength(1);
      expect(session.players[0]!.userId).toBe('host-1');
      expect(session.players[0]!.role).toBe('host');
      expect(session.maxPlayers).toBe(4);
    });

    it('should use custom config when provided', () => {
      const service = createService();
      const session = service.createSession('chess', 'host-1', 'fullscreen', {
        maxPlayers: 2,
        turnBased: true,
        allowSpectators: false,
      });

      expect(session.maxPlayers).toBe(2);
      expect(session.config.turnBased).toBe(true);
      expect(session.config.allowSpectators).toBe(false);
    });
  });

  describe('joinSession', () => {
    it('should add a player to the session', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      const updated = service.joinSession(session.id, 'player-2');

      expect(updated.players).toHaveLength(2);
      expect(updated.players[1]!.userId).toBe('player-2');
      expect(updated.players[1]!.role).toBe('player');
    });

    it('should throw when session is full', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed', {
        maxPlayers: 2,
      });
      service.joinSession(session.id, 'player-2');

      expect(() => service.joinSession(session.id, 'player-3')).toThrow('Session is full');
    });

    it('should allow spectators to join', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      const updated = service.joinSession(session.id, 'spectator-1', 'spectator');

      expect(updated.spectators).toHaveLength(1);
      expect(updated.spectators[0]!.userId).toBe('spectator-1');
    });

    it('should throw when spectators are not allowed', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed', {
        allowSpectators: false,
      });

      expect(() => service.joinSession(session.id, 'spectator-1', 'spectator')).toThrow(
        'Spectators are not allowed',
      );
    });

    it('should throw when joining a finished session', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      service.destroySession(session.id);

      expect(() => service.joinSession(session.id, 'player-2')).toThrow('Session not found');
    });
  });

  describe('leaveSession', () => {
    it('should remove a player from the session', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      service.joinSession(session.id, 'player-2');
      const updated = service.leaveSession(session.id, 'player-2');

      expect(updated.players).toHaveLength(1);
    });

    it('should perform host migration when host leaves', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      service.joinSession(session.id, 'player-2');
      const updated = service.leaveSession(session.id, 'host-1');

      expect(updated.host).toBe('player-2');
      expect(updated.players[0]!.role).toBe('host');
    });

    it('should abandon session when last player leaves', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      const updated = service.leaveSession(session.id, 'host-1');

      expect(updated.state).toBe('abandoned');
    });

    it('should remove spectators', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      service.joinSession(session.id, 'spectator-1', 'spectator');
      const updated = service.leaveSession(session.id, 'spectator-1');

      expect(updated.spectators).toHaveLength(0);
    });

    it('should throw for unknown player', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');

      expect(() => service.leaveSession(session.id, 'unknown')).toThrow('Player not found');
    });
  });

  describe('updateGameState', () => {
    it('should update state data', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      const updated = service.updateGameState(session.id, { round: 1, question: 'What is 2+2?' });

      expect(updated.stateData).toEqual({ round: 1, question: 'What is 2+2?' });
    });

    it('should transition from waiting to active on first update', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      const updated = service.updateGameState(session.id, { started: true });

      expect(updated.state).toBe('active');
    });

    it('should merge state data on subsequent updates', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      service.updateGameState(session.id, { round: 1 });
      const updated = service.updateGameState(session.id, { score: 10 });

      expect(updated.stateData).toEqual({ round: 1, score: 10 });
    });
  });

  describe('broadcastEvent', () => {
    it('should not throw for valid session', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');

      expect(() =>
        service.broadcastEvent(session.id, {
          type: 'answer',
          payload: { answer: 'A' },
          senderId: 'host-1',
        }),
      ).not.toThrow();
    });

    it('should throw for unknown session', () => {
      const service = createService();

      expect(() =>
        service.broadcastEvent('nonexistent', {
          type: 'answer',
          payload: {},
          senderId: 'host-1',
        }),
      ).toThrow('Session not found');
    });
  });

  describe('pauseSession / resumeSession', () => {
    it('should pause an active session', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      service.updateGameState(session.id, { started: true });
      const paused = service.pauseSession(session.id);

      expect(paused.state).toBe('paused');
    });

    it('should resume a paused session', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      service.updateGameState(session.id, { started: true });
      service.pauseSession(session.id);
      const resumed = service.resumeSession(session.id);

      expect(resumed.state).toBe('active');
    });

    it('should throw when pausing a non-active session', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');

      expect(() => service.pauseSession(session.id)).toThrow('Can only pause an active session');
    });

    it('should throw when resuming a non-paused session', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      service.updateGameState(session.id, { started: true });

      expect(() => service.resumeSession(session.id)).toThrow('Can only resume a paused session');
    });
  });

  describe('listActiveSessions', () => {
    it('should list all active sessions', () => {
      const service = createService();
      service.createSession('trivia', 'host-1', 'chat_embed');
      service.createSession('chess', 'host-2', 'fullscreen');

      const sessions = service.listActiveSessions();
      expect(sessions).toHaveLength(2);
    });

    it('should filter by gameId', () => {
      const service = createService();
      service.createSession('trivia', 'host-1', 'chat_embed');
      service.createSession('chess', 'host-2', 'fullscreen');

      const sessions = service.listActiveSessions('trivia');
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.gameId).toBe('trivia');
    });
  });

  describe('destroySession', () => {
    it('should remove the session', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      service.destroySession(session.id);

      expect(service.getSession(session.id)).toBeUndefined();
    });

    it('should throw for unknown session', () => {
      const service = createService();

      expect(() => service.destroySession('nonexistent')).toThrow('Session not found');
    });
  });

  describe('cleanupAbandonedSessions', () => {
    it('should remove abandoned sessions older than maxAgeMs', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      // Abandon the session by having the host leave
      service.leaveSession(session.id, 'host-1');

      // Force createdAt to be in the past
      const s = service.getSession(session.id)!;
      s.createdAt = new Date(Date.now() - 10000);

      const removed = service.cleanupAbandonedSessions(5000);
      expect(removed).toBe(1);
      expect(service.getSession(session.id)).toBeUndefined();
    });

    it('should not remove abandoned sessions younger than maxAgeMs', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');
      service.leaveSession(session.id, 'host-1');

      const removed = service.cleanupAbandonedSessions(60000);
      expect(removed).toBe(0);
      expect(service.getSession(session.id)).toBeDefined();
    });

    it('should not remove active sessions', () => {
      const service = createService();
      const session = service.createSession('trivia', 'host-1', 'chat_embed');

      // Force createdAt to be old
      const s = service.getSession(session.id)!;
      s.createdAt = new Date(Date.now() - 100000);

      const removed = service.cleanupAbandonedSessions(5000);
      expect(removed).toBe(0);
      expect(service.getSession(session.id)).toBeDefined();
    });

    it('should return the count of removed sessions', () => {
      const service = createService();
      const s1 = service.createSession('trivia', 'h1', 'chat_embed');
      const s2 = service.createSession('chess', 'h2', 'fullscreen');
      service.leaveSession(s1.id, 'h1');
      service.leaveSession(s2.id, 'h2');

      // Make both old
      service.getSession(s1.id)!.createdAt = new Date(Date.now() - 20000);
      service.getSession(s2.id)!.createdAt = new Date(Date.now() - 20000);

      const removed = service.cleanupAbandonedSessions(10000);
      expect(removed).toBe(2);
    });
  });
});
