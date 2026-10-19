import { describe, it, expect } from 'vitest';
import { getAvatarBgColor } from '../app/contacts/components/ContactsSubViews';

/**
 * qm-contacts-avatar-amber-lock — locked per-app accent regression test.
 *
 * Contacts is the amber app (user-locked 2026-10-09: Mail orange, Calendar
 * blue, Drive green, Contacts amber, QuantGit purple). getAvatarBgColor in
 * ContactsSubViews.tsx paints the contact avatars in the list, the detail
 * view, companies and circles — it must only emit amber-family gradients.
 * The old rainbow palette (indigo/purple, pink/rose, blue/cyan, emerald/teal,
 * violet/fuchsia) broke the lock and rendered contacts in blue, purple,
 * pink, emerald and violet avatars. Any future palette addition outside the
 * amber family fails this test.
 */

const ALLOWED_HUE_PREFIXES = ['amber', 'orange', 'yellow'];
const FORBIDDEN_HUES = [
  'indigo',
  'purple',
  'pink',
  'rose',
  'blue',
  'cyan',
  'emerald',
  'teal',
  'violet',
  'fuchsia',
  'green',
  'red',
  'slate',
  'sky',
];

/** Every color stop of the gradient must be amber-family, nothing else. */
function assertAmberOnly(gradient: string) {
  const stops = gradient
    .replace(/^from-/, '')
    .replace(/\s+to-/, ' ')
    .split(' ')
    .filter(Boolean);
  expect(stops.length, `gradient "${gradient}" has no color stops`).toBeGreaterThan(0);
  for (const stop of stops) {
    expect(
      ALLOWED_HUE_PREFIXES.some((h) => stop.startsWith(h)),
      `color stop "${stop}" in "${gradient}" is not amber-family`,
    ).toBe(true);
  }
  for (const hue of FORBIDDEN_HUES) {
    expect(gradient, `gradient "${gradient}" leaks the ${hue} hue`).not.toContain(hue);
  }
}

describe('qm-contacts-avatar-amber-lock: getAvatarBgColor emits amber-family gradients only', () => {
  const seeds: Array<string | undefined> = [
    undefined,
    '',
    'Aarav Sharma',
    'Priya Nair',
    'zhang wei',
    'kundan@quantmail.in',
    'CT',
    '+91 90000 00000',
    'Unnamed contact',
    'Ananya Iyer',
    'Rohan Mehta',
    'Sofia Garcia',
    'John',
    'A',
    'aa',
    'aaa',
    'Test User 123',
    '  whitespace  ',
  ];

  it('every seed resolves to an amber-family gradient string', () => {
    for (const seed of seeds) {
      const gradient = getAvatarBgColor(seed);
      expect(typeof gradient).toBe('string');
      assertAmberOnly(gradient);
    }
  });

  it('is deterministic: the same name always gets the same gradient', () => {
    for (const seed of seeds) {
      expect(getAvatarBgColor(seed)).toBe(getAvatarBgColor(seed));
    }
  });

  it('distributes across multiple amber-family gradients (not one hardcode)', () => {
    const distinct = new Set(seeds.map((s) => getAvatarBgColor(s)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('handles undefined / empty seeds without crashing (nameless-record guard)', () => {
    expect(typeof getAvatarBgColor(undefined)).toBe('string');
    expect(typeof getAvatarBgColor('')).toBe('string');
  });
});
