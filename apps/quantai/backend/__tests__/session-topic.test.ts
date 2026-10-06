import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SessionService,
  normalizeTopic,
  MAX_TOPIC_LENGTH,
} from '../services/session.service';

function createMockPrisma() {
  return {
    aISession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
  };
}

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    title: 'New Session',
    model: 'gpt-4',
    systemPrompt: null,
    totalTokensUsed: 0,
    totalCost: 0,
    tags: [],
    isArchived: false,
    isPinned: false,
    sourceApp: null,
    topic: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('normalizeTopic', () => {
  it('returns null for null/undefined/blank', () => {
    expect(normalizeTopic(null)).toBeNull();
    expect(normalizeTopic(undefined)).toBeNull();
    expect(normalizeTopic('')).toBeNull();
    expect(normalizeTopic('   ')).toBeNull();
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeTopic('  my   topic  ')).toBe('my topic');
  });

  it('caps length at MAX_TOPIC_LENGTH', () => {
    expect(normalizeTopic('x'.repeat(500))).toHaveLength(MAX_TOPIC_LENGTH);
  });
});

describe('SessionService topic support (side chats)', () => {
  let service: SessionService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new SessionService(prisma as never);
  });

  describe('createSession', () => {
    it('stores a normalized topic', async () => {
      prisma.aISession.create.mockResolvedValue(baseSession({ topic: 'work' }));
      await service.createSession('user-1', { topic: '  work  ' });
      expect(prisma.aISession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ topic: 'work' }) }),
      );
    });

    it('stores null topic by default', async () => {
      prisma.aISession.create.mockResolvedValue(baseSession());
      await service.createSession('user-1', {});
      expect(prisma.aISession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ topic: null }) }),
      );
    });
  });

  describe('updateSession', () => {
    it('can set and clear the topic', async () => {
      prisma.aISession.findUnique.mockResolvedValue(baseSession());
      prisma.aISession.update.mockResolvedValue(baseSession({ topic: 'research' }));

      await service.updateSession('session-1', 'user-1', { topic: 'research' });
      expect(prisma.aISession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ topic: 'research' }) }),
      );

      prisma.aISession.update.mockResolvedValue(baseSession({ topic: null }));
      await service.updateSession('session-1', 'user-1', { topic: null });
      expect(prisma.aISession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ topic: null }) }),
      );
    });
  });

  describe('setSessionTopic', () => {
    it('moves a session into a topic', async () => {
      prisma.aISession.findUnique.mockResolvedValue(baseSession());
      prisma.aISession.update.mockResolvedValue(baseSession({ topic: 'travel' }));

      const result = await service.setSessionTopic('session-1', 'user-1', 'travel');
      expect(result.topic).toBe('travel');
      expect(prisma.aISession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: expect.objectContaining({ topic: 'travel' }),
      });
    });

    it('blank topic moves the session back to main chats (null)', async () => {
      prisma.aISession.findUnique.mockResolvedValue(baseSession({ topic: 'travel' }));
      prisma.aISession.update.mockResolvedValue(baseSession({ topic: null }));

      await service.setSessionTopic('session-1', 'user-1', '   ');
      expect(prisma.aISession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ topic: null }) }),
      );
    });

    it('throws 404 for a missing session', async () => {
      prisma.aISession.findUnique.mockResolvedValue(null);
      await expect(service.setSessionTopic('nope', 'user-1', 'x')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws 403 when the session belongs to another user', async () => {
      prisma.aISession.findUnique.mockResolvedValue(baseSession({ userId: 'other' }));
      await expect(service.setSessionTopic('session-1', 'user-1', 'x')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('listSessions with topic filter', () => {
    it('filters by exact topic', async () => {
      prisma.aISession.findMany.mockResolvedValue([]);
      prisma.aISession.count.mockResolvedValue(0);

      await service.listSessions('user-1', { topic: 'work' });
      const where = prisma.aISession.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ userId: 'user-1', deletedAt: null, topic: 'work' });
    });

    it('__untagged__ style: null topic selects main chats', async () => {
      prisma.aISession.findMany.mockResolvedValue([]);
      prisma.aISession.count.mockResolvedValue(0);

      await service.listSessions('user-1', { topic: null });
      const where = prisma.aISession.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ topic: null });
    });

    it('sideChatsOnly returns only tagged sessions', async () => {
      prisma.aISession.findMany.mockResolvedValue([]);
      prisma.aISession.count.mockResolvedValue(0);

      await service.listSessions('user-1', { sideChatsOnly: true });
      const where = prisma.aISession.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ topic: { not: null } });
    });

    it('no topic filter returns everything (backwards compatible)', async () => {
      prisma.aISession.findMany.mockResolvedValue([]);
      prisma.aISession.count.mockResolvedValue(0);

      await service.listSessions('user-1', {});
      const where = prisma.aISession.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ userId: 'user-1', deletedAt: null });
    });
  });

  describe('listTopics', () => {
    it('returns distinct topics with counts', async () => {
      prisma.aISession.groupBy.mockResolvedValue([
        { topic: 'work', _count: { topic: 3 } },
        { topic: 'travel', _count: { topic: 1 } },
      ]);

      const topics = await service.listTopics('user-1');
      expect(topics).toEqual([
        { topic: 'work', count: 3 },
        { topic: 'travel', count: 1 },
      ]);
      expect(prisma.aISession.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['topic'],
          where: expect.objectContaining({ userId: 'user-1', topic: { not: null } }),
        }),
      );
    });

    it('returns an empty array when the user has no topics (honest empty state)', async () => {
      prisma.aISession.groupBy.mockResolvedValue([]);
      await expect(service.listTopics('user-1')).resolves.toEqual([]);
    });
  });
});
