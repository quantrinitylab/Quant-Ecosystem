import type {
  AppContext,
  GameSession,
  GameSessionConfig,
  GameSessionServiceConfig,
  GameEvent,
  Player,
  PlayerRole,
} from '../types.js';

export class GameSessionService {
  private sessions = new Map<string, GameSession>();
  private eventLog = new Map<string, GameEvent[]>();
  private config: GameSessionServiceConfig;

  constructor(config: GameSessionServiceConfig) {
    this.config = config;
  }

  createSession(
    gameId: string,
    hostId: string,
    appContext: AppContext,
    sessionConfig?: Partial<GameSessionConfig>,
  ): GameSession {
    const id = this.generateId();
    const maxPlayers = sessionConfig?.maxPlayers ?? this.config.defaultMaxPlayers;

    const hostPlayer: Player = {
      userId: hostId,
      displayName: hostId,
      identityMode: 'revealed',
      role: 'host',
      score: 0,
      joinedAt: new Date(),
      isMinor: false,
      ageGroup: 'adult',
    };

    const session: GameSession = {
      id,
      gameId,
      appContext,
      state: 'waiting',
      host: hostId,
      players: [hostPlayer],
      spectators: [],
      maxPlayers,
      createdAt: new Date(),
      config: {
        maxPlayers,
        allowSpectators: sessionConfig?.allowSpectators ?? this.config.defaultAllowSpectators,
        turnBased: sessionConfig?.turnBased ?? false,
        timeLimit: sessionConfig?.timeLimit,
        customData: sessionConfig?.customData,
      },
      stateData: {},
    };

    this.sessions.set(id, session);
    this.eventLog.set(id, []);
    return session;
  }

  joinSession(sessionId: string, playerId: string, role: PlayerRole = 'player'): GameSession {
    const session = this.getSessionOrThrow(sessionId);

    if (role === 'spectator') {
      if (!session.config.allowSpectators) {
        throw new Error('Spectators are not allowed in this session');
      }
      const spectator: Player = {
        userId: playerId,
        displayName: playerId,
        identityMode: 'revealed',
        role: 'spectator',
        score: 0,
        joinedAt: new Date(),
        isMinor: false,
        ageGroup: 'adult',
      };
      session.spectators.push(spectator);
      return session;
    }

    if (session.players.length >= session.maxPlayers) {
      throw new Error('Session is full');
    }

    if (session.state === 'finished' || session.state === 'abandoned') {
      throw new Error('Cannot join a finished or abandoned session');
    }

    const player: Player = {
      userId: playerId,
      displayName: playerId,
      identityMode: 'revealed',
      role: 'player',
      score: 0,
      joinedAt: new Date(),
      isMinor: false,
      ageGroup: 'adult',
    };

    session.players.push(player);
    return session;
  }

  leaveSession(sessionId: string, playerId: string): GameSession {
    const session = this.getSessionOrThrow(sessionId);

    const spectatorIndex = session.spectators.findIndex((s) => s.userId === playerId);
    if (spectatorIndex !== -1) {
      session.spectators.splice(spectatorIndex, 1);
      return session;
    }

    const playerIndex = session.players.findIndex((p) => p.userId === playerId);
    if (playerIndex === -1) {
      throw new Error('Player not found in session');
    }

    session.players.splice(playerIndex, 1);

    // Host migration if the leaving player is the host
    if (session.host === playerId && session.players.length > 0) {
      const newHost = session.players[0]!;
      session.host = newHost.userId;
      newHost.role = 'host';
    }

    // Abandon if no players left
    if (session.players.length === 0) {
      session.state = 'abandoned';
    }

    return session;
  }

  updateGameState(sessionId: string, stateData: Record<string, unknown>): GameSession {
    const session = this.getSessionOrThrow(sessionId);

    if (session.state === 'finished' || session.state === 'abandoned') {
      throw new Error('Cannot update state of a finished or abandoned session');
    }

    if (session.state === 'waiting') {
      session.state = 'active';
    }

    session.stateData = { ...session.stateData, ...stateData };
    return session;
  }

  broadcastEvent(sessionId: string, event: Omit<GameEvent, 'timestamp'>): void {
    this.getSessionOrThrow(sessionId);

    const fullEvent: GameEvent = {
      ...event,
      timestamp: new Date(),
    };

    const events = this.eventLog.get(sessionId) ?? [];
    events.push(fullEvent);
    this.eventLog.set(sessionId, events);
  }

  pauseSession(sessionId: string): GameSession {
    const session = this.getSessionOrThrow(sessionId);

    if (session.state !== 'active') {
      throw new Error('Can only pause an active session');
    }

    session.state = 'paused';
    return session;
  }

  resumeSession(sessionId: string): GameSession {
    const session = this.getSessionOrThrow(sessionId);

    if (session.state !== 'paused') {
      throw new Error('Can only resume a paused session');
    }

    session.state = 'active';
    return session;
  }

  getSession(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }

  listActiveSessions(gameId?: string): GameSession[] {
    const sessions = Array.from(this.sessions.values()).filter(
      (s) => s.state === 'waiting' || s.state === 'active' || s.state === 'paused',
    );

    if (gameId) {
      return sessions.filter((s) => s.gameId === gameId);
    }

    return sessions;
  }

  destroySession(sessionId: string): void {
    const session = this.getSessionOrThrow(sessionId);
    session.state = 'finished';
    this.sessions.delete(sessionId);
    this.eventLog.delete(sessionId);
  }

  cleanupAbandonedSessions(maxAgeMs: number): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, session] of this.sessions) {
      if (session.state === 'abandoned') {
        const age = now - session.createdAt.getTime();
        if (age > maxAgeMs) {
          this.sessions.delete(id);
          this.eventLog.delete(id);
          removed++;
        }
      }
    }

    return removed;
  }

  private getSessionOrThrow(sessionId: string): GameSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  private generateId(): string {
    return `gs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
