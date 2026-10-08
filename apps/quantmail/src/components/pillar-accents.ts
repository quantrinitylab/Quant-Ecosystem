// ============================================================================
// QuantMail — PILLAR_ACCENTS: single source of truth for per-app accent colors
// ============================================================================
// QM-UIUX-037: mobile and desktop app switchers used DIFFERENT accent colors
// for the same apps (e.g. Drive was #34A853 green on mobile but #F59E0B amber
// on desktop). Every app switcher must read its accent from this map so the
// two viewports can never diverge again.
//
// NOTE: the exact per-app color mapping itself is still awaiting user
// confirmation (the user's per-app theming vision is not yet specced). This
// map pins the CURRENT mobile values as canonical; changing the mapping
// later means editing these 5 lines only.
// ============================================================================

export const PILLAR_ACCENTS = {
  mail: '#FF6B35',
  calendar: '#4285F4',
  drive: '#34A853',
  contacts: '#8AB4F8',
  quantgit: '#A855F7',
} as const;

export type PillarAccentId = keyof typeof PILLAR_ACCENTS;
