import { describe, it, expect } from 'vitest';
import {
  shouldBroadcastLocation,
  simulateBroadcasts,
  type BroadcastEvent,
} from '../app/map/locationBroadcast';

// Feature: quantchat-mega-upgrade, Property 16: Ghost mode prevents location broadcast.
//
// Validates: Requirements 6.11, 15.2, 15.4.
//
// Property: For any user with ghost_mode enabled, the system SHALL never emit a
// location broadcast event for that user. We model the map page's broadcast
// behaviour with a pure simulator (simulateBroadcasts) driven by
// shouldBroadcastLocation, and assert that across an arbitrary sequence of
// ghost-mode toggles interleaved with 30s broadcast ticks, NO broadcast is ever
// emitted while ghost mode is enabled.

/** Deterministic, seedable PRNG (mulberry32) so failures are reproducible. */
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

/**
 * Generate a random sequence of toggle/tick events while tracking the ghost
 * mode value at the moment each tick fires (the "ground truth" we verify
 * against independently of the simulator under test).
 */
function generateSequence(
  rand: () => number,
  length: number,
  initialGhostMode: boolean,
): { events: BroadcastEvent[]; ghostAtTick: boolean[] } {
  const events: BroadcastEvent[] = [];
  const ghostAtTick: boolean[] = [];
  let ghostMode = initialGhostMode;

  for (let i = 0; i < length; i++) {
    if (rand() < 0.4) {
      // Toggle ghost mode to a random new value.
      ghostMode = rand() < 0.5;
      events.push({ kind: 'toggle', ghostMode });
    } else {
      // A broadcast tick fires under the current ghost-mode state.
      events.push({ kind: 'tick' });
      ghostAtTick.push(ghostMode);
    }
  }

  return { events, ghostAtTick };
}

describe('Ghost mode prevents location broadcast (Property 16)', () => {
  it('never broadcasts while ghost mode is enabled across >=100 random sequences', () => {
    const rand = mulberry32(0x6105710 & 0xffffffff);
    let totalSequences = 0;

    for (let i = 0; i < 150; i++) {
      const length = 1 + Math.floor(rand() * 60);
      const initialGhostMode = rand() < 0.5;
      const { events, ghostAtTick } = generateSequence(rand, length, initialGhostMode);

      const result = simulateBroadcasts(events, initialGhostMode);

      // Core invariant: no broadcast emitted while ghost mode was on.
      expect(
        result.brokeGhostInvariant,
        `sequence #${i} emitted a broadcast during ghost mode: ${JSON.stringify(events)}`,
      ).toBe(false);

      // Independent check: emitted broadcasts must equal the number of ticks
      // that fired while ghost mode was OFF.
      const expectedBroadcasts = ghostAtTick.filter((g) => g === false).length;
      expect(result.broadcastCount, `sequence #${i} broadcast count`).toBe(expectedBroadcasts);

      totalSequences += 1;
    }

    expect(totalSequences).toBeGreaterThanOrEqual(100);
  });

  it('predicate suppresses broadcast exactly when ghost mode is enabled', () => {
    expect(shouldBroadcastLocation(true)).toBe(false);
    expect(shouldBroadcastLocation(false)).toBe(true);
  });

  it('emits zero broadcasts when ghost mode stays enabled the entire time', () => {
    const rand = mulberry32(0x9051);
    for (let i = 0; i < 100; i++) {
      const ticks = 1 + Math.floor(rand() * 50);
      const events: BroadcastEvent[] = Array.from({ length: ticks }, () => ({
        kind: 'tick' as const,
      }));
      const result = simulateBroadcasts(events, true);
      expect(result.broadcastCount).toBe(0);
      expect(result.brokeGhostInvariant).toBe(false);
    }
  });
});
