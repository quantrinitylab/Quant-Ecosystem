import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DisappearingService } from '../services/disappearing.service';

function createMockPrisma() {
  return {
    message: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('DisappearingService (Tasks 14.8 / 14.9 / 14.10)', () => {
  let service: DisappearingService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.useFakeTimers();
    prisma = createMockPrisma();
    service = new DisappearingService(prisma as never);
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  describe('setConversationTimer (14.8)', () => {
    it('stores a supported duration', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.setConversationTimer('c1', 30);
      expect(result.disappearTimer).toBe(30);
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { disappearTimer: 30 },
      });
    });

    it('normalizes 0 / null to disabled', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.setConversationTimer('c1', 0);
      expect(result.disappearTimer).toBeNull();
    });

    it('rejects unsupported durations', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      await expect(service.setConversationTimer('c1', 7)).rejects.toThrow(
        'Unsupported disappear timer duration',
      );
    });
  });

  describe('markViewedAndScheduleDeletion (14.9)', () => {
    it('records the view, sets expiresAt, and schedules deletion', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', metadata: {} });
      prisma.message.update.mockResolvedValue({});

      const result = await service.markViewedAndScheduleDeletion('m1', 5);
      expect(result.expiresAt.getTime() - result.viewedAt.getTime()).toBe(5000);
      expect(prisma.message.update).toHaveBeenCalledTimes(1);

      // After the timer elapses the message is soft-deleted.
      await vi.advanceTimersByTimeAsync(5000);
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { isDeleted: true, content: '[Message expired]' },
      });
    });

    it('is idempotent — a second view does not extend the timer', async () => {
      const viewedAt = new Date('2024-01-01T00:00:00Z').toISOString();
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', metadata: { viewedAt } });

      const result = await service.markViewedAndScheduleDeletion('m1', 10);
      expect(result.viewedAt.toISOString()).toBe(viewedAt);
      // No new update/schedule when already viewed.
      expect(prisma.message.update).not.toHaveBeenCalled();
    });
  });

  describe('recordScreenshot (14.10)', () => {
    it('posts a system message naming the viewer', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1' });
      prisma.message.create.mockResolvedValue({ id: 'sys-1' });

      const result = await service.recordScreenshot('m1', 'user-9', 'Zara');
      expect(result.conversationId).toBe('c1');
      expect(result.systemMessageId).toBe('sys-1');

      const createArg = prisma.message.create.mock.calls[0][0];
      expect(createArg.data.content).toContain('Zara');
      expect(createArg.data.type).toBe('SYSTEM');
      expect(createArg.data.conversationId).toBe('c1');
    });

    it('throws when the target message is missing', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.recordScreenshot('missing', 'u', 'Z')).rejects.toThrow(
        'Message not found',
      );
    });
  });
});
