/**
 * read-receipts preference lib — the frontend copy of the backend contract.
 *
 * The setting itself is enforced server-side (the compose path reads it
 * from `User.preferences` when a request omits `trackOpens`); these tests
 * hold the frontend normalizer to the backend's rule — only an explicit
 * `false` turns tracking off — so the settings UI and the composer seeds
 * can never misread a stored value into the wrong default.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_READ_RECEIPTS_ENABLED,
  READ_RECEIPTS_PREFERENCE_KEY,
  normalizeReadReceiptsEnabled,
} from '../lib/read-receipts-preference';

describe('read receipts preference', () => {
  it('lives under the documented User.preferences key', () => {
    expect(READ_RECEIPTS_PREFERENCE_KEY).toBe('readReceiptsEnabled');
  });

  it('defaults to tracked, matching the pre-existing composer behaviour', () => {
    expect(DEFAULT_READ_RECEIPTS_ENABLED).toBe(true);
  });

  it('passes through an explicit false and only that', () => {
    expect(normalizeReadReceiptsEnabled(false)).toBe(false);
    expect(normalizeReadReceiptsEnabled(true)).toBe(true);
    for (const value of [undefined, null, '', 'off', 0, 1, {}, []]) {
      expect(normalizeReadReceiptsEnabled(value)).toBe(true);
    }
  });
});
