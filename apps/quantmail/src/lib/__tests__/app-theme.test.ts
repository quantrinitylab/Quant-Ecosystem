import { describe, it, expect } from 'vitest';
import { APP_THEMES, appThemeForPath, type AppThemeId } from '../app-theme';

describe('app-theme', () => {
  it('defines themes for all 5 apps', () => {
    const ids: AppThemeId[] = ['mail', 'calendar', 'drive', 'contacts', 'quantgit'];
    for (const id of ids) {
      const theme = APP_THEMES[id];
      expect(theme).toBeDefined();
      expect(theme.id).toBe(id);
      expect(theme.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.glow).toContain('rgba');
      expect(theme.bgWash).toContain('linear-gradient');
      expect(theme.ring).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('resolves mail theme for root and unknown paths', () => {
    expect(appThemeForPath('/').id).toBe('mail');
    expect(appThemeForPath('/thread/abc').id).toBe('mail');
    expect(appThemeForPath('/search').id).toBe('mail');
    expect(appThemeForPath('/settings').id).toBe('mail');
  });

  it('resolves calendar theme', () => {
    expect(appThemeForPath('/calendar').id).toBe('calendar');
    expect(appThemeForPath('/calendar?view=month').id).toBe('calendar');
  });

  it('resolves drive theme', () => {
    expect(appThemeForPath('/drive').id).toBe('drive');
    expect(appThemeForPath('/drive/doc/123').id).toBe('drive');
  });

  it('resolves contacts theme', () => {
    expect(appThemeForPath('/contacts').id).toBe('contacts');
  });

  it('resolves quantgit theme for all code routes', () => {
    expect(appThemeForPath('/quantgit').id).toBe('quantgit');
  });

  it('uses user-sketch colors: mail=orange, calendar=blue, drive=green, quantgit=purple', () => {
    // Orange family for mail
    expect(APP_THEMES.mail.accent).toMatch(/^#FF/i);
    // Blue family for calendar
    expect(APP_THEMES.calendar.accent).toMatch(/^#3B82F6|^#4285F4/i);
    // Green family for drive
    expect(APP_THEMES.drive.accent).toMatch(/^#22|^#34/i);
    // Purple family for quantgit
    expect(APP_THEMES.quantgit.accent).toMatch(/^#A/i);
  });
});
