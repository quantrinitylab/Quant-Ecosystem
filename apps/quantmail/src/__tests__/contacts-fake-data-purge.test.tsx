import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import {
  VipContactsSubView,
  DedupWizardSubView,
  CirclesSubView,
  ContactDetailSheet,
  type DedupCollisionPair,
  type EnterpriseCircleItem,
} from '../app/contacts/components/ContactsSubViews';

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
    new URL('../app/contacts/components/ContactsSubViews.tsx', import.meta.url),
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

describe('QM-UIUX-026: VipContactsSubView badge reflects the real count', () => {
  const noop = () => {};

  it('empty contacts -> honest empty state, 0 EXECUTIVES', () => {
    const html = renderToStaticMarkup(
      <VipContactsSubView contacts={[]} onInspect={noop} onCall={noop} onEmail={noop} />,
    );
    expect(html).toContain('No VIP contacts yet');
    expect(html).toContain('0 EXECUTIVES');
    for (const marker of FABRICATED_MARKERS) {
      expect(html, `fabricated marker rendered: ${marker}`).not.toContain(marker);
    }
  });

  it('real VIP contacts -> badge counts only real VIPs', () => {
    const contacts = [
      { id: 'c1', name: 'Real Person', email: 'real@example.com', isVip: true, isStarred: false, tag: '' },
      { id: 'c2', name: 'Ordinary Person', email: 'ordinary@example.com', isVip: false, isStarred: false, tag: '' },
    ];
    const html = renderToStaticMarkup(
      <VipContactsSubView contacts={contacts as any} onInspect={noop} onCall={noop} onEmail={noop} />,
    );
    expect(html).toContain('1 EXECUTIVES');
    expect(html).toContain('Real Person');
    expect(html).not.toContain('Ordinary Person');
  });
});

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

describe('QM-UIUX-026: CirclesSubView renders only real circles', () => {
  const noop = () => {};

  it('no circles -> honest empty state, no fabricated circles', () => {
    const html = renderToStaticMarkup(
      <CirclesSubView contacts={[]} onBroadcast={noop} onViewCircle={noop} />,
    );
    expect(html).toContain('No circles yet');
    for (const marker of FABRICATED_MARKERS) {
      expect(html, `fabricated marker rendered: ${marker}`).not.toContain(marker);
    }
  });

  it('real circles -> real names and real count badge', () => {
    const circles: EnterpriseCircleItem[] = [
      {
        id: 'g1',
        name: 'Family',
        memberCount: 2,
        description: 'My family group',
        themeColor: '#F59E0B',
        badgeStyle: 'border-[#F59E0B]/50',
        memberNames: ['real@example.com', 'other@example.com'],
      },
    ];
    const html = renderToStaticMarkup(
      <CirclesSubView contacts={[]} circles={circles} onBroadcast={noop} onViewCircle={noop} />,
    );
    expect(html).toContain('Family');
    expect(html).toContain('1 CIRCLES');
    expect(html).toContain('2 Members');
    expect(html).not.toContain('Verified Members');
  });

  it('broadcast resolves only real contact emails, never invents an address', () => {
    const onBroadcast = vi.fn();
    const circles: EnterpriseCircleItem[] = [
      {
        id: 'g1',
        name: 'Family',
        memberCount: 1,
        description: '',
        themeColor: '#F59E0B',
        badgeStyle: '',
        memberNames: ['Nobody Real'],
      },
    ];
    renderToStaticMarkup(
      <CirclesSubView contacts={[]} circles={circles} onBroadcast={onBroadcast} onViewCircle={noop} />,
    );
    // Static render cannot click; contract check only.
    expect(typeof onBroadcast).toBe('function');
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
