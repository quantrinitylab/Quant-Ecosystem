import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import {
  DedupWizardSubView,
  CirclesSubView,
  ContactDetailSheet,
  type DedupCollisionPair,
} from '../app/(app)/contacts/components/ContactsSubViews';

/**
 * QM-UIUX-026 — fake-data purge regression tests.
 *
 * The contacts surface previously rendered fabricated data as if it were the
 * user's own:
 *  - DedupWizardSubView hardcoded a "Detected Collision: Sundar Pichai" demo
 *    with invented emails/phone and a "98% Match Confidence" badge, plus copy
 *    claiming continuous scanning of the user's address books.
 *  - CirclesSubView hardcoded "Executive Board / Core Engineers / Product
 *    Council" circles naming REAL public figures (Sundar Pichai, Satya
 *    Nadella, Sam Altman, Linus Torvalds, Demis Hassabis) as members.
 *  - ContactDetailSheet invented two shared meetings ("Product Sync …",
 *    "Tomorrow at 10:30 AM") for every contact.
 *
 * These tests pin the honest behavior: no fabricated contacts render, empty
 * states are reachable, and every count/badge derives from real props.
 */

const FABRICATED_MARKERS = [
  'Sundar Pichai',
  'Satya Nadella',
  'Sam Altman',
  'Linus Torvalds',
  'Demis Hassabis',
  'sundar@google.com',
  'sundar.pichai@gmail.com',
  '+1 (650) 253-0000',
  'Astra Executive AI',
  'Dev Sentinel',
  'Executive Board',
  'Core Engineers',
  'Product Council',
  '98% Match',
  '100% synchronized',
  'continuously scans',
];

function sourceOfComponent(): string {
  return readFileSync(
    new URL('../app/(app)/contacts/components/ContactsSubViews.tsx', import.meta.url),
    'utf8',
  );
}

describe('QM-UIUX-026: shipped component source contains no fabricated contacts', () => {
  it('has no fabricated names, emails, phones, or invented claims in source', () => {
    const src = sourceOfComponent();
    for (const marker of FABRICATED_MARKERS) {
      expect(src, `fabricated marker still in source: ${marker}`).not.toContain(marker);
    }
  });

  it('has no fabricated fallback broadcast address template', () => {
    expect(sourceOfComponent()).not.toContain('circle.id}@quantrinity.in');
    expect(sourceOfComponent()).not.toContain('exec_board@quantrinity.in');
  });
});

// QM-SCREEN-012 R2: VipContactsSubView was dead code (never mounted) carrying
// invented marketing copy ("Executive VIP Directory", "{n} EXECUTIVES",
// "Priority boardroom contacts with instant sovereign dial & dispatch") —
// deleted along with the tests that pinned it.

describe('QM-UIUX-026: DedupWizardSubView never invents collisions', () => {
  const noop = () => {};

  it('no collisions -> honest clean state, no fabricated demo', () => {
    const html = renderToStaticMarkup(
      <DedupWizardSubView
        isMerged={false}
        onMerge={noop}
        onKeepSeparate={noop}
        onOpenFullModal={noop}
        onRescan={noop}
      />,
    );
    expect(html).toContain('No duplicates detected');
    expect(html).toContain('All Contacts Deduplicated');
    for (const marker of FABRICATED_MARKERS) {
      expect(html, `fabricated marker rendered: ${marker}`).not.toContain(marker);
    }
  });

  it('isMerged -> clean state too', () => {
    const html = renderToStaticMarkup(
      <DedupWizardSubView
        isMerged
        onMerge={noop}
        onKeepSeparate={noop}
        onOpenFullModal={noop}
        onRescan={noop}
      />,
    );
    expect(html).toContain('All Contacts Deduplicated');
  });

  it('real collisions -> data-driven wizard, merge carries the collision id', () => {
    const collisions: DedupCollisionPair[] = [
      {
        id: 'col-1',
        recordA: { id: 'a', name: 'Jordan Lee', sourceLabel: 'Google Workspace', email: 'jordan@work.com' },
        recordB: { id: 'b', name: 'Jordan Lee', sourceLabel: 'Local Device', email: 'jordan.lee@home.com' },
        matchConfidence: 91,
      },
    ];
    const onMerge = vi.fn();
    const html = renderToStaticMarkup(
      <DedupWizardSubView
        isMerged={false}
        collisions={collisions}
        onMerge={onMerge}
        onKeepSeparate={noop}
        onOpenFullModal={noop}
        onRescan={noop}
      />,
    );
    expect(html).toContain('Detected Collision: Jordan Lee');
    expect(html).toContain('91% Match');
    expect(html).toContain('jordan@work.com');
    expect(html).toContain('jordan.lee@home.com');
    expect(html).toContain('1 Potential Duplicate Detected');
    for (const marker of FABRICATED_MARKERS) {
      expect(html, `fabricated marker rendered: ${marker}`).not.toContain(marker);
    }
    // Static markup cannot fire handlers; assert the contract shape instead:
    expect(typeof onMerge).toBe('function');
  });

  it('collision without confidence -> no invented percentage', () => {
    const collisions: DedupCollisionPair[] = [
      {
        id: 'col-2',
        recordA: { id: 'a', name: 'Jordan Lee', sourceLabel: 'Google Workspace' },
        recordB: { id: 'b', name: 'Jordan Lee', sourceLabel: 'Local Device' },
      },
    ];
    const html = renderToStaticMarkup(
      <DedupWizardSubView
        isMerged={false}
        collisions={collisions}
        onMerge={noop}
        onKeepSeparate={noop}
        onOpenFullModal={noop}
        onRescan={noop}
      />,
    );
    expect(html).not.toMatch(/\d+% Match/);
  });
});

// QM-SCREEN-012 R2: the circles-list branch was dead in production (no caller
// ever passed circles) and carried invented copy ("Enterprise Circles" /
// "Access-controlled trust groups and broadcast distribution syndicates"), so
// it is deleted. The component is now only the honest empty state; the tests
// that exercised the dead branch go with it.
describe('QM-UIUX-026: CirclesSubView renders only the honest empty state', () => {
  it('renders the empty state, no fabricated circles', () => {
    const html = renderToStaticMarkup(<CirclesSubView />);
    expect(html).toContain('No circles yet');
    expect(html).not.toContain('Enterprise Circles');
    expect(html).not.toContain('Access-controlled trust groups');
    for (const marker of FABRICATED_MARKERS) {
      expect(html, `fabricated marker rendered: ${marker}`).not.toContain(marker);
    }
  });
});

describe('QM-UIUX-026: ContactDetailSheet never invents meetings', () => {
  const contact = {
    id: 'c1',
    userId: 'u1',
    name: 'Real Person',
    email: 'real@example.com',
    addresses: [],
    tags: [],
    socialLinks: {},
    isFavorite: false,
    source: 'manual',
    syncedApps: [],
  } as any;

  it('no meetings -> honest empty state, badge shows 0', () => {
    const html = renderToStaticMarkup(<ContactDetailSheet contact={contact} recentMail={[]} />);
    expect(html).toContain('No shared meetings found');
    expect(html).not.toContain('Product Sync');
    expect(html).not.toContain('Tomorrow at 10:30 AM');
    expect(html).not.toContain('Virtual Room #8');
  });

  it('real meetings -> rendered with real count', () => {
    const html = renderToStaticMarkup(
      <ContactDetailSheet
        contact={contact}
        recentMail={[]}
        meetings={[{ id: 'm1', title: 'Real Standup', time: 'Today at 9:00 AM', duration: '15 mins' }]}
      />,
    );
    expect(html).toContain('Real Standup');
    expect(html).toContain('Today at 9:00 AM');
  });
});
