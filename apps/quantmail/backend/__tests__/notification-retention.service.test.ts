// @vitest-environment node
// ============================================================================
// notification-retention.service — TTL helper + expired-row pruning.
//
// Holds the retention contract for the notification table (the QM fix for
// unbounded notification accumulation):
//   1. New inbound-mail notifications carry an expiresAt TTL
//      (NEW_MAIL_NOTIFICATION_TTL_DAYS).
//   2. pruneExpiredNotifications deletes only rows whose expiresAt has
//      passed — null-expiresAt rows are never touched, future rows survive,
//      and userId scoping never removes another user's rows.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NEW_MAIL_NOTIFICATION_TTL_DAYS,
  newMailNotificationExpiresAt,
  pruneExpiredNotifications,
} from '../services/notification-retention.service';

interface Row {
  id: string;
  userId: string;
  expiresAt: Date | null;
}

function fakeDb(rows: Row[]) {
  return {
    rows,
    notification: {
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const expired = where.expiresAt as { lte: Date };
        let count = 0;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const row = rows[i]!;
          const isExpired = row.expiresAt !== null && row.expiresAt.getTime() <= expired.lte.getTime();
          const userMatch = where.userId === undefined || row.userId === where.userId;
          if (isExpired && userMatch) {
            rows.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      }),
    },
  };
}

const NOW = new Date('2026-10-19T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function seed(): Row[] {
  return [
    { id: 'expired-1', userId: 'u-1', expiresAt: new Date(NOW.getTime() - DAY) },
    { id: 'expired-2', userId: 'u-1', expiresAt: new Date(NOW.getTime() - 1) },
    { id: 'null-ttl', userId: 'u-1', expiresAt: null },
    { id: 'future', userId: 'u-1', expiresAt: new Date(NOW.getTime() + DAY) },
    { id: 'other-user-expired', userId: 'u-2', expiresAt: new Date(NOW.getTime() - DAY) },
  ];
}

describe('notification retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes expired rows and reports the real count', async () => {
    const db = fakeDb(seed());
    const deleted = await pruneExpiredNotifications(db, { now: NOW });
    // Global (no userId): all three expired rows go — both u-1 rows and u-2's.
    expect(deleted).toBe(3);
    expect(db.rows.map((r) => r.id).sort()).toEqual(['future', 'null-ttl']);
  });

  it('never touches null-expiresAt or future rows', async () => {
    const db = fakeDb(seed());
    await pruneExpiredNotifications(db, { userId: 'u-1', now: NOW });
    const survivors = db.rows.map((r) => r.id).sort();
    expect(survivors).toContain('null-ttl');
    expect(survivors).toContain('future');
    expect(survivors).not.toContain('expired-1');
    expect(survivors).not.toContain('expired-2');
  });

  it('userId scoping never removes another user\'s rows', async () => {
    const db = fakeDb(seed());
    const deleted = await pruneExpiredNotifications(db, { userId: 'u-1', now: NOW });
    expect(deleted).toBe(2);
    expect(db.rows.some((r) => r.id === 'other-user-expired')).toBe(true);
  });

  it('is a no-op returning 0 when nothing is expired', async () => {
    const db = fakeDb([
      { id: 'null-ttl', userId: 'u-1', expiresAt: null },
      { id: 'future', userId: 'u-1', expiresAt: new Date(NOW.getTime() + DAY) },
    ]);
    const deleted = await pruneExpiredNotifications(db, { now: NOW });
    expect(deleted).toBe(0);
    expect(db.rows).toHaveLength(2);
  });

  it('sets the new-mail TTL to 30 days from now', () => {
    expect(NEW_MAIL_NOTIFICATION_TTL_DAYS).toBe(30);
    const from = new Date('2026-10-19T00:00:00.000Z');
    expect(newMailNotificationExpiresAt(from).getTime()).toBe(from.getTime() + 30 * DAY);
  });
});
