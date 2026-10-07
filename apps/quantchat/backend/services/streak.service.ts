// ============================================================================
// QuantChat - Streak Service (Snapchat-style messaging streaks)
// ============================================================================
//
// Maintains a per-pair messaging streak. The companion `notification-streak-
// expiry` lib only WARNS about streaks nearing expiry; this service is the
// engine that actually creates, increments, and breaks them.
//
// RULES (deterministic, documented):
//   * A streak is tracked per UNORDERED user pair, stored canonically as
//     (userAId, userBId) with userAId < userBId.
//   * `recordMessage(from, to, now)` records that `from` messaged `to`.
//   * The streak is "mutually active" when BOTH users have messaged within the
//     last 24h (now - lastFromA < 24h AND now - lastFromB < 24h).
//   * count starts at 1 the first time the pair is mutually active, and
//     increments at most ONCE per 24h window thereafter (now - lastIncrementAt
//     >= 24h) while it stays mutually active.
//   * expiresAt = min(lastFromA, lastFromB) + 24h — the moment the streak breaks
//     if the mutual exchange does not continue.
//   * A message arriving AFTER the streak already expired resets it: count -> 0
//     and the prior side timestamps are cleared, so both users must exchange
//     again to restart (a single message never resurrects a broken streak).
//
// Injected narrow prisma interface so it is fully unit-testable with a mock.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StreakRow {
  id: string;
  userAId: string;
  userBId: string;
  count: number;
  lastFromA: Date | null;
  lastFromB: Date | null;
  lastIncrementAt: Date | null;
  startedAt: Date | null;
  expiresAt: Date | null;
}

export interface StreakPrisma {
  streak: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<StreakRow | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<StreakRow>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<StreakRow>;
  };
}

export interface StreakView {
  userAId: string;
  userBId: string;
  count: number;
  expiresAt: Date | null;
  /** True when the streak is currently alive (count > 0 and not expired). */
  active: boolean;
}

/** Canonical pair ordering so (x,y) and (y,x) map to the same streak row. */
function canonicalPair(u1: string, u2: string): { a: string; b: string } {
  return u1 < u2 ? { a: u1, b: u2 } : { a: u2, b: u1 };
}

function ms(d: Date | null | undefined): number | null {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

export class StreakService {
  constructor(private readonly prisma: StreakPrisma) {}

  /**
   * Record that `fromUserId` messaged `toUserId` at `now`, updating the pair's
   * streak. Returns the resulting streak view.
   */
  async recordMessage(
    fromUserId: string,
    toUserId: string,
    now: Date = new Date(),
  ): Promise<StreakView> {
    if (!fromUserId || !toUserId || fromUserId === toUserId) {
      throw new Error('recordMessage requires two distinct user ids');
    }
    const { a, b } = canonicalPair(fromUserId, toUserId);
    const fromIsA = fromUserId === a;
    const nowMs = now.getTime();

    const existing = await this.prisma.streak.findUnique({
      where: { userAId_userBId: { userAId: a, userBId: b } },
    });

    // Starting state — reset to 0 if the prior streak had already expired.
    let count = existing?.count ?? 0;
    let lastA = ms(existing?.lastFromA ?? null);
    let lastB = ms(existing?.lastFromB ?? null);
    let lastIncrementAt = ms(existing?.lastIncrementAt ?? null);
    let startedAt = ms(existing?.startedAt ?? null);

    const expiredMs = ms(existing?.expiresAt ?? null);
    if (count > 0 && expiredMs != null && nowMs > expiredMs) {
      // The streak broke before this message — start fresh.
      count = 0;
      lastA = null;
      lastB = null;
      lastIncrementAt = null;
      startedAt = null;
    }

    // Record this side's latest interaction.
    if (fromIsA) lastA = nowMs;
    else lastB = nowMs;

    const mutuallyActive =
      lastA != null && lastB != null && nowMs - lastA < DAY_MS && nowMs - lastB < DAY_MS;

    let expiresAt: number | null = null;
    if (mutuallyActive) {
      if (count === 0) {
        count = 1;
        lastIncrementAt = nowMs;
        startedAt = nowMs;
      } else if (lastIncrementAt == null || nowMs - lastIncrementAt >= DAY_MS) {
        count += 1;
        lastIncrementAt = nowMs;
      }
      // The streak must continue before the earliest-sending user crosses 24h.
      expiresAt = Math.min(lastA as number, lastB as number) + DAY_MS;
    } else if (count > 0) {
      // Only one side has sent in this window but a streak already exists; keep
      // its existing deadline (still must be kept alive).
      expiresAt = expiredMs;
    }

    const data = {
      count,
      lastFromA: lastA != null ? new Date(lastA) : null,
      lastFromB: lastB != null ? new Date(lastB) : null,
      lastIncrementAt: lastIncrementAt != null ? new Date(lastIncrementAt) : null,
      startedAt: startedAt != null ? new Date(startedAt) : null,
      expiresAt: expiresAt != null ? new Date(expiresAt) : null,
    };

    const row = existing
      ? await this.prisma.streak.update({
          where: { userAId_userBId: { userAId: a, userBId: b } },
          data,
        })
      : await this.prisma.streak.create({
          data: { userAId: a, userBId: b, ...data },
        });

    return this.toView(row, now);
  }

  /** Read the current streak for a pair (count 0 / inactive if expired). */
  async getStreak(user1: string, user2: string, now: Date = new Date()): Promise<StreakView> {
    const { a, b } = canonicalPair(user1, user2);
    const row = await this.prisma.streak.findUnique({
      where: { userAId_userBId: { userAId: a, userBId: b } },
    });
    if (!row) {
      return { userAId: a, userBId: b, count: 0, expiresAt: null, active: false };
    }
    return this.toView(row, now);
  }

  private toView(row: StreakRow, now: Date): StreakView {
    const expMs = ms(row.expiresAt);
    const expired = expMs != null && now.getTime() > expMs;
    const count = expired ? 0 : row.count;
    return {
      userAId: row.userAId,
      userBId: row.userBId,
      count,
      expiresAt: row.expiresAt,
      active: count > 0 && !expired,
    };
  }
}
