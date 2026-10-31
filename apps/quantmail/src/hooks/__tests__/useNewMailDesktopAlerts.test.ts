// Desktop new-mail watcher batching — regression tests for the finding that
// the effect only inspected data[0] and advanced its seen-newest pointer past
// the whole batch, so 3 emails in one 30s poll window produced 1 alert and
// silently dropped the other 2. The rule itself lives in desktopAlertBatch.ts
// (dependency-free) so these tests do not need to render the hook — quantmail
// has no @testing-library/react dependency.
import { describe, expect, it } from 'vitest';
import { unseenNotifications, recordBatchSeen, SEEN_IDS_CAP } from '../desktopAlertBatch';
import type { AppNotification } from '../useNotifications';

function notification(id: string, overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id,
    type: 'new_email',
    title: `Mail ${id}`,
    body: `Body ${id}`,
    actionUrl: `/thread/${id}`,
    priority: 'NORMAL',
    isRead: false,
    createdAt: '2026-10-25T10:00:00.000Z',
    ...overrides,
  };
}

// Feed order is newest-first: n3 arrived last, n1 first.
const BATCH = [notification('n3'), notification('n2'), notification('n1')];

describe('unseenNotifications', () => {
  it('returns every unseen row in a batch, oldest first — not just data[0]', () => {
    const fresh = unseenNotifications(BATCH, new Set(['n0']));
    expect(fresh.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('returns only rows never polled before when a batch overlaps the previous one', () => {
    const seen = new Set(['n1', 'n2']);
    const fresh = unseenNotifications(BATCH, seen);
    expect(fresh.map((n) => n.id)).toEqual(['n3']);
  });

  it('returns nothing when the whole batch was already seen (no duplicate alerts)', () => {
    expect(unseenNotifications(BATCH, new Set(['n1', 'n2', 'n3']))).toEqual([]);
  });

  it('returns nothing for an empty batch', () => {
    expect(unseenNotifications([], new Set())).toEqual([]);
  });

  it('does not mutate the seen set or the batch', () => {
    const seen = new Set(['n1']);
    const batch = [...BATCH];
    unseenNotifications(batch, seen);
    expect(seen).toEqual(new Set(['n1']));
    expect(batch.map((n) => n.id)).toEqual(['n3', 'n2', 'n1']);
  });
});

describe('recordBatchSeen', () => {
  it('marks a whole batch seen so the next poll fires only for newer rows', () => {
    const seen = new Set<string>();
    recordBatchSeen(seen, BATCH);
    expect(unseenNotifications([notification('n4'), ...BATCH], seen).map((n) => n.id)).toEqual(['n4']);
  });

  it('caps the set instead of growing it for the whole session', () => {
    const seen = new Set<string>();
    const big = Array.from({ length: SEEN_IDS_CAP + 20 }, (_, i) => notification(`m${i}`));
    recordBatchSeen(seen, big);
    expect(seen.size).toBe(SEEN_IDS_CAP);
    // The newest ids survive pruning (insertion order: oldest dropped first).
    expect(seen.has(`m${SEEN_IDS_CAP + 19}`)).toBe(true);
    expect(seen.has('m0')).toBe(false);
  });
});
