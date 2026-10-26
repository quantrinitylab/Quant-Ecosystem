// @vitest-environment node
// ============================================================================
// Display settings that roam with the account — service contracts.
//
//   1. Normalizers: the three vocabularies pass through; anything else falls
//      back to the old localStorage defaults (dark / comfortable / auto), so
//      a user who never chose sees exactly what they saw before.
//   2. readDisplaySettingsFromPreferences: reads the four documented
//      `User.preferences` keys; `stored` flags say which fields the server
//      actually holds, and a malformed stamp reads as null, never as a date.
//   3. readUserDisplaySettings: a store failure fails open to the defaults —
//      a settings read must never cost the user their theme.
//   4. writeUserDisplaySettings: merges into the existing preferences JSON,
//      preserving unrelated keys; stamps the write; returns the full
//      normalised triple the caller adopts.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import {
  normalizeDisplayAIIntent,
  normalizeDisplayDensity,
  normalizeDisplayTheme,
  readDisplaySettingsFromPreferences,
  readUserDisplaySettings,
  writeUserDisplaySettings,
  type DisplaySettingsStore,
} from '../services/display-settings.service';

function fakeStore(preferences: Record<string, unknown> | null) {
  let current = preferences;
  return {
    store: {
      user: {
        findUnique: vi.fn(async () => (current === null ? null : { preferences: current })),
        update: vi.fn(async ({ data }: { data: { preferences: unknown } }) => {
          current = data.preferences as Record<string, unknown>;
          return {};
        }),
      },
    } as unknown as DisplaySettingsStore,
    get: () => current,
  };
}

describe('normalizeDisplayTheme', () => {
  it.each(['dark', 'light', 'system'] as const)('passes through %s', (theme) => {
    expect(normalizeDisplayTheme(theme)).toBe(theme);
  });

  it.each([undefined, null, '', 'midnight', 'DARK', 0, {}, []])('falls back to dark for %p', (value) => {
    expect(normalizeDisplayTheme(value)).toBe('dark');
  });
});

describe('normalizeDisplayDensity', () => {
  it.each(['comfortable', 'cozy', 'compact'] as const)('passes through %s', (density) => {
    expect(normalizeDisplayDensity(density)).toBe(density);
  });

  it.each([undefined, null, '', 'tight', 'COMPACT', 0])('falls back to comfortable for %p', (value) => {
    expect(normalizeDisplayDensity(value)).toBe('comfortable');
  });
});

describe('normalizeDisplayAIIntent', () => {
  it.each(['auto', 'fast', 'balanced', 'deep'] as const)('passes through %s', (intent) => {
    expect(normalizeDisplayAIIntent(intent)).toBe(intent);
  });

  it.each([undefined, null, '', 'auto-router', '@cf/meta/llama-3.3-70b-instruct', 'FAST'])(
    'falls back to auto for %p',
    (value) => {
      expect(normalizeDisplayAIIntent(value)).toBe('auto');
    },
  );
});

describe('readDisplaySettingsFromPreferences', () => {
  it('returns defaults with all flags false for empty preferences', () => {
    const read = readDisplaySettingsFromPreferences({});
    expect(read.settings).toEqual({ theme: 'dark', density: 'comfortable', aiIntent: 'auto' });
    expect(read.stored).toEqual({ theme: false, density: false, aiIntent: false });
    expect(read.updatedAt).toBeNull();
  });

  it('reads stored values, flags them, and parses the stamp', () => {
    const read = readDisplaySettingsFromPreferences({
      displayTheme: 'light',
      displayDensity: 'compact',
      aiIntent: 'deep',
      displaySettingsUpdatedAt: '2026-10-25T10:00:00.000Z',
      mailNotificationMode: 'important',
    });
    expect(read.settings).toEqual({ theme: 'light', density: 'compact', aiIntent: 'deep' });
    expect(read.stored).toEqual({ theme: true, density: true, aiIntent: true });
    expect(read.updatedAt).toBe('2026-10-25T10:00:00.000Z');
  });

  it('ignores non-object preferences and malformed stamps', () => {
    expect(readDisplaySettingsFromPreferences(null).settings.theme).toBe('dark');
    expect(readDisplaySettingsFromPreferences([]).settings.theme).toBe('dark');
    const read = readDisplaySettingsFromPreferences({ displaySettingsUpdatedAt: 'not-a-date' });
    expect(read.updatedAt).toBeNull();
  });

  it('normalises a stored value that no longer matches any option', () => {
    const read = readDisplaySettingsFromPreferences({ displayTheme: 'midnight' });
    expect(read.settings.theme).toBe('dark');
    // The key exists, so the field counts as stored even though its value
    // fell back — the frontend must not re-upload a default over it.
    expect(read.stored.theme).toBe(true);
  });
});

describe('readUserDisplaySettings', () => {
  it('fails open to defaults on a store error', async () => {
    const store = {
      user: {
        findUnique: vi.fn(async () => {
          throw new Error('db down');
        }),
        update: vi.fn(),
      },
    } as unknown as DisplaySettingsStore;
    const read = await readUserDisplaySettings(store, 'user-1');
    expect(read.settings).toEqual({ theme: 'dark', density: 'comfortable', aiIntent: 'auto' });
    expect(read.updatedAt).toBeNull();
  });
});

describe('writeUserDisplaySettings', () => {
  it('merges a partial write and preserves unrelated keys', async () => {
    const { store, get } = fakeStore({ mailNotificationMode: 'important', displayTheme: 'light' });
    const read = await writeUserDisplaySettings(store, 'user-1', { density: 'compact' });
    expect(read.settings).toEqual({ theme: 'light', density: 'compact', aiIntent: 'auto' });
    expect(read.stored).toEqual({ theme: true, density: true, aiIntent: false });
    expect(read.updatedAt).not.toBeNull();
    const saved = get() as Record<string, unknown>;
    expect(saved.mailNotificationMode).toBe('important');
    expect(saved.displayDensity).toBe('compact');
    expect(typeof saved.displaySettingsUpdatedAt).toBe('string');
  });

  it('starts from an empty blob when the user has no preferences yet', async () => {
    const { store, get } = fakeStore(null);
    const read = await writeUserDisplaySettings(store, 'user-1', { theme: 'system' });
    expect(read.settings.theme).toBe('system');
    expect((get() as Record<string, unknown>).displayTheme).toBe('system');
  });
});
