// ============================================================================
// QuantAI — Layer 1 Working Memory Service (Redis-backed real-time state)
//
// Fast in-memory working state (<2ms) storing recent conversation turns,
// active application context, intent scratchpads, and session variables across
// the Quant Ecosystem. Falls back gracefully to in-memory store if Redis is offline.
// ============================================================================

import Redis from 'ioredis';

export interface TurnMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface WorkingMemoryState {
  sessionId: string;
  userId: string;
  activeApp?: string;
  currentIntent?: string;
  contextVariables: Record<string, unknown>;
  recentTurns: TurnMessage[];
  scratchpad?: string;
  updatedAt: number;
}

export interface WorkingMemoryOptions {
  redisUrl?: string;
  client?: Redis;
  defaultTtlSeconds?: number;
  maxRecentTurns?: number;
}

export class WorkingMemoryService {
  private redis: Redis | null = null;
  private memoryFallback = new Map<string, { state: WorkingMemoryState; expiresAt: number }>();
  private readonly defaultTtl: number;
  private readonly maxTurns: number;

  constructor(options: WorkingMemoryOptions = {}) {
    this.defaultTtl = options.defaultTtlSeconds ?? 86400; // 24 hours
    this.maxTurns = options.maxRecentTurns ?? 20;

    if (options.client) {
      this.redis = options.client;
    } else {
      const url = options.redisUrl || process.env['REDIS_URL'];
      if (url) {
        try {
          this.redis = new Redis(url, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            retryStrategy: () => null,
          });
          this.redis.on('error', () => {
            // Silently fallback to in-memory on connection drop
          });
        } catch {
          this.redis = null;
        }
      }
    }
  }

  private key(sessionId: string): string {
    return `quant:working_memory:${sessionId}`;
  }

  async getState(sessionId: string): Promise<WorkingMemoryState | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(this.key(sessionId));
        if (!raw) return null;
        return JSON.parse(raw) as WorkingMemoryState;
      } catch {
        // Redis error, fallback to in-memory
      }
    }

    const fallback = this.memoryFallback.get(sessionId);
    if (!fallback) return null;
    if (Date.now() > fallback.expiresAt) {
      this.memoryFallback.delete(sessionId);
      return null;
    }
    return fallback.state;
  }

  async setState(state: WorkingMemoryState, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtl;
    const sanitizedState: WorkingMemoryState = {
      ...state,
      recentTurns: state.recentTurns.slice(-this.maxTurns),
      updatedAt: Date.now(),
    };

    if (this.redis) {
      try {
        await this.redis.set(this.key(state.sessionId), JSON.stringify(sanitizedState), 'EX', ttl);
        return;
      } catch {
        // Fallback
      }
    }

    this.memoryFallback.set(state.sessionId, {
      state: sanitizedState,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  async appendTurn(
    sessionId: string,
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
  ): Promise<WorkingMemoryState> {
    let state = await this.getState(sessionId);
    if (!state) {
      state = {
        sessionId,
        userId,
        contextVariables: {},
        recentTurns: [],
        updatedAt: Date.now(),
      };
    }

    state.recentTurns.push({
      role,
      content,
      timestamp: Date.now(),
    });

    if (state.recentTurns.length > this.maxTurns) {
      state.recentTurns = state.recentTurns.slice(-this.maxTurns);
    }

    await this.setState(state);
    return state;
  }

  async setContextVariable(sessionId: string, key: string, value: unknown): Promise<void> {
    const state = await this.getState(sessionId);
    if (!state) {
      throw new Error(`Working memory session '${sessionId}' not found.`);
    }

    state.contextVariables[key] = value;
    await this.setState(state);
  }

  async getContextVariable<T>(sessionId: string, key: string): Promise<T | undefined> {
    const state = await this.getState(sessionId);
    if (!state) return undefined;
    return state.contextVariables[key] as T | undefined;
  }

  async clearState(sessionId: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(this.key(sessionId));
      } catch {
        // Fallback
      }
    }
    this.memoryFallback.delete(sessionId);
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // Ignore
      }
      this.redis = null;
    }
  }
}
