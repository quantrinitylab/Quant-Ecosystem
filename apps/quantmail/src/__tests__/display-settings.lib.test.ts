/**
 * display-settings lib — the account-roaming display settings contract.
 *
 * The sync rule under test (`resolveDisplaySettingsSync`, pure): each field
 * reconciles on its own stamp. The case that matters most is the one a
 * whole-triple push would get wrong — one changed field must never clobber
 * the other two with stale local values (a theme toggled on the desktop
 * must not revert a density set on the phone).
 *
 * Contracts:
 *   1. Normalizers pass the documented vocabularies through and fall back
 *      to the old localStorage defaults otherwise.
 *   2. Server payloads normalise the same way, with `stored` flags and a
 *      null stamp for anything malformed.
 *   3. Account holds nothing: local non-default fields push up, defaults do
 *      not spend a write.
 *   4. Local field stamp newer than the server stamp: that field pushes.
 *   5. Otherwise the server wins per field — including the legacy case of
 *      a local field with no stamp, whose recency cannot be proven.
 *   6. Fields already in agreement are a noop, never an apply or a push.
 */
import { describe, expect, it } from 'vitest';
import {
  DISPLAY_SETTINGS_DEFAULTS,
  normalizeDisplayAIIntent,
  normalizeDisplayDensity,
  normalizeDisplayTheme,
  normalizeServerDisplaySettings,
  resolveDisplaySettingsSync,
  type LocalDisplaySettings,
  type ServerDisplaySettings,
} from '../lib/display-settings';

const SERVER_TIME = '2026-10-25T10:00:00.000Z';

function server(
  overrides: Partial<ServerDisplaySettings> = {},
): ServerDisplaySettings {
  return {
    settings: { ...DISPLAY_SETTINGS_DEFAULTS },
    stored: { theme: false, density: false, aiIntent: false },
    updatedAt: null,
    ...overrides,
  };
}

function local(
  overrides: Partial<LocalDisplaySettings> = {},
): LocalDisplaySettings {
  return {
    settings: { ...DISPLAY_SETTINGS_DEFAULTS },
    updatedAt: { theme: null, density: null, aiIntent: null },
    ...overrides,
  };
}

describe('normalizers', () => {
  it('pass the documented vocabularies through', () => {
    expect(normalizeDisplayTheme('system')).toBe('system');
    expect(normalizeDisplayDensity('compact')).toBe('compact');
    expect(normalizeDisplayAIIntent('deep')).toBe('deep');
  });

  it('fall back to the old defaults for anything else', () => {
    expect(normalizeDisplayTheme('midnight')).toBe('dark');
    expect(normalizeDisplayDensity('tight')).toBe('comfortable');
    expect(normalizeDisplayAIIntent('auto-router')).toBe('auto');
    expect(normalizeDisplayAIIntent(null)).toBe('auto');
  });
});

describe('normalizeServerDisplaySettings', () => {
  it('reads stored values, flags and stamp', () => {
    const read = normalizeServerDisplaySettings({
      theme: 'light',
      density: 'compact',
      aiIntent: 'deep',
      stored: { theme: true, density: true, aiIntent: true },
      updatedAt: SERVER_TIME,
    });
    expect(read.settings).toEqual({ theme: 'light', density: 'compact', aiIntent: 'deep' });
    expect(read.stored).toEqual({ theme: true, density: true, aiIntent: true });
    expect(read.updatedAt).toBe(SERVER_TIME);
  });

  it('treats malformed payloads as nothing stored', () => {
    const read = normalizeServerDisplaySettings({ theme: 'midnight', updatedAt: 'not-a-date' });
    expect(read.settings.theme).toBe('dark');
    expect(read.stored).toEqual({ theme: false, density: false, aiIntent: false });
    expect(read.updatedAt).toBeNull();
  });
});

describe('resolveDisplaySettingsSync', () => {
  it('migrates local non-default fields up when the account holds nothing', () => {
    const decision = resolveDisplaySettingsSync(
      server(),
      local({ settings: { theme: 'light', density: 'compact', aiIntent: 'auto' } }),
    );
    expect(decision.apply).toEqual({});
    expect(decision.push).toEqual({ theme: 'light', density: 'compact' });
  });

  it('spends no write when both sides are all-default', () => {
    const decision = resolveDisplaySettingsSync(server(), local());
    expect(decision).toEqual({ apply: {}, push: {} });
  });

  it('pushes only the locally-newer field and applies the server-newer one', () => {
    const decision = resolveDisplaySettingsSync(
      server({
        settings: { theme: 'dark', density: 'compact', aiIntent: 'balanced' },
        stored: { theme: true, density: true, aiIntent: true },
        updatedAt: SERVER_TIME,
      }),
      local({
        settings: { theme: 'light', density: 'comfortable', aiIntent: 'balanced' },
        updatedAt: { theme: '2026-10-25T11:00:00.000Z', density: null, aiIntent: null },
      }),
    );
    // Theme moved on this browser after the server last heard: push it.
    expect(decision.push).toEqual({ theme: 'light' });
    // Density moved on the other device (server stamp newer, local stamp
    // absent): the server wins, and the stale local value must NOT be
    // pushed back over it.
    expect(decision.apply).toEqual({ density: 'compact' });
  });

  it('lets the server win for a legacy local field with no stamp', () => {
    const decision = resolveDisplaySettingsSync(
      server({
        settings: { theme: 'light', density: 'comfortable', aiIntent: 'auto' },
        stored: { theme: true, density: false, aiIntent: false },
        updatedAt: SERVER_TIME,
      }),
      local({ settings: { theme: 'dark', density: 'comfortable', aiIntent: 'auto' } }),
    );
    expect(decision.apply).toEqual({ theme: 'light' });
    expect(decision.push).toEqual({});
  });

  it('is a noop when both sides already agree', () => {
    const decision = resolveDisplaySettingsSync(
      server({
        settings: { theme: 'light', density: 'compact', aiIntent: 'deep' },
        stored: { theme: true, density: true, aiIntent: true },
        updatedAt: SERVER_TIME,
      }),
      local({
        settings: { theme: 'light', density: 'compact', aiIntent: 'deep' },
        updatedAt: { theme: null, density: null, aiIntent: null },
      }),
    );
    expect(decision).toEqual({ apply: {}, push: {} });
  });

  it('does not push a stored server field the local copy merely lacks', () => {
    const decision = resolveDisplaySettingsSync(
      server({
        settings: { theme: 'dark', density: 'compact', aiIntent: 'auto' },
        stored: { theme: false, density: true, aiIntent: false },
        updatedAt: SERVER_TIME,
      }),
      local(),
    );
    expect(decision.apply).toEqual({ density: 'compact' });
    expect(decision.push).toEqual({});
  });
});
