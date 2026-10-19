import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import { ContactsLetterIndex } from '../components/ContactsLetterIndex';

/**
 * qm-contacts-amber-accents — per-app accent regression tests.
 *
 * Contacts is the amber app (user-locked 2026-10-09: Mail orange, Calendar
 * blue, Drive green, Contacts amber, QuantGit purple). On /contacts routes
 * AppShell sets `--app-accent` to #F59E0B, so Contacts UI must only use
 * `var(--app-accent)`-derived accents — never hardcoded blue/green/purple
 * or Mail-orange (`--quant-primary` / rgba(255,140,66,…)) leaks.
 *
 * These tests pin:
 *  - no blue/green/purple/emeral hardcodes in the Contacts surfaces
 *    (call/message/share buttons, companies hero, dedupe hero, letter index);
 *  - no `--quant-info` / `--quant-primary` accent leaks in Contacts components;
 *  - the letter-index active chip + focus ring use `--app-accent`;
 *  - hero icons use the shared amber `var(--app-accent)` gradient pattern.
 *
 * Avatar gradients ARE in scope (2026-10-20 fix): getAvatarBgColor in
 * ContactsSubViews.tsx paints the list/detail/companies/circles contact
 * avatars, so it must only emit amber-family gradients — pinned both by
 * source-text assertions below and by the runtime test in
 * contacts-avatar-amber-lock.test.tsx. Still out of scope:
 * ContactGroupModal's PRESET_COLORS — the user picks a group color
 * explicitly.
 */

const SUBVIEWS = readFileSync(
  new URL('../app/contacts/components/ContactsSubViews.tsx', import.meta.url),
  'utf8',
);
const DEDUP_MODAL = readFileSync(
  new URL('../app/contacts/components/ContactsDedupeModal.tsx', import.meta.url),
  'utf8',
);
const PAGE = readFileSync(
  new URL('../app/contacts/page.tsx', import.meta.url),
  'utf8',
);
const LETTER_INDEX = readFileSync(
  new URL('../components/ContactsLetterIndex.tsx', import.meta.url),
  'utf8',
);

/** Hardcoded blue / green / purple tokens that must never appear in Contacts UI. */
const FORBIDDEN_TOKENS = [
  '#38BDF8', // sky blue — call buttons, company icons
  '#0EA5E9', // sky — dedupe hero
  '#1D4ED8', // blue — companies hero gradient
  '#3B82F6', // quant-info blue
  '#10B981', // emerald — merge button, message button
  '#34D399', // emerald light
  '#8B5CF6', // purple — share button
  '#A78BFA', // purple light — org icon
  '#93C5FD', // blue badge text
  '#1E3A8A', // blue badge bg
  'emerald-400',
  'emerald-500/10',
  'var(--quant-info)', // blue token used for the Companies hero
  'var(--quant-primary)', // Mail-orange token leaked into ContactsLetterIndex
  'rgba(255,140,66', // Mail-orange glow leaked into ContactsLetterIndex
];

function stripAvatarGradients(src: string): string {
  // Decorative per-contact identity colors, not app accents — excluded.
  return src.replace(/AVATAR_GRADIENTS[\s\S]*?];/, '');
}

describe('qm-contacts-amber-accents: no foreign accents in ContactsSubViews', () => {
  const src = stripAvatarGradients(SUBVIEWS);
  for (const token of FORBIDDEN_TOKENS) {
    it(`does not contain "${token}"`, () => {
      expect(src).not.toContain(token);
    });
  }

  it('hero icons use the amber var(--app-accent) gradient pattern', () => {
    expect(SUBVIEWS).toContain(
      'bg-gradient-to-br from-[var(--app-accent)] to-[color-mix(in_srgb,var(--app-accent),black_30%)]',
    );
  });

  it('call / message / share quick-action circles all use var(--app-accent)', () => {
    // Three quick-action circles (Call, Message, Share) plus the Email one.
    const circles = SUBVIEWS.match(
      /size-12 rounded-full border border-\[color-mix\(in_srgb,var\(--app-accent\)_50%,transparent\)\] bg-\[#3F1E0E\] text-\[var\(--app-accent\)\]/g,
    );
    expect(circles?.length).toBeGreaterThanOrEqual(4);
  });
});

describe('qm-contacts-amber-accents: ContactsDedupeModal uses amber', () => {
  for (const token of FORBIDDEN_TOKENS) {
    it(`does not contain "${token}"`, () => {
      expect(DEDUP_MODAL).not.toContain(token);
    });
  }

  it('empty-state icon uses var(--app-accent)', () => {
    expect(DEDUP_MODAL).toContain('text-[var(--app-accent)]');
  });
});

describe('qm-contacts-amber-accents: contacts page (incl. mobile tabs) is amber', () => {
  for (const token of FORBIDDEN_TOKENS) {
    it(`does not contain "${token}"`, () => {
      expect(PAGE).not.toContain(token);
    });
  }

  it('mobile subview tabs use var(--app-accent), not --quant-primary', () => {
    const actives = PAGE.match(
      /bg-\[var\(--app-accent\)\]\/20 text-\[var\(--app-accent\)\] border border-\[var\(--app-accent\)\]\/40 shadow-sm/g,
    );
    expect(actives?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('qm-contacts-amber-accents: contact avatar gradients are amber-family', () => {
  const picker =
    SUBVIEWS.match(/export function getAvatarBgColor[\s\S]*?^}/m)?.[0] ?? '';

  it('picker lists only amber-family gradients', () => {
    expect(picker.length).toBeGreaterThan(0);
    const gradients = picker.match(
      /'(from-(?:amber|orange|yellow)-\d+ to-(?:amber|orange|yellow)-\d+)'/g,
    );
    expect(gradients?.length).toBeGreaterThanOrEqual(2);
  });

  it('no rainbow hue remains in the avatar gradient picker', () => {
    for (const hue of [
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
    ]) {
      expect(picker, `picker leaks the ${hue} hue`).not.toContain(`from-${hue}`);
    }
  });
});

describe('qm-contacts-amber-accents: ContactsLetterIndex active chip is amber', () => {
  it('renders the active chip with the amber accent, not Mail orange', () => {
    const html = renderToStaticMarkup(
      <ContactsLetterIndex
        groups={[
          { letter: 'A', count: 3 },
          { letter: 'B', count: 1 },
        ]}
        activeLetter="A"
        onJump={() => {}}
      />,
    );
    expect(html).toContain('bg-[var(--app-accent)]');
    expect(html).not.toContain('rgba(255,140,66');
  });

  it('source uses --app-accent for active state and focus ring', () => {
    expect(LETTER_INDEX).toContain('text-[var(--app-accent)]');
    expect(LETTER_INDEX).toContain('focus-visible:ring-[var(--app-accent)]');
    expect(LETTER_INDEX).not.toContain('var(--quant-primary)');
  });
});
