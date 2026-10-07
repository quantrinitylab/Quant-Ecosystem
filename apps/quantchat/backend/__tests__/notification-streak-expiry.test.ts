import { describe, it, expect, vi } from 'vitest';
import {
  shouldWarnStreakExpiry,
  queueStreakExpiryWarnings,
  buildStreakExpiryNotification,
  STREAK_EXPIRY_WARNING_MS,
  type StreakRecord,
} from '../lib/notification-streak-expiry';

const NOW = 1_000_000_000_000;

function streak(overrides: Partial<StreakRecord> = {}): StreakRecord {
  return {
    id: 's1',
    userAId: 'a',
    userBId: 'b',
    count: 10,
    expiresAt: NOW + 3 * 60 * 60 * 1000, // 3h remaining
    ...overrides,
  };
}

describe('streak-expiry warning (Task 10.3)', () => {
  it('warns when less than 4h remain and the streak has not expired', () => {
    expect(shouldWarnStreakExpiry(streak(), NOW)).toBe(true);
  });

  it('does not warn when more than 4h remain', () => {
    const far = streak({ expiresAt: NOW + 5 * 60 * 60 * 1000 });
    expect(shouldWarnStreakExpiry(far, NOW)).toBe(false);
  });

  it('does not warn for an already-expired streak', () => {
    const expired = streak({ expiresAt: NOW - 1 });
    expect(shouldWarnStreakExpiry(expired, NOW)).toBe(false);
  });

  it('treats the exact 4h boundary as outside the window', () => {
    const boundary = streak({ expiresAt: NOW + STREAK_EXPIRY_WARNING_MS });
    expect(shouldWarnStreakExpiry(boundary, NOW)).toBe(false);
  });

  it('queues a STREAKS notification for both participants', async () => {
    const enqueue = vi.fn();
    const queued = await queueStreakExpiryWarnings([streak()], enqueue, NOW);
    expect(queued).toBe(2);
    expect(enqueue).toHaveBeenCalledTimes(2);
    const recipients = enqueue.mock.calls.map((c) => c[0].userId).sort();
    expect(recipients).toEqual(['a', 'b']);
    expect(enqueue.mock.calls[0]![0].category).toBe('STREAKS');
  });

  it('skips streaks outside the warning window', async () => {
    const enqueue = vi.fn();
    const queued = await queueStreakExpiryWarnings(
      [streak({ expiresAt: NOW + 10 * 60 * 60 * 1000 })],
      enqueue,
      NOW,
    );
    expect(queued).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('builds a notification deep-linking to the conversation', () => {
    const n = buildStreakExpiryNotification(streak({ conversationId: 'conv42' }), 'a', NOW);
    expect(n.contentId).toBe('conv42');
    expect(n.category).toBe('STREAKS');
    expect(n.title).toContain('streak');
  });
});
