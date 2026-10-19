import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import {
  SUBVIEW_TABS,
  SECONDARY_TAB_IDS,
  secondaryTabLabel,
  ContactsSecondaryTabStrip,
} from '../app/contacts/components/ContactsSecondaryTabs';

/**
 * qm-contacts-secondary-tabs-labels — the mobile secondary tab strip on
 * /contacts rendered raw tab ids ('companies'/'dedup'/'groups') through the
 * CSS `capitalize` class, so the user-visible label was derived from code
 * style rather than explicit copy. A locale or Tailwind-class change could
 * silently rename the tabs.
 *
 * Fix: tab text comes ONLY from the explicit SUBVIEW_TABS label constants
 * (via secondaryTabLabel); the strip no longer uses `capitalize`.
 *
 * These tests pin:
 *  - every secondary tab id maps to a non-empty explicit label, never the raw id;
 *  - labels stay in sync with SUBVIEW_TABS (single source of truth);
 *  - rendered markup shows "Companies"/"Dedup"/"Groups", never lowercase raw
 *    ids as button text, never a `capitalize` class, with aria-current="page"
 *    on exactly the active tab;
 *  - the strip stays mobile-only (md:hidden);
 *  - page.tsx no longer contains the old capitalize-based inline block.
 */

const PAGE = readFileSync(
  new URL('../app/contacts/page.tsx', import.meta.url),
  'utf8',
);

describe('qm-contacts-secondary-tabs-labels: explicit label mapping', () => {
  it('maps every secondary tab id to its explicit display label', () => {
    expect(secondaryTabLabel('companies')).toBe('Companies');
    expect(secondaryTabLabel('dedup')).toBe('Dedup');
    expect(secondaryTabLabel('groups')).toBe('Groups');
  });

  it('never returns the raw id as the label', () => {
    for (const id of SECONDARY_TAB_IDS) {
      const label = secondaryTabLabel(id);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(id);
    }
  });

  it('labels stay in sync with SUBVIEW_TABS (single source of truth)', () => {
    for (const id of SECONDARY_TAB_IDS) {
      const entry = SUBVIEW_TABS.find((t) => t.id === id);
      expect(entry, `SUBVIEW_TABS entry for ${id}`).toBeDefined();
      expect(secondaryTabLabel(id)).toBe(entry!.label);
    }
  });
});

describe('qm-contacts-secondary-tabs-labels: rendered strip', () => {
  const noop = () => {};

  for (const active of SECONDARY_TAB_IDS) {
    it(`renders explicit labels with "${active}" active`, () => {
      const html = renderToStaticMarkup(
        <ContactsSecondaryTabStrip activeTab={active} onTabChange={noop} />,
      );
      // Explicit human labels, in order.
      expect(html).toContain('>Companies<');
      expect(html).toContain('>Dedup<');
      expect(html).toContain('>Groups<');
      // Never the raw lowercase ids as visible button text.
      expect(html).not.toContain('>companies<');
      expect(html).not.toContain('>dedup<');
      expect(html).not.toContain('>groups<');
      // No CSS capitalize manufacturing the label.
      expect(html).not.toContain('capitalize');
      // Mobile-only strip.
      expect(html).toContain('md:hidden');
      // aria-current="page" exactly once, on the active tab's button.
      const currentCount = (html.match(/aria-current="page"/g) || []).length;
      expect(currentCount).toBe(1);
      const activeLabel = secondaryTabLabel(active);
      expect(html).toMatch(
        new RegExp(`aria-current="page"[^>]*>${activeLabel}</`),
      );
    });
  }
});

describe('qm-contacts-secondary-tabs-labels: page.tsx regression', () => {
  it('no longer derives tab labels via the CSS capitalize class', () => {
    // The old inline block: className template containing `capitalize`.
    expect(PAGE).not.toMatch(/font-semibold capitalize/);
    // The old inline id-array render is gone.
    expect(PAGE).not.toContain(`(['companies', 'dedup', 'groups'] as const).map`);
  });

  it('uses the explicit-label strip component', () => {
    expect(PAGE).toContain('<ContactsSecondaryTabStrip');
    expect(PAGE).toContain(
      "from './components/ContactsSecondaryTabs'",
    );
  });
});
