// @vitest-environment jsdom
// ===========================================================================
// "Show all checks" toggle regression test (fix/qm-quantgit-showall-checks).
//
// The button in the PR security box used to be dead: it had no onClick and
// the checks list below it was always rendered, so clicking did nothing.
// These tests drive the REAL component: a click must collapse the list and
// flip the label to "Show all checks", and a second click must restore it.
// The static-markup cases pin the collapsed/expanded renders and the
// no-checks case (no button at all when there is nothing to toggle).
// ===========================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { PullRequestsTab, type SecurityCheckItem } from '../components/PullRequestsTab';
import type { PRItem } from '../types';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MOCK_OPEN_PR: PRItem = {
  id: 201,
  title: 'feat(actions): streaming logs and 3-way merge parity',
  state: 'open',
  author: 'kundansinghrajput31980',
  branchSource: 'feature/live-coding-parity',
  branchTarget: 'main',
  checksStatus: 'passing',
  commentsCount: 2,
  createdAt: '25 minutes ago',
  additions: 45,
  deletions: 12,
  changedFiles: 3,
};

const REAL_CHECKS: SecurityCheckItem[] = [
  { id: 'ci/build', name: 'ci/build', description: 'Build succeeded.', status: 'passed' },
  { id: 'ci/lint', name: 'ci/lint', description: 'Lint running.', status: 'pending' },
];

function baseProps(extra: Record<string, unknown> = {}) {
  return {
    pullSearchQuery: '',
    setPullSearchQuery: vi.fn(),
    filteredPulls: [MOCK_OPEN_PR],
    openPullsCount: 1,
    closedPullsCount: 0,
    initialSelectedPR: MOCK_OPEN_PR,
    ...extra,
  };
}

describe('PullRequestsTab "Show all checks" toggle', () => {
  it('renders the list expanded with a "Hide checks" button by default', () => {
    const html = renderToStaticMarkup(<PullRequestsTab {...baseProps({ checks: REAL_CHECKS })} />);
    expect(html).toContain('data-testid="show-all-checks-btn"');
    expect(html).toContain('Hide checks');
    expect(html).toContain('data-testid="security-ci-checks-list"');
    expect(html).toContain('data-testid="check-ci/build"');
  });

  it('renders collapsed (no list, "Show all checks" label) with initialShowAllChecks=false', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab {...baseProps({ checks: REAL_CHECKS, initialShowAllChecks: false })} />,
    );
    expect(html).toContain('data-testid="show-all-checks-btn"');
    expect(html).toContain('Show all checks');
    expect(html).not.toContain('data-testid="security-ci-checks-list"');
    expect(html).not.toContain('data-testid="check-ci/build"');
    // Collapsing known checks must not leak the "status unknown" paragraph:
    // unknown is only for genuinely missing check data, never for hidden data.
    expect(html).not.toContain('data-testid="security-ci-checks-unknown"');
  });

  it('renders no toggle button for an explicitly empty checks array either', () => {
    // "No check data" means both undefined AND []: activeChecks is [] in both
    // cases, so the button must be absent and the honest unknown state shown.
    const html = renderToStaticMarkup(<PullRequestsTab {...baseProps({ checks: [] })} />);
    expect(html).not.toContain('data-testid="show-all-checks-btn"');
    expect(html).toContain('data-testid="security-ci-checks-unknown"');
  });

  it('renders no toggle button when no check data exists (nothing to toggle)', () => {
    const html = renderToStaticMarkup(<PullRequestsTab {...baseProps({})} />);
    expect(html).not.toContain('data-testid="show-all-checks-btn"');
    expect(html).toContain('data-testid="security-ci-checks-unknown"');
  });

  describe('live click behaviour (jsdom)', () => {
    let root: Root | null = null;
    let container: HTMLDivElement | null = null;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(async () => {
      if (root) {
        await act(async () => {
          root!.unmount();
        });
        root = null;
      }
      container?.remove();
      container = null;
    });

    it('clicking the button collapses the list, clicking again restores it', async () => {
      root = createRoot(container!);
      await act(async () => {
        root!.render(<PullRequestsTab {...baseProps({ checks: REAL_CHECKS })} />);
      });

      const button = () =>
        container!.querySelector('[data-testid="show-all-checks-btn"]') as HTMLElement | null;
      const list = () => container!.querySelector('[data-testid="security-ci-checks-list"]');

      // Starts expanded.
      expect(button()).not.toBeNull();
      expect(button()!.textContent).toContain('Hide checks');
      expect(button()!.getAttribute('aria-expanded')).toBe('true');
      expect(list()).not.toBeNull();

      // First click collapses.
      await act(async () => {
        button()!.click();
      });
      expect(button()!.textContent).toContain('Show all checks');
      expect(button()!.getAttribute('aria-expanded')).toBe('false');
      expect(list()).toBeNull();

      // Second click restores the list.
      await act(async () => {
        button()!.click();
      });
      expect(button()!.textContent).toContain('Hide checks');
      expect(button()!.getAttribute('aria-expanded')).toBe('true');
      expect(list()).not.toBeNull();
    });

    it('is keyboard-operable: a native focusable button, not a div with onClick', async () => {
      // jsdom does not implement browser keyboard activation (Enter/Space
      // dispatching click), and this repo has no user-event dependency, so
      // activation itself cannot be simulated here. What jsdom CAN prove is
      // the precondition keyboard activation rests on: a real <button>
      // (Enter/Space activation + tab focus are platform guarantees for
      // native buttons) that accepts focus, with type="button" so it can
      // never act as a form submit. A div/span swap would fail focus()
      // (no tabindex) and the tagName/type assertions below; the shared
      // onClick handler it would break is covered by the click test above.
      root = createRoot(container!);
      await act(async () => {
        root!.render(<PullRequestsTab {...baseProps({ checks: REAL_CHECKS })} />);
      });
      const button = container!.querySelector(
        '[data-testid="show-all-checks-btn"]',
      ) as HTMLElement | null;
      expect(button).not.toBeNull();
      expect(button!.tagName).toBe('BUTTON');
      expect(button!.getAttribute('type')).toBe('button');
      button!.focus();
      expect(document.activeElement).toBe(button);
    });
  });
});
