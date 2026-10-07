// ============================================================================
// QuantMail — Per-App Color Theming
// Each app (Mail, Calendar, Drive, Contacts, QuantGit) gets its own accent
// color. Switching apps animates the whole UI's color theme with a smooth
// transition. Colors follow the user's sketch: Mail=orange, Calendar=blue,
// Drive=green, QuantGit=purple (Contacts=teal).
// ============================================================================

export type AppThemeId = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';

export interface AppTheme {
  id: AppThemeId;
  /** Primary accent color (hex) */
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
    accent: '#FF8C42',
    glow: 'rgba(255, 140, 66, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(255, 140, 66, 0.06) 0%, transparent 32%)',
    ring: '#FF8C42',
  },
  calendar: {
    id: 'calendar',
    accent: '#3B82F6',
    glow: 'rgba(59, 130, 246, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(59, 130, 246, 0.06) 0%, transparent 32%)',
    ring: '#3B82F6',
  },
  drive: {
    id: 'drive',
    accent: '#22C55E',
    glow: 'rgba(34, 197, 94, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(34, 197, 94, 0.06) 0%, transparent 32%)',
    ring: '#22C55E',
  },
  contacts: {
    id: 'contacts',
    accent: '#14B8A6',
    glow: 'rgba(20, 184, 166, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(20, 184, 166, 0.06) 0%, transparent 32%)',
    ring: '#14B8A6',
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
