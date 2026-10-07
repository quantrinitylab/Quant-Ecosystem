// ============================================================================
// Task 8.6 / 8.10: Pure location-broadcast decision logic for the map page.
//
// The map page broadcasts the user's location on a 30s interval, but only when
// ghost mode is OFF. Ghost mode is a privacy guarantee: while it is enabled the
// system must NEVER emit a location broadcast event for that user.
//
// This module extracts that decision into a pure, testable predicate plus a
// small pure simulator over a sequence of ghost-mode toggles and broadcast
// ticks, so the invariant (Property 16) can be property-tested without React.
// ============================================================================

/**
 * Ghost mode invariant predicate.
 *
 * Returns true when a location broadcast is permitted (ghost mode OFF), and
 * false when broadcasting must be suppressed (ghost mode ON).
 */
export function shouldBroadcastLocation(ghostMode: boolean): boolean {
  return !ghostMode;
}

/** An event that can occur over the lifetime of the map page. */
export type BroadcastEvent =
  | { kind: 'toggle'; ghostMode: boolean } // ghost mode turned on/off
  | { kind: 'tick' }; // 30s broadcast interval fired

/** Result of simulating a sequence of events. */
export interface BroadcastSimulationResult {
  /** Number of location broadcasts emitted across the whole sequence. */
  broadcastCount: number;
  /** True if any broadcast was emitted while ghost mode was enabled. */
  brokeGhostInvariant: boolean;
}

/**
 * Pure simulator of the broadcast decision over a sequence of events.
 *
 * Starting from the given ghost-mode state, it processes toggles and broadcast
 * ticks. On each tick it consults {@link shouldBroadcastLocation} to decide
 * whether to emit. The simulator records how many broadcasts were emitted and
 * whether any of them violated the ghost-mode invariant (i.e. were emitted
 * while ghost mode was enabled — which must never happen).
 */
export function simulateBroadcasts(
  events: BroadcastEvent[],
  initialGhostMode = false,
): BroadcastSimulationResult {
  let ghostMode = initialGhostMode;
  let broadcastCount = 0;
  let brokeGhostInvariant = false;

  for (const event of events) {
    if (event.kind === 'toggle') {
      ghostMode = event.ghostMode;
      continue;
    }
    // event.kind === 'tick'
    if (shouldBroadcastLocation(ghostMode)) {
      broadcastCount += 1;
      if (ghostMode) {
        // Should be unreachable given the predicate; tracked defensively.
        brokeGhostInvariant = true;
      }
    }
  }

  return { broadcastCount, brokeGhostInvariant };
}
