import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionService } from '../services/session.service';

function createMockPrisma() {
  return {
    aISession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('SessionService', () => {
  let service: SessionService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new SessionService(prisma as never);
  });

  describe('createSession', () => {
    it('creates a session with default values', async () => {
      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        title: 'New Session',
        model: 'gpt-4',
        systemPrompt: null,
        totalTokensUsed: 0,
        totalCost: 0,
        isArchived: false,
        isPinned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      prisma.aISession.create.mockResolvedValue(mockSession);

      const result = await service.createSession('user-1', {});

      expect(result).toEqual(mockSession);
      expect(prisma.aISession.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          title: 'New Session',
          model: 'gpt-4',
          systemPrompt: null,
        },
      });
    });

    it('creates a session with custom title and model', async () => {
      prisma.aISession.create.mockResolvedValue({ id: 'session-2' });

      await service.createSession('user-1', {
        title: 'My Chat',
        model: 'claude-3-opus',
        systemPrompt: 'You are a helpful assistant.',
      });

      expect(prisma.aISession.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          title: 'My Chat',
          model: 'claude-3-opus',
          systemPrompt: 'You are a helpful assistant.',
        },
      });
    });
  });

  describe('getSession', () => {
    it('returns session with messages when user owns it', async () => {
      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        title: 'Test',
        messages: [{ id: 'msg-1', content: 'Hello' }],
      };
      prisma.aISession.findUnique.mockResolvedValue(mockSession);

      const result = await service.getSession('session-1', 'user-1');

      expect(result).toEqual(mockSession);
      expect(prisma.aISession.findUnique).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    });

    it('throws SESSION_NOT_FOUND for non-existent session', async () => {
      prisma.aISession.findUnique.mockResolvedValue(null);

      await expect(service.getSession('missing', 'user-1')).rejects.toThrow('Session not found');
    });

    it('throws ACCESS_DENIED when user does not own session', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-other',
      });

      await expect(service.getSession('session-1', 'user-1')).rejects.toThrow('Access denied');
    });
  });

  describe('listSessions', () => {
    it('returns paginated sessions sorted by updatedAt desc', async () => {
      const sessions = [
        { id: 'session-1', title: 'First' },
        { id: 'session-2', title: 'Second' },
      ];
      prisma.aISession.findMany.mockResolvedValue(sessions);
      prisma.aISession.count.mockResolvedValue(15);

      const result = await service.listSessions('user-1', { page: 1, pageSize: 10 });

      expect(result.data).toEqual(sessions);
      expect(result.total).toBe(15);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(2);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
      expect(prisma.aISession.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', deletedAt: null },
        skip: 0,
        take: 10,
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('uses default pagination when not specified', async () => {
      prisma.aISession.findMany.mockResolvedValue([]);
      prisma.aISession.count.mockResolvedValue(0);

      await service.listSessions('user-1');

      expect(prisma.aISession.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', deletedAt: null },
        skip: 0,
        take: 20,
        orderBy: { updatedAt: 'desc' },
      });
    });
  });

  describe('updateSession', () => {
    it('updates session title when user owns it', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
      });
      prisma.aISession.update.mockResolvedValue({
        id: 'session-1',
        title: 'Updated Title',
      });

      const result = await service.updateSession('session-1', 'user-1', {
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
    });

    it('throws ACCESS_DENIED when user does not own session', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-other',
      });

      await expect(service.updateSession('session-1', 'user-1', { title: 'Hack' })).rejects.toThrow(
        'Access denied',
      );
    });
  });

  describe('archiveSession', () => {
    it('sets isArchived flag to true', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        isArchived: false,
      });
      prisma.aISession.update.mockResolvedValue({
        id: 'session-1',
        isArchived: true,
      });

      const result = await service.archiveSession('session-1', 'user-1');

      expect(result.isArchived).toBe(true);
      expect(prisma.aISession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { isArchived: true, updatedAt: expect.any(Date) },
      });
    });

    it('throws SESSION_NOT_FOUND for non-existent session', async () => {
      prisma.aISession.findUnique.mockResolvedValue(null);

      await expect(service.archiveSession('missing', 'user-1')).rejects.toThrow(
        'Session not found',
      );
    });
  });

  describe('deleteSession', () => {
    it('soft deletes by setting deletedAt', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
      });
      prisma.aISession.update.mockResolvedValue({
        id: 'session-1',
        deletedAt: new Date(),
      });

      const result = await service.deleteSession('session-1', 'user-1');

      expect(result.deletedAt).not.toBeNull();
      expect(prisma.aISession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { deletedAt: expect.any(Date), updatedAt: expect.any(Date) },
      });
    });

    it('throws ACCESS_DENIED when user does not own session', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-other',
      });

      await expect(service.deleteSession('session-1', 'user-1')).rejects.toThrow('Access denied');
    });
  });

  describe('pinSession', () => {
    it('toggles isPinned from false to true', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        isPinned: false,
      });
      prisma.aISession.update.mockResolvedValue({
        id: 'session-1',
        isPinned: true,
      });

      const result = await service.pinSession('session-1', 'user-1');

      expect(result.isPinned).toBe(true);
      expect(prisma.aISession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { isPinned: true, updatedAt: expect.any(Date) },
      });
    });

    it('toggles isPinned from true to false', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        isPinned: true,
      });
      prisma.aISession.update.mockResolvedValue({
        id: 'session-1',
        isPinned: false,
      });

      const result = await service.pinSession('session-1', 'user-1');

      expect(result.isPinned).toBe(false);
    });
  });
});
