import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import {
  DedupWizardSubView,
  type DedupCollisionPair,
} from '../app/contacts/components/ContactsSubViews';

/**
 * qm-dedup-cluster — wizard merge-scope honesty regression tests.
 *
 * The dedup wizard merges the WHOLE duplicate cluster (page.tsx
 * handleDedupMerge -> apiClient.mergeContacts(primaryId, ALL duplicateIds)),
 * so the wizard must render every record that will be merged and the merge
 * button must count them — never a "Merge 2 Contacts" button over a hidden
 * cluster-wide merge. These tests pin:
 *  - a 4-record cluster (primary + 3 duplicates) renders all 4 record cards;
 *  - the merge button reads "Merge 4 Contacts" for that cluster;
 *  - the unified-record preview aggregates emails/phones across all records;
 *  - a legacy pair without allRecords still renders both records with the
 *    exact pre-fix copy ("Merge 2 Contacts", "Secondary:" label);
 *  - the merge action is wired to the collision id (source pin);
 *  - page.tsx builds allRecords from the full cluster and dismisses every
 *    (primary, duplicate) pair on "keep separate" (source pins).
 */

const noop = () => {};

function fourRecordCluster(): DedupCollisionPair {
  return {
    id: 'dup-p1',
    recordA: {
      id: 'p1',
      name: 'Priya Sharma',
      sourceLabel: 'Primary',
      company: 'Acme',
      email: 'priya@acme.com',
      phone: null,
    },
    recordB: {
      id: 'd1',
      name: 'Priya S',
      sourceLabel: 'Duplicate',
      company: null,
      email: 'priya.s@gmail.com',
      phone: '+1-555-0100',
    },
    allRecords: [
      {
        id: 'p1',
        name: 'Priya Sharma',
        sourceLabel: 'Primary',
        company: 'Acme',
        email: 'priya@acme.com',
        phone: null,
      },
      {
        id: 'd1',
        name: 'Priya S',
        sourceLabel: 'Duplicate',
        company: null,
        email: 'priya.s@gmail.com',
        phone: '+1-555-0100',
      },
      {
        id: 'd2',
        name: 'P. Sharma',
        sourceLabel: 'Duplicate 3',
        company: 'Acme Labs',
        email: 'psharma@yahoo.com',
        phone: null,
      },
      {
        id: 'd3',
        name: 'Priya Sharma (old)',
        sourceLabel: 'Duplicate 4',
        company: null,
        email: 'priya.old@aol.com',
        phone: null,
      },
    ],
  };
}

function legacyTwoRecordPair(): DedupCollisionPair {
  return {
    id: 'dup-legacy',
    recordA: {
      id: 'a',
      name: 'Jordan Lee',
      sourceLabel: 'Primary',
      company: 'Globex',
      email: 'jordan@globex.com',
      phone: null,
    },
    recordB: {
      id: 'b',
      name: 'Jordan Lee',
      sourceLabel: 'Duplicate',
      company: null,
      email: 'jordan.lee@gmail.com',
      phone: '+1-555-0200',
    },
  };
}

function renderWizard(collisions: DedupCollisionPair[]): string {
  return renderToStaticMarkup(
    <DedupWizardSubView
      isMerged={false}
      collisions={collisions}
      onMerge={noop}
      onKeepSeparate={noop}
      onOpenFullModal={noop}
      onRescan={noop}
    />,
  );
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

const RECORD_CARD_CLASS = 'rounded-xl border border-[#1E2433] bg-black p-3.5 space-y-1.5';

describe('qm-dedup-cluster: wizard renders every record in the merge scope', () => {
  it('renders all 4 record cards for a 4-record cluster', () => {
    const html = renderWizard([fourRecordCluster()]);
    expect(countOccurrences(html, RECORD_CARD_CLASS)).toBe(4);
    expect(countOccurrences(html, '>Primary</span>')).toBe(1);
    expect(countOccurrences(html, '>Duplicate</span>')).toBe(1);
    expect(countOccurrences(html, '>Duplicate 3</span>')).toBe(1);
    expect(countOccurrences(html, '>Duplicate 4</span>')).toBe(1);
  });

  it('merge button counts the whole cluster, not a hardcoded 2', () => {
    const html = renderWizard([fourRecordCluster()]);
    expect(html).toContain('Merge 4 Contacts');
    expect(html, 'hardcoded pre-fix copy must be gone').not.toContain('Merge 2 Contacts');
  });

  it('unified-record preview aggregates emails and phone across all records', () => {
    const html = renderWizard([fourRecordCluster()]);
    expect(html).toContain('Primary: priya@acme.com');
    expect(html).toContain('Secondary: priya.s@gmail.com');
    expect(html).toContain('Duplicate 3: psharma@yahoo.com');
    expect(html).toContain('Duplicate 4: priya.old@aol.com');
    // Primary has no phone: preview falls back to the first duplicate phone,
    // matching the backend merge semantics (primary.phone ?? duplicates.find).
    expect(html).toContain('Phone: +1-555-0100');
    // Primary company is kept.
    expect(html).toContain('Priya Sharma · Acme');
  });
});

describe('qm-dedup-cluster: legacy pair without allRecords keeps exact pre-fix copy', () => {
  it('renders both records with "Merge 2 Contacts" and "Secondary:" label', () => {
    const html = renderWizard([legacyTwoRecordPair()]);
    expect(countOccurrences(html, RECORD_CARD_CLASS)).toBe(2);
    expect(html).toContain('Merge 2 Contacts');
    expect(html).toContain('Secondary: jordan.lee@gmail.com');
    expect(html).toContain('Phone: +1-555-0200');
  });
});

describe('qm-dedup-cluster: merge action wiring (source pins)', () => {
  const subViewsSrc = () =>
    readFileSync(new URL('../app/contacts/components/ContactsSubViews.tsx', import.meta.url), 'utf8');
  const pageSrc = () =>
    readFileSync(new URL('../app/contacts/page.tsx', import.meta.url), 'utf8');

  it('wizard merge button calls onMerge with the collision id', () => {
    expect(subViewsSrc()).toContain('onClick={() => onMerge(collision.id)}');
  });

  it('loadDedupPairs builds allRecords from the full cluster (primary + every duplicate)', () => {
    const src = pageSrc();
    expect(src).toContain('allRecords: [cluster.primaryContact, ...cluster.duplicates]');
  });

  it('keep-separate dismisses every (primary, duplicate) pair in the cluster', () => {
    const src = pageSrc();
    expect(src).toContain('ids.duplicateIds.map((dupId)');
    expect(src).toContain('dismissDuplicatePair(primaryId, duplicateId)');
  });

  it('merge still sends the whole cluster to the backend (scope unchanged)', () => {
    const src = pageSrc();
    expect(src).toContain('apiClient.mergeContacts(ids.primaryId, ids.duplicateIds)');
  });
});
