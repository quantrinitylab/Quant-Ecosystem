import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * qm-contacts-list-thread-counts — list thread-count badges removed.
 *
 * The contacts list badges derived from the first inbox page only
 * (useInbox() with no options), so the counts systematically understated
 * real thread totals — a fake-looking number, not an honest one. The P1
 * QM-SCREEN-012 fix gave the detail sheet a real bidirectional search; the
 * list badges kept the stale source (PR #939 only relabeled them).
 *
 * This suite pins the removal:
 *  - page.tsx no longer imports or calls useInbox (the first-page-only source);
 *  - no thread-count aggregation machinery remains in the list surface;
 *  - no "recent mail" badge markup survives;
 *  - the honest rationale is documented in-source;
 *  - the detail sheet's real bidirectional search (contactThreadSearchParams)
 *    is still intact — that is where honest per-contact counts live.
 */

function pageSource(): string {
  return readFileSync(new URL('../app/contacts/page.tsx', import.meta.url), 'utf8');
}

function subViewsSource(): string {
  return readFileSync(
    new URL('../app/contacts/components/ContactsSubViews.tsx', import.meta.url),
    'utf8',
  );
}

describe('contacts list: first-page thread-count badges are gone', () => {
  it('does not import or call useInbox', () => {
    const src = pageSource();
    expect(src).not.toContain("from '../../hooks/useInbox'");
    expect(src).not.toContain('useInbox()');
  });

  it('has no thread-count aggregation machinery', () => {
    const src = pageSource();
    for (const token of ['threadCounts', 'threadCountFor', 'recentMail']) {
      expect(src, `stale thread-count token still present: ${token}`).not.toContain(token);
    }
  });

  it('renders no "recent mail" badge markup', () => {
    const src = pageSource();
    expect(src).not.toContain('in recent mail');
    expect(src).not.toContain('threads in recent mail');
  });

  it('documents the honest removal rationale in-source', () => {
    const src = pageSource();
    expect(src).toContain('List thread-count badges removed');
    expect(src).toContain('contactThreadSearchParams');
  });

  it('the detail sheet keeps the real bidirectional search', () => {
    const src = subViewsSource();
    expect(src).toContain('contactThreadSearchParams');
    expect(src).toContain('from: contactEmailLower');
    expect(src).toContain('to: contactEmailLower');
  });
});
