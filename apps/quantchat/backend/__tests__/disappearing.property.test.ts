import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DisappearingService } from '../services/disappearing.service';

// ----------------------------------------------------------------------------
// Deterministic, seedable PRNG (mulberry32) so any failure is reproducible.
// ----------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** The supported disappear-timer presets (seconds), per Requirement 18.1. */
const TIMER_PRESETS = DisappearingService.VALID_TIMER_SECONDS;

// ============================================================================
// Feature: quantchat-mega-upgrade, Property 38: Disappearing timer applies to new messages.
//
// Validates: Requirements 18.1.
//
// Property: For any conversation with disappear timer D and any new message,
// message.expiresAt SHALL equal message.viewedAt + D seconds. We drive the
// real expiry calculation in DisappearingService.markViewedAndScheduleDeletion
// with a randomly chosen preset D and a randomly chosen "view time" (system
// clock), and assert expiresAt === viewedAt + D * 1000 ms.
// ============================================================================
describe('Disappearing timer applies to new messages (Property 38)', () => {
  let service: DisappearingService;
  let prisma: {
    message: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    prisma = {
      message: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    service = new DisappearingService(prisma as never);
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  it('sets expiresAt = viewedAt + D*1000 for every preset/view-time across >=100 cases', async () => {
    const rand = mulberry32(0x38f00d);
    let cases = 0;

    for (let i = 0; i < 130; i++) {
      const seconds = TIMER_PRESETS[randInt(rand, 0, TIMER_PRESETS.length - 1)];
      // Random "view time" within a wide window so viewedAt varies per case.
      const viewEpoch = 1_600_000_000_000 + randInt(rand, 0, 5_000_000_000);
      vi.setSystemTime(new Date(viewEpoch));

      // Fresh, never-viewed message so the first view records viewedAt = now.
      prisma.message.findUnique.mockResolvedValue({ id: `m${i}`, metadata: {} });

      const result = await service.markViewedAndScheduleDeletion(`m${i}`, seconds);

      expect(
        result.expiresAt.getTime() - result.viewedAt.getTime(),
        `case #${i} D=${seconds}s`,
      ).toBe(seconds * 1000);
      expect(result.viewedAt.getTime(), `case #${i} viewedAt == view time`).toBe(viewEpoch);

      // Drain the scheduled deletion timer so it does not leak between cases.
      await vi.advanceTimersByTimeAsync(seconds * 1000);
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });
});

// ============================================================================
// Feature: quantchat-mega-upgrade, Property 39: Expired disappearing messages are deleted.
//
// Validates: Requirements 18.2.
//
// Property: For any disappearing message whose timer has expired after being
// viewed, the message SHALL NOT be retrievable. Conversely, an unviewed message
// (no expiresAt) or a viewed-but-not-yet-expired message remains retrievable.
// We run the real cleanup worker (processExpiredMessages) against a stateful
// in-memory message store and verify retrievability matches the expected set.
// ============================================================================
type StoredMessage = {
  id: string;
  expiresAt: Date | null;
  isDeleted: boolean;
  content: string;
};

function makeStatefulPrisma(messages: StoredMessage[]) {
  const store = new Map<string, StoredMessage>(messages.map((m) => [m.id, { ...m }]));
  return {
    store,
    message: {
      findMany: vi.fn(
        async ({ where }: { where: { expiresAt: { lte: Date }; isDeleted: boolean } }) => {
          const now = where.expiresAt.lte.getTime();
          return [...store.values()]
            .filter(
              (m) =>
                m.expiresAt !== null &&
                m.expiresAt.getTime() <= now &&
                m.isDeleted === where.isDeleted,
            )
            .map((m) => ({ ...m }));
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: { in: string[] } };
          data: Partial<StoredMessage>;
        }) => {
          const ids = new Set(where.id.in);
          let count = 0;
          for (const m of store.values()) {
            if (ids.has(m.id)) {
              Object.assign(m, data);
              count += 1;
            }
          }
          return { count };
        },
      ),
    },
  };
}

/** A message is "retrievable" by participants when it has not been deleted. */
function isRetrievable(m: StoredMessage): boolean {
  return !m.isDeleted;
}

describe('Expired disappearing messages are deleted (Property 39)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('purges only viewed+expired messages; others remain retrievable, across >=100 cases', async () => {
    const rand = mulberry32(0x39beef);
    let cases = 0;

    for (let iter = 0; iter < 110; iter++) {
      const now = Date.now();
      const count = randInt(rand, 1, 12);
      const messages: StoredMessage[] = [];
      // Track ground-truth expectation for each message id.
      const shouldBePurged = new Map<string, boolean>();

      for (let i = 0; i < count; i++) {
        const id = `it${iter}-m${i}`;
        const kind = randInt(rand, 0, 2); // 0 = viewed+expired, 1 = viewed+future, 2 = unviewed
        let expiresAt: Date | null;
        let purged: boolean;
        if (kind === 0) {
          // Viewed and already expired (expiresAt in the past).
          expiresAt = new Date(now - randInt(rand, 1, 10_000));
          purged = true;
        } else if (kind === 1) {
          // Viewed but timer not yet elapsed (expiresAt in the future).
          expiresAt = new Date(now + randInt(rand, 1_000, 100_000));
          purged = false;
        } else {
          // Never viewed: no expiry scheduled.
          expiresAt = null;
          purged = false;
        }
        messages.push({ id, expiresAt, isDeleted: false, content: 'secret' });
        shouldBePurged.set(id, purged);
      }

      const prisma = makeStatefulPrisma(messages);
      const service = new DisappearingService(prisma as never);

      const purgedCount = await service.processExpiredMessages();

      const expectedPurged = [...shouldBePurged.values()].filter(Boolean).length;
      expect(purgedCount, `iter #${iter} purge count`).toBe(expectedPurged);

      for (const [id, expectPurged] of shouldBePurged) {
        const m = prisma.store.get(id)!;
        if (expectPurged) {
          expect(isRetrievable(m), `iter #${iter} ${id} should be purged`).toBe(false);
          expect(m.content).toBe('[Message expired]');
        } else {
          expect(isRetrievable(m), `iter #${iter} ${id} should remain`).toBe(true);
          expect(m.content).toBe('secret');
        }
      }

      service.destroy();
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
