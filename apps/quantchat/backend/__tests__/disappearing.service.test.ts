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
    // QC-F-017: the disappear timer is membership-gated; default requester is a member.
    conversationMember: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'member-1',
        conversationId: 'c1',
        userId: 'user-1',
        role: 'MEMBER',
      }),
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
      const result = await service.setConversationTimer('c1', 30, 'user-1');
      expect(result.disappearTimer).toBe(30);
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { disappearTimer: 30 },
      });
    });

    it('normalizes 0 / null to disabled', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.setConversationTimer('c1', 0, 'user-1');
      expect(result.disappearTimer).toBeNull();
    });

    it('rejects unsupported durations', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      await expect(service.setConversationTimer('c1', 7, 'user-1')).rejects.toThrow(
        'Unsupported disappear timer duration',
      );
    });
  });

  describe('markViewedAndScheduleDeletion (14.9)', () => {
    it('records the view, sets expiresAt, and schedules deletion', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1', metadata: {} });
      prisma.message.update.mockResolvedValue({});

      const result = await service.markViewedAndScheduleDeletion('m1', 5, 'user-1');
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
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        metadata: { viewedAt },
      });

      const result = await service.markViewedAndScheduleDeletion('m1', 10, 'user-1');
      expect(result.viewedAt.toISOString()).toBe(viewedAt);
      // No new update/schedule when already viewed.
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    // QC-F-038: a non-member must not be able to start a message's
    // destruction timer — and nothing may be scheduled as a side effect.
    it('rejects a non-member view with 403 NOT_A_MEMBER and schedules nothing', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1', metadata: {} });
      prisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(
        service.markViewedAndScheduleDeletion('m1', 5, 'user-stranger'),
      ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_A_MEMBER' });

      expect(prisma.message.update).not.toHaveBeenCalled();
      // Even after time passes, no expiry update may fire for the denied view.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    // QC-F-038: a member who left (leftAt set) is no longer an active member;
    // the gate queries with leftAt: null, so the removed row must not match.
    it('rejects a removed member view (leftAt filter is respected)', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1', metadata: {} });
      // Simulate the DB row for a removed member: its leftAt is a Date, so a
      // findFirst filtered on leftAt: null finds nothing.
      prisma.conversationMember.findFirst.mockImplementation(
        async ({ where }: { where: { leftAt: Date | null } }) =>
          where.leftAt === null ? null : { id: 'member-old' },
      );

      await expect(
        service.markViewedAndScheduleDeletion('m1', 5, 'user-left'),
      ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_A_MEMBER' });
      expect(prisma.conversationMember.findFirst).toHaveBeenCalledWith({
        where: { conversationId: 'c1', userId: 'user-left', leftAt: null },
      });
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    // QC-F-038: off-preset timers are rejected even for members — the old
    // schema allowed min(1) with no max, so timerSeconds=1 was the attack.
    it.each([1, 7, 999999999])(
      'rejects off-preset timerSeconds=%s for a member with 400 INVALID_TIMER',
      async (seconds) => {
        prisma.message.findUnique.mockResolvedValue({
          id: 'm1',
          conversationId: 'c1',
          metadata: {},
        });

        await expect(
          service.markViewedAndScheduleDeletion('m1', seconds, 'user-1'),
        ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TIMER' });
        expect(prisma.message.update).not.toHaveBeenCalled();
      },
    );

    it('accepts every supported preset for a member', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1', metadata: {} });
      prisma.message.update.mockResolvedValue({});

      for (const seconds of DisappearingService.VALID_TIMER_SECONDS) {
        const result = await service.markViewedAndScheduleDeletion('m1', seconds, 'user-1');
        expect(result.expiresAt.getTime() - result.viewedAt.getTime()).toBe(seconds * 1000);
      }
    });

    // QC-F-038: timer validation runs before the idempotency shortcut, so an
    // invalid timer on an already-viewed message is still a 400.
    it('rejects an invalid timer even when the message was already viewed', async () => {
      const viewedAt = new Date('2024-01-01T00:00:00Z').toISOString();
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        metadata: { viewedAt },
      });

      await expect(
        service.markViewedAndScheduleDeletion('m1', 1, 'user-1'),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TIMER' });
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    // Existence is checked before membership: a missing message is a 404 for
    // everyone and the membership lookup never runs.
    it('throws 404 for a missing message without consulting membership', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.markViewedAndScheduleDeletion('nope', 5, 'user-1'),
      ).rejects.toMatchObject({ statusCode: 404, code: 'MESSAGE_NOT_FOUND' });
      expect(prisma.conversationMember.findFirst).not.toHaveBeenCalled();
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
      // Existence precedes membership (same ordering as markViewed).
      expect(prisma.conversationMember.findFirst).not.toHaveBeenCalled();
    });

    // QC-F-038: a non-member must not inject a screenshot system message
    // into a conversation they do not belong to.
    it('rejects a non-member screenshot with 403 NOT_A_MEMBER and creates nothing', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1' });
      prisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(service.recordScreenshot('m1', 'user-stranger', 'Stranger')).rejects.toMatchObject(
        { statusCode: 403, code: 'NOT_A_MEMBER' },
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    // QC-F-038: removed members (leftAt set) are denied the same way.
    it('rejects a removed member screenshot (leftAt filter is respected)', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1' });
      prisma.conversationMember.findFirst.mockImplementation(
        async ({ where }: { where: { leftAt: Date | null } }) =>
          where.leftAt === null ? null : { id: 'member-old' },
      );

      await expect(service.recordScreenshot('m1', 'user-left', 'Lefty')).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_A_MEMBER',
      });
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });
});
