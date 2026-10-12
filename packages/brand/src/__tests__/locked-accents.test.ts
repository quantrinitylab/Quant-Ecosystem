/**
 * Locked per-app accents (user decision 2026-10-09, reaffirmed 2026-10-12).
 *
 * Mail orange, Calendar blue, Drive green, Contacts amber, QuantGit purple.
 * This test guards the brand registry against drift: apps.ts colors, the
 * exported SVG icons, and the logo SVGs must all agree with the lock.
 */
import { describe, expect, it } from 'vitest';
import { apps } from '../apps';
import { quantmailIcon } from '../icons/quantmail';
import { quantcalendarIcon } from '../icons/quantcalendar';
import { quantdriveIcon } from '../icons/quantdrive';
import { appLogos } from '../logos/app-logos';

const LOCKED: Record<string, string> = {
  quantmail: '#FF8C42', // Mail orange
  quantcalendar: '#3B82F6', // Calendar blue
  quantdrive: '#16A34A', // Drive green
};

describe('locked per-app accents', () => {
  for (const [appId, color] of Object.entries(LOCKED)) {
    it(`${appId} registry color is locked to ${color}`, () => {
      expect(apps[appId]!.color.toUpperCase()).toBe(color);
    });
  }

  it('quantmail icon uses Mail orange', () => {
    expect(quantmailIcon).toContain('#FF8C42');
    expect(quantmailIcon).not.toContain('#3B82F6');
  });

  it('quantcalendar icon uses Calendar blue', () => {
    expect(quantcalendarIcon).toContain('#3B82F6');
    expect(quantcalendarIcon).not.toContain('#F97316');
  });

  it('quantdrive icon uses Drive green', () => {
    expect(quantdriveIcon).toContain('#16A34A');
    expect(quantdriveIcon).not.toContain('#6366F1');
  });

  it('logo SVGs match the locked accents', () => {
    for (const [appId, color] of Object.entries(LOCKED)) {
      for (const variant of ['light', 'dark'] as const) {
        expect(appLogos[appId]![variant]).toContain(`fill="${color}"`);
      }
    }
  });
});
