import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VacationResponderService } from '../services/vacation-responder.service';

function createMockPrisma() {
  return {
    vacationResponder: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    vacationAutoReplyLog: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    contact: {
      findFirst: vi.fn(),
    },
  };
}

function makeResponder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vr-1',
    userId: 'user-1',
    enabled: true,
    subject: 'Out of office',
    message: 'I am away until next week.',
    startAt: null as Date | null,
    endAt: null as Date | null,
    onlyContacts: false,
    intervalDays: 3,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('VacationResponderService', () => {
  let service: VacationResponderService;
  let prisma: ReturnType<typeof createMockPrisma>;
  const NOW = new Date('2024-06-15T12:00:00Z');

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new VacationResponderService(prisma as never);
  });

  describe('getResponder', () => {
    it('returns the responder when one exists', async () => {
      const responder = makeResponder();
      prisma.vacationResponder.findUnique.mockResolvedValue(responder);

      const result = await service.getResponder('user-1');

      expect(result).toEqual(responder);
      expect(prisma.vacationResponder.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('returns null when no responder is configured', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(null);

      const result = await service.getResponder('user-1');

      expect(result).toBeNull();
    });
  });

  describe('upsertResponder', () => {
    it('creates/updates with valid input', async () => {
      const responder = makeResponder();
      prisma.vacationResponder.upsert.mockResolvedValue(responder);

      const result = await service.upsertResponder('user-1', {
        subject: 'Out of office',
        message: 'I am away until next week.',
        intervalDays: 3,
      });

      expect(result).toEqual(responder);
      expect(prisma.vacationResponder.upsert).toHaveBeenCalledTimes(1);
      const args = prisma.vacationResponder.upsert.mock.calls[0]?.[0] as {
        where: { userId: string };
        create: Record<string, unknown>;
      };
      expect(args.where).toEqual({ userId: 'user-1' });
      expect(args.create.subject).toBe('Out of office');
    });

    it('rejects an inverted date range with INVALID_DATE_RANGE', async () => {
      await expect(
        service.upsertResponder('user-1', {
          subject: 'OOO',
          message: 'away',
          startAt: new Date('2024-06-20T00:00:00Z'),
          endAt: new Date('2024-06-10T00:00:00Z'),
        }),
      ).rejects.toThrow('startAt must be before endAt');
      expect(prisma.vacationResponder.upsert).not.toHaveBeenCalled();
    });

    it('rejects equal start and end timestamps', async () => {
      const same = new Date('2024-06-20T00:00:00Z');
      await expect(
        service.upsertResponder('user-1', {
          subject: 'OOO',
          message: 'away',
          startAt: same,
          endAt: new Date(same.getTime()),
        }),
      ).rejects.toThrow('startAt must be before endAt');
    });

    it('rejects a negative intervalDays', async () => {
      await expect(
        service.upsertResponder('user-1', {
          subject: 'OOO',
          message: 'away',
          intervalDays: -1,
        }),
      ).rejects.toThrow('intervalDays must be zero or greater');
      expect(prisma.vacationResponder.upsert).not.toHaveBeenCalled();
    });

    it('allows a valid date range', async () => {
      const responder = makeResponder({
        startAt: new Date('2024-06-10T00:00:00Z'),
        endAt: new Date('2024-06-20T00:00:00Z'),
      });
      prisma.vacationResponder.upsert.mockResolvedValue(responder);

      const result = await service.upsertResponder('user-1', {
        subject: 'OOO',
        message: 'away',
        startAt: new Date('2024-06-10T00:00:00Z'),
        endAt: new Date('2024-06-20T00:00:00Z'),
      });

      expect(result).toEqual(responder);
    });
  });

  describe('setEnabled', () => {
    it('updates the enabled flag when the responder exists', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(makeResponder({ enabled: false }));
      prisma.vacationResponder.update.mockResolvedValue(makeResponder({ enabled: true }));

      const result = await service.setEnabled('user-1', true);

      expect(result.enabled).toBe(true);
      expect(prisma.vacationResponder.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { enabled: true },
      });
    });

    it('throws when no responder exists', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(null);

      await expect(service.setEnabled('user-1', true)).rejects.toThrow(
        'Vacation responder not found',
      );
      expect(prisma.vacationResponder.update).not.toHaveBeenCalled();
    });
  });

  describe('shouldAutoReply', () => {
    it('returns true inside the window with no prior log', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(
        makeResponder({
          startAt: new Date('2024-06-01T00:00:00Z'),
          endAt: new Date('2024-06-30T00:00:00Z'),
        }),
      );
      prisma.vacationAutoReplyLog.findFirst.mockResolvedValue(null);

      const result = await service.shouldAutoReply('user-1', 'alice@example.com', NOW);

      expect(result).toBe(true);
    });

    it('returns false when the responder is disabled', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(makeResponder({ enabled: false }));

      const result = await service.shouldAutoReply('user-1', 'alice@example.com', NOW);

      expect(result).toBe(false);
    });

    it('returns false when no responder exists', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(null);

      const result = await service.shouldAutoReply('user-1', 'alice@example.com', NOW);

      expect(result).toBe(false);
    });

    it('returns false before the window starts', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(
        makeResponder({ startAt: new Date('2024-07-01T00:00:00Z') }),
      );

      const result = await service.shouldAutoReply('user-1', 'alice@example.com', NOW);

      expect(result).toBe(false);
    });

    it('returns false after the window ends', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(
        makeResponder({ endAt: new Date('2024-06-01T00:00:00Z') }),
      );

      const result = await service.shouldAutoReply('user-1', 'alice@example.com', NOW);

      expect(result).toBe(false);
    });

    it('gates on contacts when onlyContacts is enabled', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(makeResponder({ onlyContacts: true }));
      prisma.vacationAutoReplyLog.findFirst.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue(null);

      const notContact = await service.shouldAutoReply('user-1', 'stranger@example.com', NOW);
      expect(notContact).toBe(false);

      prisma.contact.findFirst.mockResolvedValue({
        id: 'c-1',
        userId: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
      });
      const knownContact = await service.shouldAutoReply('user-1', 'alice@example.com', NOW);
      expect(knownContact).toBe(true);
    });

    it('rate-limits when a recent log exists within intervalDays', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(makeResponder({ intervalDays: 3 }));
      // Replied 1 day ago — inside the 3-day interval.
      prisma.vacationAutoReplyLog.findFirst.mockResolvedValue({
        id: 'log-1',
        userId: 'user-1',
        toAddress: 'alice@example.com',
        repliedAt: new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000),
      });

      const result = await service.shouldAutoReply('user-1', 'alice@example.com', NOW);

      expect(result).toBe(false);
    });

    it('replies again once the interval has elapsed', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(makeResponder({ intervalDays: 3 }));
      // Replied 5 days ago — outside the 3-day interval.
      prisma.vacationAutoReplyLog.findFirst.mockResolvedValue({
        id: 'log-1',
        userId: 'user-1',
        toAddress: 'alice@example.com',
        repliedAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000),
      });

      const result = await service.shouldAutoReply('user-1', 'alice@example.com', NOW);

      expect(result).toBe(true);
    });

    it('skips automated senders (no-reply, mailer-daemon, postmaster, empty)', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(makeResponder());
      prisma.vacationAutoReplyLog.findFirst.mockResolvedValue(null);

      expect(await service.shouldAutoReply('user-1', 'no-reply@corp.com', NOW)).toBe(false);
      expect(await service.shouldAutoReply('user-1', 'noreply@corp.com', NOW)).toBe(false);
      expect(await service.shouldAutoReply('user-1', 'MAILER-DAEMON@corp.com', NOW)).toBe(false);
      expect(await service.shouldAutoReply('user-1', 'postmaster@corp.com', NOW)).toBe(false);
      expect(await service.shouldAutoReply('user-1', '   ', NOW)).toBe(false);
      // The responder lookup should be skipped for automated senders.
      expect(prisma.vacationResponder.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('recordAutoReply', () => {
    it('upserts the log with repliedAt set to now', async () => {
      prisma.vacationAutoReplyLog.upsert.mockResolvedValue({
        id: 'log-1',
        userId: 'user-1',
        toAddress: 'alice@example.com',
        repliedAt: NOW,
      });

      const result = await service.recordAutoReply('user-1', 'alice@example.com', NOW);

      expect(result.repliedAt).toEqual(NOW);
      expect(prisma.vacationAutoReplyLog.upsert).toHaveBeenCalledWith({
        where: { userId_toAddress: { userId: 'user-1', toAddress: 'alice@example.com' } },
        create: { userId: 'user-1', toAddress: 'alice@example.com', repliedAt: NOW },
        update: { repliedAt: NOW },
      });
    });
  });

  describe('buildAutoReply', () => {
    it('records the reply and returns subject/message when warranted', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(
        makeResponder({ subject: 'OOO', message: 'Back soon' }),
      );
      prisma.vacationAutoReplyLog.findFirst.mockResolvedValue(null);
      prisma.vacationAutoReplyLog.upsert.mockResolvedValue({
        id: 'log-1',
        userId: 'user-1',
        toAddress: 'alice@example.com',
        repliedAt: NOW,
      });

      const result = await service.buildAutoReply('user-1', 'alice@example.com', NOW);

      expect(result).toEqual({ subject: 'OOO', message: 'Back soon' });
      expect(prisma.vacationAutoReplyLog.upsert).toHaveBeenCalledTimes(1);
    });

    it('returns null and records nothing when no reply is warranted', async () => {
      prisma.vacationResponder.findUnique.mockResolvedValue(makeResponder({ enabled: false }));

      const result = await service.buildAutoReply('user-1', 'alice@example.com', NOW);

      expect(result).toBeNull();
      expect(prisma.vacationAutoReplyLog.upsert).not.toHaveBeenCalled();
    });
  });
});
