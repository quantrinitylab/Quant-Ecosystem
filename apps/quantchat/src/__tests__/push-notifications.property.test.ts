// @vitest-environment jsdom
// ============================================================================
// QuantChat - Push Notifications Property Tests (Task 10.9)
//
// Property-based tests for the push-notification subsystem:
//   - Property 20: streak-expiry warning triggers for both users
//   - Property 21: category toggles are independent
//   - Property 22: deep-link resolves to the correct route
//   - Property 23: non-urgent batching collapses to a single summary;
//                  high-priority always sends immediately
//   - Property 24: foreground push is suppressed (shown as in-app toast)
//
// Generators are seeded and deterministic (mulberry32). Each property runs
// over >= 100 generated cases.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  shouldWarnStreakExpiry,
  queueStreakExpiryWarnings,
  STREAK_EXPIRY_WARNING_MS,
  type StreakRecord,
} from '../../backend/lib/notification-streak-expiry';
import type { NotificationPayload } from '../../backend/lib/notification-dispatch';
import {
  resolveDeepLink,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '../lib/notification-deeplink';
import {
  NotificationBatcher,
  type BatchableNotification,
  type NotificationPriority,
} from '../lib/notification-batcher';
import {
  NotificationSettings,
  defaultNotificationSettings,
  loadNotificationSettings,
  type NotificationCategorySettings,
} from '../components/settings/NotificationSettings';
import {
  handleForegroundPush,
  shouldSuppressBrowserPush,
  toastManager,
} from '../components/ui/InAppToast';

// ---------------------------------------------------------------------------
// Seeded deterministic PRNG + helpers
// ---------------------------------------------------------------------------

/** mulberry32: small, fast, deterministic 32-bit PRNG seeded from an integer. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[randInt(rng, 0, arr.length - 1)]!;
}

const CASES = 150; // > 100 generated cases per property
const NOW = 1_700_000_000_000; // fixed deterministic clock
const HOUR = 60 * 60 * 1000;

// React 18/19 marks test renders that don't wrap state updates in act(). We
// always wrap below, but silence the global flag warning regardless.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  toastManager.clear();
});

// ===========================================================================
// Property 20: streak expiry triggers a warning for BOTH users
// ===========================================================================

describe('Push notifications — Property 20 (streak expiry warning)', () => {
  // Feature: quantchat-mega-upgrade, Property 20: for any streak with < 4h remaining (and not expired), a warning is queued for both users.
  it('shouldWarnStreakExpiry is true iff 0 < remaining < 4h', () => {
    const rng = mulberry32(0x2_0000);
    for (let n = 0; n < CASES; n++) {
      // Offsets range from already-expired (-2h) to well outside the window (+8h),
      // exercising both sides of the boundary.
      const offsetMs = randInt(rng, -2 * HOUR, 8 * HOUR);
      const streak: StreakRecord = {
        id: `streak-${n}`,
        userAId: `userA-${randInt(rng, 1, 1000)}`,
        userBId: `userB-${randInt(rng, 1, 1000)}`,
        count: randInt(rng, 1, 365),
        expiresAt: NOW + offsetMs,
        conversationId: `conv-${randInt(rng, 1, 1000)}`,
      };

      const expected = offsetMs > 0 && offsetMs < STREAK_EXPIRY_WARNING_MS;
      expect(shouldWarnStreakExpiry(streak, NOW)).toBe(expected);
    }
  });

  // Feature: quantchat-mega-upgrade, Property 20: for any streak with < 4h remaining (and not expired), a warning is queued for both users.
  it('queueStreakExpiryWarnings enqueues exactly 2 warnings (one per user) per qualifying streak', async () => {
    const rng = mulberry32(0x2_1111);
    for (let n = 0; n < CASES; n++) {
      const streaks: StreakRecord[] = [];
      let expectedQualifying = 0;

      const batchSize = randInt(rng, 1, 8);
      for (let i = 0; i < batchSize; i++) {
        const offsetMs = randInt(rng, -2 * HOUR, 8 * HOUR);
        const userAId = `A-${n}-${i}`;
        const userBId = `B-${n}-${i}`;
        streaks.push({
          id: `s-${n}-${i}`,
          userAId,
          userBId,
          count: randInt(rng, 1, 365),
          expiresAt: NOW + offsetMs,
        });
        if (offsetMs > 0 && offsetMs < STREAK_EXPIRY_WARNING_MS) expectedQualifying += 1;
      }

      const enqueued: NotificationPayload[] = [];
      const queued = await queueStreakExpiryWarnings(
        streaks,
        (p) => {
          enqueued.push(p);
        },
        NOW,
      );

      // Exactly two notifications per qualifying streak.
      expect(queued).toBe(expectedQualifying * 2);
      expect(enqueued).toHaveLength(expectedQualifying * 2);

      // Every qualifying streak produced one warning for each participant.
      for (const streak of streaks) {
        if (!shouldWarnStreakExpiry(streak, NOW)) continue;
        const recipients = enqueued
          .filter((p) => p.tag === `streak:${streak.id}`)
          .map((p) => p.userId)
          .sort();
        expect(recipients).toEqual([streak.userAId, streak.userBId].sort());
        // Every queued warning is in the STREAKS category.
        for (const p of enqueued.filter((p) => p.tag === `streak:${streak.id}`)) {
          expect(p.category).toBe('STREAKS');
        }
      }
    }
  });
});

// ===========================================================================
// Property 21: category toggles are independent
// ===========================================================================

describe('Push notifications — Property 21 (category independence)', () => {
  // Feature: quantchat-mega-upgrade, Property 21: toggling one category off suppresses only that category.
  it('toggling a single category flips only that category, leaving the rest unchanged', () => {
    const rng = mulberry32(0x3_0000);
    for (let n = 0; n < CASES; n++) {
      // Random starting settings map.
      const initial = NOTIFICATION_CATEGORIES.reduce((acc, c) => {
        acc[c] = rng() < 0.5;
        return acc;
      }, {} as NotificationCategorySettings);

      const target = pick(rng, NOTIFICATION_CATEGORIES);

      const container = document.createElement('div');
      document.body.appendChild(container);
      let root: Root | null = null;

      let latest: NotificationCategorySettings | null = null;
      act(() => {
        root = createRoot(container);
        root.render(
          React.createElement(NotificationSettings, {
            initialSettings: { ...initial },
            onChange: (s: NotificationCategorySettings) => {
              latest = s;
            },
          }),
        );
      });

      // Click the switch for the target category (one switch per category, in order).
      const switches = container.querySelectorAll('[role="switch"]');
      const idx = NOTIFICATION_CATEGORIES.indexOf(target);
      act(() => {
        (switches[idx] as HTMLButtonElement).click();
      });

      expect(latest).not.toBeNull();
      const next = latest as unknown as NotificationCategorySettings;

      // Only the toggled category changed; it is exactly the inverse.
      expect(next[target]).toBe(!initial[target]);
      for (const c of NOTIFICATION_CATEGORIES) {
        if (c === target) continue;
        expect(next[c]).toBe(initial[c]);
      }

      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });

  // Feature: quantchat-mega-upgrade, Property 21: toggling one category off suppresses only that category.
  it('loadNotificationSettings round-trips an arbitrary stored map and merges defaults', () => {
    const rng = mulberry32(0x3_2222);
    const defaults = defaultNotificationSettings();
    for (let n = 0; n < CASES; n++) {
      // Persist a random subset of categories with random values.
      const stored: Partial<NotificationCategorySettings> = {};
      for (const c of NOTIFICATION_CATEGORIES) {
        if (rng() < 0.5) stored[c] = rng() < 0.5;
      }
      window.localStorage.setItem('quantchat:notification-settings', JSON.stringify(stored));

      const loaded = loadNotificationSettings();
      for (const c of NOTIFICATION_CATEGORIES) {
        // Stored boolean is preserved; otherwise the default is used (independence
        // of each category's persistence).
        const expected = typeof stored[c] === 'boolean' ? stored[c]! : defaults[c];
        expect(loaded[c]).toBe(expected);
      }
      window.localStorage.clear();
    }
  });
});

// ===========================================================================
// Property 22: deep-link resolves to the correct route
// ===========================================================================

describe('Push notifications — Property 22 (deep-link resolution)', () => {
  // Documented mapping (mirrors resolveDeepLink + public/sw.js).
  function expectedRoute(category: NotificationCategory, id: string): string {
    switch (category) {
      case 'MESSAGES':
        return id ? `/chat/${id}` : '/chat';
      case 'CALLS':
        return '/call';
      case 'STORIES':
        return id ? `/stories/${id}` : '/stories';
      case 'REELS':
        return id ? `/reels/${id}` : '/reels';
      case 'STREAKS':
        return id ? `/chat/${id}` : '/chat';
      case 'SYSTEM':
        return '/notifications';
    }
  }

  // Feature: quantchat-mega-upgrade, Property 22: for any category + content id, the resolver produces the correct route.
  it('resolveDeepLink produces the documented route for any category + content id', () => {
    const rng = mulberry32(0x4_0000);
    for (let n = 0; n < CASES; n++) {
      const category = pick(rng, NOTIFICATION_CATEGORIES);
      // Sometimes no id, sometimes a random id (with surrounding whitespace to
      // exercise trimming).
      const hasId = rng() < 0.8;
      const rawId = hasId ? `id-${randInt(rng, 1, 1_000_000)}` : '';
      const arg = rng() < 0.3 ? `  ${rawId}  ` : rawId;

      const route = resolveDeepLink(category, arg);
      expect(route).toBe(expectedRoute(category, rawId));
      // Routes are always absolute.
      expect(route.startsWith('/')).toBe(true);
    }
  });
});

// ===========================================================================
// Property 23: non-urgent batching → single summary; high-priority immediate
// ===========================================================================

describe('Push notifications — Property 23 (batching)', () => {
  function makeNotification(overrides: Partial<BatchableNotification> = {}): BatchableNotification {
    return {
      userId: 'u1',
      category: 'REELS',
      title: 'New like',
      body: 'someone liked your reel',
      priority: 'normal',
      ...overrides,
    };
  }

  // Injected timers that never auto-fire, so we control flushing explicitly.
  const frozenTimers = {
    setTimeoutFn: (() => 0) as unknown as typeof setTimeout,
    clearTimeoutFn: () => undefined,
  };

  // Feature: quantchat-mega-upgrade, Property 23: >5 non-urgent notifications in a 2-min window → single summary; high-priority always immediate.
  it('exactly 6 non-urgent notifications collapse into one summary', async () => {
    const rng = mulberry32(0x5_0000);
    for (let n = 0; n < CASES; n++) {
      const send = vi.fn();
      const batcher = new NotificationBatcher(send, frozenTimers);

      const userId = `u-${randInt(rng, 1, 1000)}`;
      const category = pick(rng, NOTIFICATION_CATEGORIES);
      // Enqueue 6 normal notifications in the same window (> threshold of 5).
      for (let i = 0; i < 6; i++) {
        await batcher.enqueue(makeNotification({ userId, category, body: `event ${i}` }));
      }

      // Single summary delivered; window closed.
      expect(send).toHaveBeenCalledTimes(1);
      const summary = send.mock.calls[0]![0] as BatchableNotification;
      expect(summary.title).toContain('6 new');
      expect(summary.priority).toBe('normal');
      expect(summary.deepLink).toBe('/notifications');
      expect(batcher.openWindowCount).toBe(0);
    }
  });

  // Feature: quantchat-mega-upgrade, Property 23: >5 non-urgent notifications in a 2-min window → single summary; high-priority always immediate.
  it('1..5 non-urgent notifications stay buffered (no summary yet)', async () => {
    const rng = mulberry32(0x5_1111);
    for (let n = 0; n < CASES; n++) {
      const send = vi.fn();
      const batcher = new NotificationBatcher(send, frozenTimers);

      const userId = `u-${randInt(rng, 1, 1000)}`;
      const category = pick(rng, NOTIFICATION_CATEGORIES);
      const count = randInt(rng, 1, 5); // at or below threshold
      for (let i = 0; i < count; i++) {
        await batcher.enqueue(makeNotification({ userId, category, body: `e${i}` }));
      }

      // Nothing sent yet; a single window is held open.
      expect(send).not.toHaveBeenCalled();
      expect(batcher.openWindowCount).toBe(1);
    }
  });

  // Feature: quantchat-mega-upgrade, Property 23: >5 non-urgent notifications in a 2-min window → single summary; high-priority always immediate.
  it('high-priority notifications always send immediately and are never batched', async () => {
    const rng = mulberry32(0x5_2222);
    for (let n = 0; n < CASES; n++) {
      const send = vi.fn();
      const batcher = new NotificationBatcher(send, frozenTimers);

      const highCount = randInt(rng, 1, 10);
      for (let i = 0; i < highCount; i++) {
        const priority: NotificationPriority = 'high';
        await batcher.enqueue(
          makeNotification({
            userId: `u-${randInt(rng, 1, 1000)}`,
            category: pick(rng, NOTIFICATION_CATEGORIES),
            priority,
            body: `urgent ${i}`,
          }),
        );
      }

      // Each high-priority notification was delivered immediately; nothing buffered.
      expect(send).toHaveBeenCalledTimes(highCount);
      expect(batcher.openWindowCount).toBe(0);
    }
  });
});

// ===========================================================================
// Property 24: foreground push is suppressed (shown as in-app toast)
// ===========================================================================

describe('Push notifications — Property 24 (foreground suppression)', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  }

  // Feature: quantchat-mega-upgrade, Property 24: a push arriving while document is visible is suppressed → in-app toast.
  it('suppresses the browser push and shows a toast iff the document is visible', () => {
    const rng = mulberry32(0x6_0000);
    for (let n = 0; n < CASES; n++) {
      toastManager.clear();
      const visible = rng() < 0.5;
      setVisibility(visible ? 'visible' : 'hidden');

      const category = pick(rng, NOTIFICATION_CATEGORIES);
      const contentId = `id-${randInt(rng, 1, 1_000_000)}`;

      // Predicate agrees with the actual visibility state.
      expect(shouldSuppressBrowserPush()).toBe(visible);

      const before = toastManager.getToasts().length;
      const result = handleForegroundPush({
        title: 'New event',
        body: 'something happened',
        category,
        contentId,
      });

      if (visible) {
        // Foreground: browser push suppressed, exactly one in-app toast added,
        // carrying the resolved deep-link.
        expect(result.suppressed).toBe(true);
        expect(result.toastId).toBeTruthy();
        const toasts = toastManager.getToasts();
        expect(toasts.length).toBe(before + 1);
        expect(toasts[toasts.length - 1]!.deepLink).toBe(resolveDeepLink(category, contentId));
      } else {
        // Background: push passes through to the browser; no toast created.
        expect(result.suppressed).toBe(false);
        expect(result.toastId).toBeUndefined();
        expect(toastManager.getToasts().length).toBe(before);
      }
    }
  });
});
