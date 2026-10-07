import { describe, it, expect, beforeEach } from 'vitest';
import { StreakService, type StreakRow } from '../services/streak.service';

// In-memory streak prisma double keyed by canonical "a|b".
function createPrisma() {
  const rows = new Map<string, StreakRow>();
  let n = 0;
  const key = (w: any) => `${w.userAId_userBId.userAId}|${w.userAId_userBId.userBId}`;
  return {
    _rows: rows,
    streak: {
      async findUnique({ where }: any): Promise<StreakRow | null> {
        return rows.get(key(where)) ?? null;
      },
      async create({ data }: any): Promise<StreakRow> {
        const row: StreakRow = {
          id: `s-${++n}`,
          userAId: data.userAId,
          userBId: data.userBId,
          count: data.count ?? 0,
          lastFromA: data.lastFromA ?? null,
          lastFromB: data.lastFromB ?? null,
          lastIncrementAt: data.lastIncrementAt ?? null,
          startedAt: data.startedAt ?? null,
          expiresAt: data.expiresAt ?? null,
        };
        rows.set(`${row.userAId}|${row.userBId}`, row);
        return { ...row };
      },
      async update({ where, data }: any): Promise<StreakRow> {
        const k = key(where);
        const cur = rows.get(k)!;
        const next = { ...cur, ...data } as StreakRow;
        rows.set(k, next);
        return { ...next };
      },
    },
  };
}

const HOUR = 60 * 60 * 1000;
const at = (h: number) => new Date(1_000_000_000_000 + h * HOUR);

describe('StreakService', () => {
  let service: StreakService;
  let prisma: ReturnType<typeof createPrisma>;

  beforeEach(() => {
    prisma = createPrisma();
    service = new StreakService(prisma as never);
  });

  it('does not start a streak from a one-sided message', async () => {
    const v = await service.recordMessage('alice', 'bob', at(0));
    expect(v.count).toBe(0);
    expect(v.active).toBe(false);
  });

  it('starts a streak at 1 when both message within 24h (order-independent pair)', async () => {
    await service.recordMessage('bob', 'alice', at(0));
    const v = await service.recordMessage('alice', 'bob', at(2));
    expect(v.count).toBe(1);
    expect(v.active).toBe(true);
    // Canonical ordering: alice < bob.
    expect(v.userAId).toBe('alice');
    expect(v.userBId).toBe('bob');
    expect(v.expiresAt).not.toBeNull();
  });

  it('increments at most once per 24h window', async () => {
    await service.recordMessage('alice', 'bob', at(0));
    await service.recordMessage('bob', 'alice', at(1)); // count -> 1
    // More messages within the same day do NOT increment.
    await service.recordMessage('alice', 'bob', at(3));
    let v = await service.recordMessage('bob', 'alice', at(5));
    expect(v.count).toBe(1);
    // Next day, both exchange again -> increments to 2.
    await service.recordMessage('alice', 'bob', at(26));
    v = await service.recordMessage('bob', 'alice', at(27));
    expect(v.count).toBe(2);
  });

  it('breaks the streak when the mutual exchange lapses past 24h', async () => {
    await service.recordMessage('alice', 'bob', at(0));
    await service.recordMessage('bob', 'alice', at(1)); // count 1, expiresAt = min(0,1)+24h = at(24)
    // Read well after expiry: count reported as 0 / inactive.
    const v = await service.getStreak('alice', 'bob', at(48));
    expect(v.count).toBe(0);
    expect(v.active).toBe(false);
  });

  it('a single message after a break does not resurrect; both must exchange again', async () => {
    await service.recordMessage('alice', 'bob', at(0));
    await service.recordMessage('bob', 'alice', at(1)); // count 1, expires at(24)
    // After expiry, alice messages once -> resets to 0 (not 1).
    const afterBreak = await service.recordMessage('alice', 'bob', at(50));
    expect(afterBreak.count).toBe(0);
    // bob replies within 24h -> restarts at 1.
    const restarted = await service.recordMessage('bob', 'alice', at(51));
    expect(restarted.count).toBe(1);
    expect(restarted.active).toBe(true);
  });

  it('getStreak returns 0 for an unknown pair', async () => {
    const v = await service.getStreak('x', 'y', at(0));
    expect(v.count).toBe(0);
    expect(v.active).toBe(false);
  });

  it('rejects a self-streak', async () => {
    await expect(service.recordMessage('alice', 'alice', at(0))).rejects.toThrow();
  });
});
