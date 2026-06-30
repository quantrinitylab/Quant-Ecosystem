import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SafetyService } from '../services/safety.service';

function createMockPrisma() {
  return {
    userReport: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userSafetySetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

describe('SafetyService', () => {
  let service: SafetyService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new SafetyService(prisma as never);
  });

  describe('reportContent', () => {
    it('persists a PENDING report with trimmed details', async () => {
      prisma.userReport.create.mockResolvedValue({ id: 'r1' });

      await service.reportContent('reporter-1', {
        targetType: 'VIDEO',
        targetId: 'v1',
        reason: 'NUDITY',
        details: '  inappropriate  ',
      });

      expect(prisma.userReport.create).toHaveBeenCalledWith({
        data: {
          reporterId: 'reporter-1',
          targetType: 'VIDEO',
          targetId: 'v1',
          reason: 'NUDITY',
          details: 'inappropriate',
          status: 'PENDING',
        },
      });
    });

    it('stores null details when omitted/blank', async () => {
      prisma.userReport.create.mockResolvedValue({ id: 'r1' });

      await service.reportContent('reporter-1', {
        targetType: 'PROFILE',
        targetId: 'p1',
        reason: 'SPAM',
        details: '   ',
      });

      expect(prisma.userReport.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ details: null }) }),
      );
    });

    it('rejects an invalid target type', async () => {
      await expect(
        service.reportContent('r', {
          targetType: 'BOGUS' as never,
          targetId: 'x',
          reason: 'SPAM',
        }),
      ).rejects.toThrow('Invalid report target type');
      expect(prisma.userReport.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid reason', async () => {
      await expect(
        service.reportContent('r', {
          targetType: 'VIDEO',
          targetId: 'x',
          reason: 'WHATEVER' as never,
        }),
      ).rejects.toThrow('Invalid report reason');
    });

    it('rejects a blank target id', async () => {
      await expect(
        service.reportContent('r', { targetType: 'VIDEO', targetId: '  ', reason: 'SPAM' }),
      ).rejects.toThrow('target id is required');
    });
  });

  describe('getSettings', () => {
    it('returns safe defaults when the user has no row', async () => {
      prisma.userSafetySetting.findUnique.mockResolvedValue(null);

      const settings = await service.getSettings('user-1');

      expect(settings).toEqual({
        hideSensitiveContent: true,
        allowRandomChat: true,
        blockUnknownMessages: false,
        filteredKeywords: [],
      });
    });

    it('maps a persisted row', async () => {
      prisma.userSafetySetting.findUnique.mockResolvedValue({
        userId: 'user-1',
        hideSensitiveContent: false,
        allowRandomChat: false,
        blockUnknownMessages: true,
        filteredKeywords: ['spam'],
      });

      const settings = await service.getSettings('user-1');

      expect(settings).toEqual({
        hideSensitiveContent: false,
        allowRandomChat: false,
        blockUnknownMessages: true,
        filteredKeywords: ['spam'],
      });
    });
  });

  describe('updateSettings', () => {
    it('merges a partial patch over current values and upserts', async () => {
      prisma.userSafetySetting.findUnique.mockResolvedValue(null); // current = defaults
      prisma.userSafetySetting.upsert.mockResolvedValue({});

      const result = await service.updateSettings('user-1', { allowRandomChat: false });

      expect(result.allowRandomChat).toBe(false);
      expect(result.hideSensitiveContent).toBe(true); // unchanged default
      expect(prisma.userSafetySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          create: expect.objectContaining({ userId: 'user-1', allowRandomChat: false }),
          update: expect.objectContaining({ allowRandomChat: false }),
        }),
      );
    });

    it('normalizes keywords (trim, lowercase, dedupe, drop empties)', async () => {
      prisma.userSafetySetting.findUnique.mockResolvedValue(null);
      prisma.userSafetySetting.upsert.mockResolvedValue({});

      const result = await service.updateSettings('user-1', {
        filteredKeywords: ['  Spam ', 'spam', 'ABUSE', '', '   '],
      });

      expect(result.filteredKeywords).toEqual(['spam', 'abuse']);
    });
  });
});
