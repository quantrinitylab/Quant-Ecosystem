// @vitest-environment node
// ============================================================================
// read-receipts preference (fix/qm-read-receipts) — the per-user default
// for open tracking, stored in `User.preferences` JSON.
//
// Contracts under test:
//   1. normalizeReadReceiptsEnabled: only an explicit `false` turns tracking
//      off; anything else (missing, wrong type, unknown value) keeps the
//      pre-existing tracked-by-default behaviour.
//   2. readReadReceiptsEnabledFromPreferences: reads the single documented
//      `User.preferences` key; ignores non-object preferences.
//   3. readUserReadReceiptsEnabled: store failure fails open to true — a
//      preference outage must never silently untrack a send.
//   4. writeUserReadReceiptsEnabled: merges into the existing preferences
//      JSON, preserving unrelated keys.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import {
  normalizeReadReceiptsEnabled,
  readReadReceiptsEnabledFromPreferences,
  readUserReadReceiptsEnabled,
  writeUserReadReceiptsEnabled,
  type ReadReceiptsPreferenceStore,
} from '../services/read-receipts-preference.service';

function storeWith(preferences: unknown, fail = false): ReadReceiptsPreferenceStore {
  let current = preferences;
  return {
    user: {
      findUnique: vi.fn(async () => {
        if (fail) throw new Error('store down');
        return { preferences: current };
      }),
      update: vi.fn(async ({ data }: { data: { preferences: unknown } }) => {
        current = data.preferences;
        return { id: 'user-1' };
      }),
    },
  };
}

describe('normalizeReadReceiptsEnabled', () => {
  it('passes through an explicit false', () => {
    expect(normalizeReadReceiptsEnabled(false)).toBe(false);
  });

  it('keeps the tracked default for true and for anything unrecognised', () => {
    expect(normalizeReadReceiptsEnabled(true)).toBe(true);
    for (const value of [undefined, null, '', 'off', 0, 1, {}, []]) {
      expect(normalizeReadReceiptsEnabled(value)).toBe(true);
    }
  });
});

describe('readReadReceiptsEnabledFromPreferences', () => {
  it('reads the documented key', () => {
    expect(readReadReceiptsEnabledFromPreferences({ readReceiptsEnabled: false })).toBe(false);
    expect(readReadReceiptsEnabledFromPreferences({ readReceiptsEnabled: true })).toBe(true);
  });

  it('defaults to true when the key is absent or the preferences are not an object', () => {
    expect(readReadReceiptsEnabledFromPreferences({})).toBe(true);
    expect(readReadReceiptsEnabledFromPreferences(null)).toBe(true);
    expect(readReadReceiptsEnabledFromPreferences(undefined)).toBe(true);
    expect(readReadReceiptsEnabledFromPreferences('false')).toBe(true);
    expect(readReadReceiptsEnabledFromPreferences([{ readReceiptsEnabled: false }])).toBe(true);
  });
});

describe('readUserReadReceiptsEnabled', () => {
  it('fails open to true when the store throws', async () => {
    const store = storeWith({ readReceiptsEnabled: false }, true);
    await expect(readUserReadReceiptsEnabled(store, 'user-1')).resolves.toBe(true);
  });
});

describe('writeUserReadReceiptsEnabled', () => {
  it('merges into existing preferences without clobbering unrelated keys', async () => {
    const store = storeWith({ mailNotificationMode: 'important', other: 1 });
    await expect(writeUserReadReceiptsEnabled(store, 'user-1', false)).resolves.toBe(false);
    const written = (store.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data
      .preferences as Record<string, unknown>;
    expect(written).toEqual({
      mailNotificationMode: 'important',
      other: 1,
      readReceiptsEnabled: false,
    });
  });

  it('starts from an empty object when the stored preferences are not an object', async () => {
    const store = storeWith('garbage');
    await writeUserReadReceiptsEnabled(store, 'user-1', false);
    const written = (store.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data
      .preferences as Record<string, unknown>;
    expect(written).toEqual({ readReceiptsEnabled: false });
  });
});
