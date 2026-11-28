import { describe, it, expect } from 'vitest';
import {
  normalizeQuickDensity,
  normalizeQuickTheme,
  readStoredQuickDensity,
  readStoredQuickTheme,
  resolveQuickTheme,
} from '../quick-settings-preferences';

describe('quick-settings preferences', () => {
  it('keeps only the theme values the bootstrap and settings page honour', () => {
    expect(normalizeQuickTheme('light')).toBe('light');
    expect(normalizeQuickTheme('dark')).toBe('dark');
    expect(normalizeQuickTheme('system')).toBe('system');
    // The retired 'midnight' value and anything unknown fold to dark, never
    // to nothing selected — the same migration the settings page performs.
    expect(normalizeQuickTheme('midnight')).toBe('dark');
    expect(normalizeQuickTheme(null)).toBe('dark');
    expect(normalizeQuickTheme(undefined)).toBe('dark');
  });

  it('keeps only the density values the row rules key on', () => {
    expect(normalizeQuickDensity('comfortable')).toBe('comfortable');
    expect(normalizeQuickDensity('cozy')).toBe('cozy');
    expect(normalizeQuickDensity('compact')).toBe('compact');
    expect(normalizeQuickDensity('spacious')).toBe('comfortable');
    expect(normalizeQuickDensity(null)).toBe('comfortable');
  });

  it('resolves "system" from the OS value and passes explicit themes through', () => {
    expect(resolveQuickTheme('system', true)).toBe('dark');
    expect(resolveQuickTheme('system', false)).toBe('light');
    expect(resolveQuickTheme('dark', false)).toBe('dark');
    expect(resolveQuickTheme('light', true)).toBe('light');
  });

  it('reads the SAME storage keys the settings page and bootstrap use', () => {
    const store = new Map<string, string>([
      ['quant-theme', 'light'],
      ['quant-density', 'compact'],
    ]);
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    expect(readStoredQuickTheme(storage)).toBe('light');
    expect(readStoredQuickDensity(storage)).toBe('compact');
    // A panel reading a different key would read the default here and
    // silently disagree with the settings page — that is the regression.
    expect(readStoredQuickTheme(null)).toBe('dark');
    expect(readStoredQuickDensity(null)).toBe('comfortable');
  });
});
