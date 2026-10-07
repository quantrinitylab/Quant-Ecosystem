// ─── Group Call Grid Layout Calculator ──────────────────────────────────────────
// Pure (JSX-free) module so the layout math can be unit-tested in isolation and
// re-used by GroupCallGrid / ScreenShareView. Implements the responsive layout
// rules for 1-8 participants described in the design doc.
//
//   1            → single (full screen)
//   2            → split  (stacked, 1 column / 2 rows)
//   3-4          → grid   (2x2)
//   5-8          → focus  (active speaker large + horizontal thumbnail row)
// ─────────────────────────────────────────────────────────────────────────────────

/** The supported group-call presentation modes. */
export type GridMode = 'single' | 'split' | 'grid' | 'focus';

/** Resolved layout descriptor for a given participant count. */
export interface GridLayout {
  columns: number;
  rows: number;
  mode: GridMode;
}

/** Maximum number of simultaneous video participants supported (Requirement 6.11 / 15.1). */
export const MAX_GROUP_PARTICIPANTS = 8;

/** Threshold above which the grid switches to focus mode (Requirement 15.4). */
export const FOCUS_MODE_THRESHOLD = 4;

/**
 * Resolve the grid layout for the supplied participant count.
 *
 * The count is clamped to the valid range [1, MAX_GROUP_PARTICIPANTS] so callers
 * never receive a degenerate (0 / negative / >8) layout.
 */
export function calculateGridLayout(participantCount: number): GridLayout {
  const count = Math.max(1, Math.min(MAX_GROUP_PARTICIPANTS, Math.floor(participantCount)));

  if (count <= 1) return { columns: 1, rows: 1, mode: 'single' };
  if (count === 2) return { columns: 1, rows: 2, mode: 'split' };
  if (count <= FOCUS_MODE_THRESHOLD) return { columns: 2, rows: 2, mode: 'grid' };

  // > 4 participants: focus mode — active speaker large, the rest in a thumbnail row.
  return { columns: count - 1, rows: 1, mode: 'focus' };
}
