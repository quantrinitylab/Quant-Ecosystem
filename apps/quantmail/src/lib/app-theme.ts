// ============================================================================
// QuantMail — Per-App Color Theming
// Each app (Mail, Calendar, Drive, Contacts, QuantGit) gets its own accent
// color. Switching apps animates the whole UI's color theme with a smooth
// transition. Colors are user-locked (2026-10-09 revision): Mail=orange,
// Calendar=blue, Drive=green, Contacts=amber, QuantGit=purple.
//
// The hex values live in ONE place — PILLAR_ACCENTS (components/pillar-accents).
// This module derives the glow/wash/ring variants from it so the two maps can
// never diverge again.
// ============================================================================

import { PILLAR_ACCENTS } from '../components/pillar-accents';

export type AppThemeId = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';

export interface AppTheme {
  id: AppThemeId;
  /** Primary accent color (hex or CSS var token, e.g. var(--quant-primary)) */
  accent: string;
  /** Accent with alpha for glows (rgba) */
  glow: string;
  /** Subtle top background wash gradient */
  bgWash: string;
  /** Focus ring color */
  ring: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function themeFor(id: AppThemeId): AppTheme {
  const accent = PILLAR_ACCENTS[id];
  const [r, g, b] = hexToRgb(accent);
  return {
    id,
    accent,
    glow: `rgba(${r}, ${g}, ${b}, 0.25)`,
    bgWash: `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, 0.06) 0%, transparent 32%)`,
    ring: accent,
  };
}

export const APP_THEMES: Record<AppThemeId, AppTheme> = {
  mail: themeFor('mail'),
  calendar: themeFor('calendar'),
  drive: themeFor('drive'),
  contacts: themeFor('contacts'),
  quantgit: themeFor('quantgit'),
};

/**
 * Resolve the app theme from a pathname.
 * Matches the same routing logic as AppShell's currentApp.
 */
export function appThemeForPath(pathname: string): AppTheme {
  if (pathname.startsWith('/calendar')) return APP_THEMES.calendar;
  if (pathname.startsWith('/drive')) return APP_THEMES.drive;
  if (pathname.startsWith('/contacts')) return APP_THEMES.contacts;
  if (pathname.startsWith('/quantgit')) return APP_THEMES.quantgit;
  return APP_THEMES.mail;
}
