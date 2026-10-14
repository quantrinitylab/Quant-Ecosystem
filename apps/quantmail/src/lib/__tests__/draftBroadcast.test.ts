import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DraftBroadcast,
  draftShareKey,
  type DraftBroadcastChannelLike,
  type DraftChannelMessage,
} from '../draftBroadcast';

/** In-memory BroadcastChannel stand-in: every channel with the same name shares a bus. */
function makeStubFactory() {
  const buses = new Map<string, Set<(event: { data: DraftChannelMessage }) => void>>();
  const factory = vi.fn((name: string): DraftBroadcastChannelLike | null => {
    if (!buses.has(name)) buses.set(name, new Set());
    const listeners = buses.get(name)!;
    return {
      postMessage(message: DraftChannelMessage) {
        for (const l of [...listeners]) l({ data: message });
      },
      addEventListener(_type: 'message', listener: (event: { data: DraftChannelMessage }) => void) {
        listeners.add(listener);
      },
      removeEventListener(_type: 'message', listener: (event: { data: DraftChannelMessage }) => void) {
        listeners.delete(listener);
      },
      close() {},
    };
  });
  return factory;
}

describe('draftShareKey', () => {
  it('shares reply contexts by replyToId', () => {
    expect(draftShareKey('email_123')).toBe('reply:email_123');
  });

  it('returns null for fresh composes (no reply context)', () => {
    expect(draftShareKey(undefined)).toBeNull();
    expect(draftShareKey(null)).toBeNull();
    expect(draftShareKey('')).toBeNull();
    expect(draftShareKey('   ')).toBeNull();
  });
});

describe('DraftBroadcast', () => {
  let factory: ReturnType<typeof makeStubFactory>;

  beforeEach(() => {
    factory = makeStubFactory();
  });

  it('delivers an announcement to a sibling tab with the same key', () => {
    const tabA = new DraftBroadcast(factory);
    const tabB = new DraftBroadcast(factory);
    const received: { draftId: string; version?: number }[] = [];
    const unsub = tabB.onAdoption('reply:e1', (a) => received.push(a));

    tabA.announce('reply:e1', 'draft_1', 0);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ draftId: 'draft_1', version: 0 });
    unsub();
    tabA.dispose();
    tabB.dispose();
  });

  it('ignores announcements for a different key', () => {
    const tabA = new DraftBroadcast(factory);
    const tabB = new DraftBroadcast(factory);
    const received: unknown[] = [];
    const unsub = tabB.onAdoption('reply:e2', (a) => received.push(a));

    tabA.announce('reply:e1', 'draft_1', 0);

    expect(received).toHaveLength(0);
    unsub();
    tabA.dispose();
    tabB.dispose();
  });

  it('ignores its own announcements', () => {
    const tabA = new DraftBroadcast(factory);
    const received: unknown[] = [];
    const unsub = tabA.onAdoption('reply:e1', (a) => received.push(a));

    tabA.announce('reply:e1', 'draft_1', 0);

    expect(received).toHaveLength(0);
    unsub();
    tabA.dispose();
  });

  it('dedupes repeat announcements of the same draft', () => {
    const tabA = new DraftBroadcast(factory);
    const tabB = new DraftBroadcast(factory);
    const received: unknown[] = [];
    const unsub = tabB.onAdoption('reply:e1', (a) => received.push(a));

    tabA.announce('reply:e1', 'draft_1', 0);
    tabA.announce('reply:e1', 'draft_1', 0);

    expect(received).toHaveLength(1);
    unsub();
    tabA.dispose();
    tabB.dispose();
  });

  it('stops delivering after unsubscribe', () => {
    const tabA = new DraftBroadcast(factory);
    const tabB = new DraftBroadcast(factory);
    const received: unknown[] = [];
    const unsub = tabB.onAdoption('reply:e1', (a) => received.push(a));
    unsub();

    tabA.announce('reply:e1', 'draft_1', 0);

    expect(received).toHaveLength(0);
    tabA.dispose();
    tabB.dispose();
  });

  it('degrades to a no-op when BroadcastChannel is unavailable', () => {
    const nullFactory = () => null;
    const bc = new DraftBroadcast(nullFactory);
    const received: unknown[] = [];
    const unsub = bc.onAdoption('reply:e1', (a) => received.push(a));
    // Must not throw anywhere.
    bc.announce('reply:e1', 'draft_1', 0);
    bc.retire('reply:e1', 'draft_1', 'sent');
    unsub();
    bc.dispose();
    expect(received).toHaveLength(0);
    expect(nullFactory).toBeDefined();
  });

  it('delivers a retirement to a sibling tab with the same key', () => {
    const tabA = new DraftBroadcast(factory);
    const tabB = new DraftBroadcast(factory);
    const retired: { draftId: string; reason: string }[] = [];
    const unsub = tabB.onRetirement('reply:e1', (r) => retired.push(r));

    tabA.retire('reply:e1', 'draft_1', 'sent');

    expect(retired).toHaveLength(1);
    expect(retired[0]).toEqual({ draftId: 'draft_1', reason: 'sent' });
    unsub();
    tabA.dispose();
    tabB.dispose();
  });

  it('retirements do not trigger adoption listeners and vice versa', () => {
    const tabA = new DraftBroadcast(factory);
    const tabB = new DraftBroadcast(factory);
    const adopted: unknown[] = [];
    const retired: unknown[] = [];
    const unsubAdopt = tabB.onAdoption('reply:e1', (a) => adopted.push(a));
    const unsubRetire = tabB.onRetirement('reply:e1', (r) => retired.push(r));

    tabA.retire('reply:e1', 'draft_1', 'discarded');
    tabA.announce('reply:e1', 'draft_2', 1);

    expect(retired).toHaveLength(1);
    expect(adopted).toHaveLength(1);
    unsubAdopt();
    unsubRetire();
    tabA.dispose();
    tabB.dispose();
  });

  it('ignores its own retirement messages', () => {
    const tabA = new DraftBroadcast(factory);
    const retired: unknown[] = [];
    const unsub = tabA.onRetirement('reply:e1', (r) => retired.push(r));

    tabA.retire('reply:e1', 'draft_1', 'sent');

    expect(retired).toHaveLength(0);
    unsub();
    tabA.dispose();
  });

  it('re-announces a held draft when a late sibling asks (sync-request)', () => {
    const tabA = new DraftBroadcast(factory);
    tabA.announce('reply:e1', 'draft_1', 3);

    // Tab B mounts after the announcement; its request triggers tabA's
    // re-announcement, which arrives as a normal adoption.
    const tabB = new DraftBroadcast(factory);
    const received: { draftId: string; version?: number }[] = [];
    const unsub = tabB.onAdoption('reply:e1', (a) => received.push(a));
    tabB.requestDraft('reply:e1');

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ draftId: 'draft_1', version: 3 });
    unsub();
    tabA.dispose();
    tabB.dispose();
  });

  it('does not answer a sync-request for a key it never announced', () => {
    const tabA = new DraftBroadcast(factory);
    const tabB = new DraftBroadcast(factory);
    const received: unknown[] = [];
    const unsub = tabB.onAdoption('reply:e9', (a) => received.push(a));

    tabB.requestDraft('reply:e9');

    expect(received).toHaveLength(0);
    unsub();
    tabA.dispose();
    tabB.dispose();
  });

  it('does not answer its own sync-request', () => {
    const tabA = new DraftBroadcast(factory);
    tabA.announce('reply:e1', 'draft_1', 0);
    const received: unknown[] = [];
    const unsub = tabA.onAdoption('reply:e1', (a) => received.push(a));

    tabA.requestDraft('reply:e1');

    // No self-adoption: the holder already knows its own draft.
    expect(received).toHaveLength(0);
    unsub();
    tabA.dispose();
  });
});
