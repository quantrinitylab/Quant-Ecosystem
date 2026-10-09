// ============================================================================
// QuantMail — Per-App Color Theming
// Each app (Mail, Calendar, Drive, Contacts, QuantGit) gets its own accent
// color. Switching apps animates the whole UI's color theme with a smooth
// transition. Colors are user-locked (2026-10-09 revision): Mail=orange,
// Calendar=blue, Drive=green, Contacts=amber, QuantGit=purple.
// ============================================================================

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

export const APP_THEMES: Record<AppThemeId, AppTheme> = {
  mail: {
    id: 'mail',
    accent: '#FF6B35',
    glow: 'rgba(255, 107, 53, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(255, 107, 53, 0.06) 0%, transparent 32%)',
    ring: '#FF6B35',
  },
  calendar: {
    id: 'calendar',
    accent: '#4285F4',
    glow: 'rgba(66, 133, 244, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(66, 133, 244, 0.06) 0%, transparent 32%)',
    ring: '#4285F4',
  },
  drive: {
    id: 'drive',
    accent: '#34A853',
    glow: 'rgba(52, 168, 83, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(52, 168, 83, 0.06) 0%, transparent 32%)',
    ring: '#34A853',
  },
  contacts: {
    id: 'contacts',
    accent: '#F59E0B',
    glow: 'rgba(245, 158, 11, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(245, 158, 11, 0.06) 0%, transparent 32%)',
    ring: '#F59E0B',
  },
  quantgit: {
    id: 'quantgit',
    accent: '#A855F7',
    glow: 'rgba(168, 85, 247, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(168, 85, 247, 0.06) 0%, transparent 32%)',
    ring: '#A855F7',
  },
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
