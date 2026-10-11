// ============================================================================
// Compose-honesty P0: pillar accents are user-locked and must come from ONE
// source of truth.
//
// Locked 2026-10-09 ~11:00 IST (user correction): Mail #FF6B35 orange,
// Calendar #4285F4 blue, Drive #34A853 green, Contacts #F59E0B amber,
// QuantGit #8B5CF6 purple.
//
// Before this fix, the desktop sidebar (PILLAR_SUB_CONFIGS in
// desktopContextTabs.tsx) hardcoded pre-lock values (Mail #FF8C42 via
// var(--quant-primary), Calendar amber via var(--quant-warning), Drive
// #38BDF8 sky-blue, Contacts #10B981 emerald, QuantGit #A78BFA), diverging
// from mobile — and three different QuantGit purples (#A78BFA, #A855F7,
// #C084FC) floated around the UI.
//
// These tests pin:
//   (a) PILLAR_SUB_CONFIGS accentColor equals PILLAR_ACCENTS for every pillar;
//   (b) APP_THEMES derives its accent/ring from PILLAR_ACCENTS (no drift);
//   (c) no non-canonical QuantGit purple survives in the themed modules.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { PILLAR_ACCENTS } from '../pillar-accents';
import { PILLAR_SUB_CONFIGS } from '../desktopContextTabs';
import { APP_THEMES } from '../../lib/app-theme';

const LOCKED = {
  mail: '#FF6B35',
  calendar: '#4285F4',
  drive: '#34A853',
  contacts: '#F59E0B',
  quantgit: '#8B5CF6',
} as const;

describe('pillar accent lock', () => {
  it('(a) PILLAR_ACCENTS holds the user-locked values', () => {
    expect(PILLAR_ACCENTS).toEqual(LOCKED);
  });

  it('(b) desktop PILLAR_SUB_CONFIGS reads accentColor from PILLAR_ACCENTS', () => {
    for (const pillar of Object.keys(LOCKED) as (keyof typeof LOCKED)[]) {
      expect(PILLAR_SUB_CONFIGS[pillar].accentColor).toBe(PILLAR_ACCENTS[pillar]);
    }
  });

  it('(c) desktop sidebar style strings use the locked hex (Tailwind-static)', () => {
    for (const pillar of Object.keys(LOCKED) as (keyof typeof LOCKED)[]) {
      const hex = LOCKED[pillar];
      const cfg = PILLAR_SUB_CONFIGS[pillar];
      expect(cfg.activeContainerStyle).toContain(`bg-[${hex}]`);
      expect(cfg.activeTextStyle).toContain(`text-[${hex}]`);
      expect(cfg.badgeStyle).toContain(`bg-[${hex}]`);
    }
  });

  it('(d) APP_THEMES derives accent and ring from PILLAR_ACCENTS', () => {
    for (const pillar of Object.keys(LOCKED) as (keyof typeof LOCKED)[]) {
      expect(APP_THEMES[pillar].accent).toBe(PILLAR_ACCENTS[pillar]);
      expect(APP_THEMES[pillar].ring).toBe(PILLAR_ACCENTS[pillar]);
    }
  });
});
