// ============================================================================
// fix/qm-drive-folder-colors-2 — folder-colors lib unit tests.
//
// The palette is FIXED and shared with the backend: normalization must clamp
// any backend value to the palette (case-insensitively) and map unknown
// values to null (default tint), so a stale/foreign row can never render in
// an arbitrary color. No fake data — all assertions are over the real
// FOLDER_COLORS list.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { FOLDER_COLORS, normalizeFolderColor, folderColorName } from '../lib/folder-colors';

describe('folder-colors', () => {
  it('exposes exactly 16 palette swatches with unique hexes', () => {
    expect(FOLDER_COLORS).toHaveLength(16);
    const hexes = FOLDER_COLORS.map((c) => c.hex.toUpperCase());
    expect(new Set(hexes).size).toBe(16);
    for (const hex of hexes) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('normalizeFolderColor passes palette hexes through (case-insensitive)', () => {
    expect(normalizeFolderColor('#E87171')).toBe('#E87171');
    expect(normalizeFolderColor('#e87171')).toBe('#E87171');
  });

  it('normalizeFolderColor clamps null/undefined/unknown to null', () => {
    expect(normalizeFolderColor(null)).toBeNull();
    expect(normalizeFolderColor(undefined)).toBeNull();
    expect(normalizeFolderColor('')).toBeNull();
    expect(normalizeFolderColor('#DEAD00')).toBeNull();
    expect(normalizeFolderColor('not-a-color')).toBeNull();
  });

  it('folderColorName returns the palette name or null', () => {
    expect(folderColorName('#E87171')).toBe('Tomato');
    expect(folderColorName('#e87171')).toBe('Tomato');
    expect(folderColorName(null)).toBeNull();
    expect(folderColorName('#DEAD00')).toBeNull();
  });
});
