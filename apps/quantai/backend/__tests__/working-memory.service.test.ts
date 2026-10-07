import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkingMemoryService, type WorkingMemoryState } from '../services/working-memory.service';
import type Redis from 'ioredis';

describe('WorkingMemoryService (Layer 1 Redis Working Memory)', () => {
  let service: WorkingMemoryService;

  beforeEach(() => {
    service = new WorkingMemoryService({ defaultTtlSeconds: 3600, maxRecentTurns: 5 });
  });

  describe('In-memory Fallback Mode', () => {
    it('returns null for an uninitialized session', async () => {
      const state = await service.getState('session-unknown');
      expect(state).toBeNull();
    });

    it('saves and retrieves working memory state', async () => {
      const initialState: WorkingMemoryState = {
        sessionId: 'session-101',
        userId: 'user-001',
        activeApp: 'quantmail',
        currentIntent: 'draft_email',
        contextVariables: { recipient: 'bob@example.com', topic: 'Architecture' },
        recentTurns: [{ role: 'user', content: 'Draft an email to Bob', timestamp: Date.now() }],
        scratchpad: 'User wants an email drafted about architecture.',
        updatedAt: Date.now(),
      };

      await service.setState(initialState);
      const retrieved = await service.getState('session-101');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.userId).toBe('user-001');
      expect(retrieved?.activeApp).toBe('quantmail');
      expect(retrieved?.currentIntent).toBe('draft_email');
      expect(retrieved?.contextVariables).toEqual({
        recipient: 'bob@example.com',
        topic: 'Architecture',
      });
      expect(retrieved?.recentTurns).toHaveLength(1);
    });

    it('appends conversation turns and enforces maxRecentTurns bound', async () => {
      for (let i = 1; i <= 8; i++) {
        await service.appendTurn(
          'session-turns',
          'user-002',
          i % 2 === 1 ? 'user' : 'assistant',
          `Message ${i}`,
        );
      }

      const state = await service.getState('session-turns');
      expect(state).not.toBeNull();
      expect(state?.recentTurns).toHaveLength(5); // clamped to maxRecentTurns = 5
      expect(state?.recentTurns[0]?.content).toBe('Message 4');
      expect(state?.recentTurns[4]?.content).toBe('Message 8');
    });

    it('sets and retrieves context variables', async () => {
      await service.appendTurn('session-vars', 'user-003', 'user', 'Hello');
      await service.setContextVariable('session-vars', 'selectedRepo', 'quant/quant-core');
      await service.setContextVariable('session-vars', 'activePr', 42);

      const repo = await service.getContextVariable<string>('session-vars', 'selectedRepo');
      const pr = await service.getContextVariable<number>('session-vars', 'activePr');

      expect(repo).toBe('quant/quant-core');
      expect(pr).toBe(42);
    });

    it('clears state on session cleanup', async () => {
      await service.appendTurn('session-del', 'user-004', 'user', 'Goodbye');
      expect(await service.getState('session-del')).not.toBeNull();

      await service.clearState('session-del');
      expect(await service.getState('session-del')).toBeNull();
    });
  });

  describe('Redis Mock Client Integration', () => {
    it('executes Redis GET and SET with TTL when connected', async () => {
      const mockStorage = new Map<string, string>();
      const mockRedis = {
        get: vi.fn(async (key: string) => mockStorage.get(key) ?? null),
        set: vi.fn(async (key: string, value: string, _mode?: string, _ttl?: number) => {
          mockStorage.set(key, value);
          return 'OK';
        }),
        del: vi.fn(async (key: string) => {
          mockStorage.delete(key);
          return 1;
        }),
        quit: vi.fn(async () => 'OK'),
      } as unknown as Redis;

      const redisService = new WorkingMemoryService({
        client: mockRedis,
        defaultTtlSeconds: 1800,
      });

      const state: WorkingMemoryState = {
        sessionId: 'redis-sess-1',
        userId: 'user-redis',
        contextVariables: { mode: 'fast' },
        recentTurns: [],
        updatedAt: Date.now(),
      };

      await redisService.setState(state);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'quant:working_memory:redis-sess-1',
        expect.any(String),
        'EX',
        1800,
      );

      const retrieved = await redisService.getState('redis-sess-1');
      expect(mockRedis.get).toHaveBeenCalledWith('quant:working_memory:redis-sess-1');
      expect(retrieved?.userId).toBe('user-redis');

      await redisService.clearState('redis-sess-1');
      expect(mockRedis.del).toHaveBeenCalledWith('quant:working_memory:redis-sess-1');
    });
  });
});
