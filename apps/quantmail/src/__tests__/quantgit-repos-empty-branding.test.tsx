import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QuantGitFeedSubView,
  QuantGitReposSubView,
  QuantGitPrsSubView,
  QuantGitIssuesSubView,
  QuantGitActionsSubView,
} from '../app/quantgit/components/QuantGitSubViews';
import { BrandWordmark, appDisplayName } from '../components/BrandWordmark';

// Regression suite for the 2026-10-22 live-QA finding:
// the QuantGit /quantgit repos empty state rendered wrong-app branding —
// a 'Quant Mail' wordmark with an envelope (Mail) icon — above
// 'No repositories yet', instead of a Sovereign Git branded empty state.
// The live build that produced that screenshot predates the current
// purple-icon empty card on main; these tests lock the correct branding
// in so the defect cannot come back through a future empty-state rewrite,
// and close the one remaining leak vector (BrandWordmark silently falling
// back to Mail for the route-style 'quantgit' app id).

const MAIL_BRANDING = ['Quant Mail', 'QuantMail'];

describe('QuantGit repos empty state branding (Sovereign Git, never Mail)', () => {
  it('renders the Sovereign Git empty state with no Mail branding', () => {
    const html = renderToStaticMarkup(<QuantGitReposSubView />);

    expect(html).toContain('data-testid="quantgit-repos-empty"');
    expect(html).toContain('No repositories yet');
    // Sovereign Git accent on the empty card's icon chip.
    expect(html).toContain('#8B5CF6');
    for (const leak of MAIL_BRANDING) {
      expect(html).not.toContain(leak);
    }
    // The only icon in the empty card is the repo (book) glyph — no
    // envelope/rect mail icon markup may appear in this view.
    expect(html).not.toContain('M3 5.5');
  });

  it('keeps the same guarantee for the filtered-empty state', () => {
    const html = renderToStaticMarkup(
      <QuantGitReposSubView
        repos={[
          {
            id: 'repo-test-1',
            name: 'test-repo-alpha',
            fullName: 'tester/test-repo-alpha',
            description: 'Fixture repo for rendering tests',
            language: 'TypeScript',
            languageColor: '#3178C6',
            stars: 1,
            forks: 0,
            branches: [{ name: 'main', isProtected: false }],
            defaultBranch: 'main',
            isPrivate: false,
            updatedAt: 'now',
          },
        ]}
        searchQuery="zzz-no-match"
      />,
    );

    expect(html).toContain('data-testid="quantgit-repos-empty"');
    for (const leak of MAIL_BRANDING) {
      expect(html).not.toContain(leak);
    }
  });

  it('neighboring QuantGit empty states carry no Mail branding either', () => {
    const views = [
      renderToStaticMarkup(<QuantGitFeedSubView events={[]} />),
      renderToStaticMarkup(<QuantGitPrsSubView prs={[]} />),
      renderToStaticMarkup(<QuantGitIssuesSubView issues={[]} />),
      renderToStaticMarkup(<QuantGitActionsSubView workflows={[]} />),
    ];
    for (const html of views) {
      for (const leak of MAIL_BRANDING) {
        expect(html).not.toContain(leak);
      }
    }
  });
});

describe('BrandWordmark never resolves a QuantGit id to Mail', () => {
  it('maps the route-style "quantgit" id to QuantGit, not Quant Mail', () => {
    expect(appDisplayName('quantgit')).toBe('QuantGit');
    const html = renderToStaticMarkup(<BrandWordmark app="quantgit" />);
    expect(html).toContain('Quant');
    expect(html).toContain('Git');
    expect(html).not.toContain('Mail');
  });

  it('keeps the canonical "code" id resolving to QuantGit', () => {
    expect(appDisplayName('code')).toBe('QuantGit');
  });
});
