import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  RepoSidebarMetadata,
  README_PANE_ANCHOR_ID,
  scrollToReadmePane,
} from '../components/RepoSidebarMetadata';

// QM-FIX: the sidebar "Resources" rows ("Readme", "Security policy") were
// styled as clickable (cursor-pointer + hover) but had no onClick/href —
// dead pseudo-links. Now: Readme scrolls to the Code tab's README preview
// pane, Security policy opens the Security tab, and without a security
// handler the row degrades to plain text. Topic pills (also previously
// cursor-pointer with no destination) are plain labels.

const baseProps = {
  repoOwner: 'quantrinitylab',
  repoName: 'some-repo',
  starsCount: 3,
  forksCount: 1,
  watchersCount: 2,
};

const countOccurrences = (html: string, needle: string): number =>
  (html.match(new RegExp(needle, 'g')) || []).length;

describe('RepoSidebarMetadata resources rows are real links, not dead pseudo-links', () => {
  it('renders Readme and Security policy as buttons when a security handler is wired', () => {
    const html = renderToStaticMarkup(
      <RepoSidebarMetadata {...baseProps} onOpenSecurityPolicy={() => {}} />,
    );

    // Star button + Readme button + Security-policy button.
    expect(countOccurrences(html, '<button')).toBe(3);
    expect(html).toContain('📖');
    expect(html).toContain('Readme');
    expect(html).toContain('Security policy');
  });

  it('degrades the Security policy row to plain non-clickable text without a handler', () => {
    const html = renderToStaticMarkup(<RepoSidebarMetadata {...baseProps} />);

    // Star button + Readme button only; no button wrapping Security policy.
    expect(countOccurrences(html, '<button')).toBe(2);
    expect(html).toContain('Security policy');
    // Exactly one cursor-pointer remains (the Readme button).
    expect(countOccurrences(html, 'cursor-pointer')).toBe(1);
  });

  it('topic pills are not styled as clickable links', () => {
    const html = renderToStaticMarkup(
      <RepoSidebarMetadata
        {...baseProps}
        topics={['react', 'typescript']}
        onOpenSecurityPolicy={() => {}}
      />,
    );

    expect(html).toContain('react');
    expect(html).toContain('typescript');
    // Two cursor-pointers only: the Readme and Security policy buttons.
    // (Pills previously carried cursor-pointer with no destination.)
    expect(countOccurrences(html, 'cursor-pointer')).toBe(2);
  });
});

describe('scrollToReadmePane', () => {
  const originalDocument = (globalThis as any).document;

  afterEach(() => {
    if (typeof originalDocument === 'undefined') {
      delete (globalThis as any).document;
    } else {
      (globalThis as any).document = originalDocument;
    }
  });

  it('scrolls to the README preview anchor when the pane exists', () => {
    const scrollIntoView = vi.fn();
    (globalThis as any).document = {
      getElementById: (id: string) =>
        id === README_PANE_ANCHOR_ID ? { scrollIntoView } : null,
    };

    expect(scrollToReadmePane()).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });

  it('returns false when the pane is not on the page', () => {
    (globalThis as any).document = { getElementById: () => null };
    expect(scrollToReadmePane()).toBe(false);
  });

  it('returns false when there is no DOM (SSR-safe)', () => {
    delete (globalThis as any).document;
    expect(scrollToReadmePane()).toBe(false);
  });

  it('exposes a stable anchor id the Code tab can render', () => {
    expect(README_PANE_ANCHOR_ID).toBe('quantgit-readme-pane');
  });
});
