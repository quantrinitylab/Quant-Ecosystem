import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import { DedupWizardSubView } from '../app/contacts/components/ContactsSubViews';

/**
 * qm-ai-dupe-claim — honest non-AI labeling regression tests.
 *
 * The contacts duplicate-detection path is pure heuristics
 * (backend ContactService.findDuplicates: exact-email grouping + exact-name
 * with matching phone/company; no LLM/AI anywhere in the path), so the
 * surface must not claim AI. These tests pin:
 *  - the hero header says "Duplicate Contact Cleaner", not "AI Duplicate Contact Cleaner";
 *  - the entry-point labels say "Dedup", not "AI Dedup" (pillar top bar lenses,
 *    desktop context-rail tabs, contacts mobile subview tabs);
 *  - no AI capability claim is rendered or present in the dedup surface source;
 *  - the heuristic detection path is still intact (email + name grouping).
 */

const noop = () => {};

function dedupSourceFiles(): string[] {
  return [
    '../app/contacts/components/ContactsSubViews.tsx',
    '../app/contacts/components/ContactsDedupeModal.tsx',
    '../app/contacts/page.tsx',
    // Shared chrome that also names the dedup entry point:
    '../components/QuantPillarTopBar.tsx',
    '../components/desktopContextTabs.tsx',
  ].map((p) => readFileSync(new URL(p, import.meta.url), 'utf8'));
}

function backendSource(): string {
  return readFileSync(
    new URL('../../backend/services/contact.service.ts', import.meta.url),
    'utf8',
  );
}

const AI_CLAIM_PATTERNS = [
  'AI Duplicate',
  'AI Dedup',
  'AI dedup',
  'AI Cleaner',
  'AI cleaner',
  'AI-powered',
  'AI powered',
  'powered by AI',
  'Powered by AI',
  'Artificial Intelligence',
];

describe('qm-ai-dupe-claim: hero header uses an honest non-AI label', () => {
  it('renders "Duplicate Contact Cleaner" and no AI claim', () => {
    const html = renderToStaticMarkup(
      <DedupWizardSubView
        isMerged={false}
        onMerge={noop}
        onKeepSeparate={noop}
        onOpenFullModal={noop}
        onRescan={noop}
      />,
    );
    expect(html).toContain('Duplicate Contact Cleaner');
    for (const claim of AI_CLAIM_PATTERNS) {
      expect(html, `AI capability claim rendered: ${claim}`).not.toContain(claim);
    }
  });

  it('renders the honest header even when collisions are present', () => {
    const html = renderToStaticMarkup(
      <DedupWizardSubView
        isMerged={false}
        collisions={[
          {
            id: 'col-1',
            recordA: { id: 'a', name: 'Jordan Lee', sourceLabel: 'Primary', email: 'jordan@work.com' },
            recordB: { id: 'b', name: 'Jordan Lee', sourceLabel: 'Duplicate', email: 'jordan@work.com' },
          },
        ]}
        onMerge={noop}
        onKeepSeparate={noop}
        onOpenFullModal={noop}
        onRescan={noop}
      />,
    );
    expect(html).toContain('Duplicate Contact Cleaner');
    expect(html).not.toContain('AI Duplicate');
  });
});

describe('qm-ai-dupe-claim: no invented AI claims in the dedup surface source', () => {
  it('contacts dedup frontend files (incl. shared entry-point labels) carry no AI capability claims', () => {
    for (const src of dedupSourceFiles()) {
      for (const claim of AI_CLAIM_PATTERNS) {
        expect(src, `AI claim in dedup frontend source: ${claim}`).not.toContain(claim);
      }
    }
  });

  it('backend findDuplicates docs make no AI claims', () => {
    const src = backendSource();
    for (const claim of AI_CLAIM_PATTERNS) {
      expect(src, `AI claim in backend contact source: ${claim}`).not.toContain(claim);
    }
  });
});

describe('qm-ai-dupe-claim: heuristic detection behavior unchanged', () => {
  it('findDuplicates still implements email + name heuristics', () => {
    const src = backendSource();
    // 1. Group by email (case-insensitive)
    expect(src).toContain("reason: 'email'");
    // 2. Group by exact Name + same Company or Phone
    expect(src).toContain("reason: 'name'");
    // Explicitly: no AI/LLM wiring in the heuristics path
    const findDuplicatesBody =
      src.slice(src.indexOf('async findDuplicates(userId: string)'));
    expect(findDuplicatesBody).not.toMatch(/\bllm\b|\bopenai\b|\banthropic\b|\bbedrock\b/i);
  });

  it('badge and copy still reflect only real collision data', () => {
    const html = renderToStaticMarkup(
      <DedupWizardSubView
        isMerged={false}
        collisions={[
          {
            id: 'col-1',
            recordA: { id: 'a', name: 'Jordan Lee', sourceLabel: 'Primary' },
            recordB: { id: 'b', name: 'Jordan Lee', sourceLabel: 'Duplicate' },
          },
          {
            id: 'col-2',
            recordA: { id: 'c', name: 'Ava Fox', sourceLabel: 'Primary' },
            recordB: { id: 'd', name: 'Ava Fox', sourceLabel: 'Duplicate' },
          },
        ]}
        onMerge={noop}
        onKeepSeparate={noop}
        onOpenFullModal={noop}
        onRescan={noop}
      />,
    );
    expect(html).toContain('2 Potential Duplicates Detected');
    expect(html).toContain('Review possible duplicate contacts side by side');
  });
});
