// ============================================================================
// QuantMail — PILLAR_ACCENTS: single source of truth for per-app accent colors
// ============================================================================
// QM-UIUX-037: mobile and desktop app switchers used DIFFERENT accent colors
// for the same apps (e.g. Drive was #34A853 green on mobile but var(--quant-warning) amber
// on desktop). Every app switcher must read its accent from this map so the
// two viewports can never diverge again.
//
// NOTE: the exact per-app color mapping was user-confirmed 2026-10-09 and
// REVISED 2026-10-09 ~11:00 IST (user correction): Mail=orange, Calendar=blue,
// Drive=green, Contacts=AMBER, QuantGit=PURPLE (matches the voxel-frog identity).
// Dark background is always maintained; the accent only edges the active tab.
// Changing the mapping later means editing these 5 lines only.
// ============================================================================

export const PILLAR_ACCENTS = {
  mail: '#FF6B35',
  calendar: '#4285F4',
  drive: '#34A853',
  contacts: '#F59E0B',
  quantgit: '#8B5CF6',
} as const;

export type PillarAccentId = keyof typeof PILLAR_ACCENTS;
