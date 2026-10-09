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
    accent: '#FF8C42',
    glow: 'rgba(255, 140, 66, 0.25)',
    bgWash: 'linear-gradient(180deg, var(--quant-accent-faint) 0%, transparent 32%)',
    ring: 'var(--quant-primary)',
  },
  calendar: {
    id: 'calendar',
    accent: '#4285F4',
    glow: 'rgba(59, 130, 246, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(59, 130, 246, 0.06) 0%, transparent 32%)',
    ring: 'var(--quant-info)',
  },
  drive: {
    id: 'drive',
    accent: '#34A853',
    glow: 'rgba(34, 197, 94, 0.25)',
    bgWash: 'linear-gradient(180deg, rgba(34, 197, 94, 0.06) 0%, transparent 32%)',
    ring: 'var(--quant-success)',
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
    accent: '#8B5CF6',
    glow: 'rgba(139, 92, 246, 0.22)',
    bgWash: 'linear-gradient(180deg, rgba(139, 92, 246, 0.05) 0%, transparent 32%)',
    ring: '#8B5CF6',
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
