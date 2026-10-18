// @vitest-environment jsdom
// QM-FIX (fix/qm-quantgit-issue-subtitle-2): the Issue Tracker sub-tab
// header carried a fabricated capability claim — a subtitle reading
// "Triage, CalDAV recurrence tracking & session diagnostics". CalDAV
// recurrence is a calendar concept with no issue-tracker wiring and no
// session-diagnostics surface exists anywhere in the Issue Tracker UI;
// "CalDAV" appeared nowhere else in the quantgit tree. The subtitle now
// names only capabilities the view genuinely renders (triage, open/closed
// filtering, issue cards). These tests pin:
//   1. the subtitle no longer mentions CalDAV recurrence tracking or
//      session diagnostics
//   2. the subtitle honestly names the real capabilities (triage,
//      filtering, issue cards)
//   3. the view actually renders those capabilities (filter pills with
//      counts, issue cards, priority radar only for issues with priority
//      data)
//   4. source regression: the fabricated strings are gone from the
//      quantgit tree
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { QuantGitIssuesSubView, type IssueTrackItem } from '../components/QuantGitSubViews';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const authenticatedFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../../services/browser-auth-session', () => ({
  browserAuthSession: { authenticatedFetch: authenticatedFetchMock },
}));

const SAMPLE_ISSUES: IssueTrackItem[] = [
  {
    id: 'iss-1',
    issueNumber: 41,
    title: 'Login stalls on slow networks',
    state: 'open',
    author: 'sahenoor',
    createdAt: '2026-10-16',
    labels: ['auth', 'p1'],
    commentsCount: 7,
  },
  {
    id: 'iss-2',
    issueNumber: 40,
    title: 'Ghost mascot flicker on login',
    priority: 'P1 High',
    priorityColor: '#F59E0B',
    state: 'closed',
    author: 'qa-bot',
    createdAt: '2026-10-15',
    labels: ['ui'],
    commentsCount: 3,
  },
];

function renderIssues(issues: IssueTrackItem[] = []) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(<QuantGitIssuesSubView issues={issues} />);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('QuantGitIssuesSubView — header copy honesty', () => {
  it('renders the title without fabricated capability claims in the subtitle', () => {
    const { container, unmount } = renderIssues(SAMPLE_ISSUES);
    try {
      const view = byTestId(container, 'quantgit-issues-subview');
      const text = view.textContent ?? '';
      expect(text).toContain('Sovereign Issue Tracker');
      expect(text).not.toContain('CalDAV');
      expect(text).not.toContain('recurrence tracking');
      expect(text).not.toContain('session diagnostics');
    } finally {
      unmount();
    }
  });

  it('subtitle names only capabilities the view actually renders', () => {
    const { container, unmount } = renderIssues(SAMPLE_ISSUES);
    try {
      const view = byTestId(container, 'quantgit-issues-subview');
      const text = view.textContent ?? '';
      // The paragraph right under the header hero carries the subtitle.
      expect(text).toContain('Triage, filtering & issue cards');
    } finally {
      unmount();
    }
  });

  it('renders the real capabilities the subtitle advertises', () => {
    const { container, unmount } = renderIssues(SAMPLE_ISSUES);
    try {
      const view = byTestId(container, 'quantgit-issues-subview');
      // Open/closed filter pills with real counts.
      const openPill = byTestId(view as HTMLElement, 'filter-pill-open');
      const closedPill = byTestId(view as HTMLElement, 'filter-pill-closed');
      expect(openPill.textContent).toContain('Open (1)');
      expect(closedPill.textContent).toContain('Closed (1)');
      // Issue cards for the open-filter default.
      expect(view.querySelector('[data-testid="issue-card-41"]')).not.toBeNull();
      expect(view.querySelector('[data-testid="issue-card-40"]')).toBeNull();
      // Switching the filter pill swaps the rendered cards.
      act(() => {
        closedPill.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(view.querySelector('[data-testid="issue-card-41"]')).toBeNull();
      const closedCard = view.querySelector('[data-testid="issue-card-40"]');
      expect(closedCard).not.toBeNull();
      // Priority badge renders only because the issue genuinely carries
      // priority data — the subtitle's "triage" claim is honest, not a prop.
      expect(closedCard!.textContent).toContain('P1 High');
    } finally {
      unmount();
    }
  });

  it('source regression: fabricated subtitle copy is gone from the quantgit tree', () => {
    const treeRoot = path.resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === 'node_modules' || entry === '__tests__') continue;
          walk(full);
        } else if (/\.(tsx?|jsx?)$/.test(entry)) {
          files.push(full);
        }
      }
    };
    walk(treeRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toContain('CalDAV');
      expect(src, file).not.toContain('session diagnostics');
    }
  });
});

function byTestId(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as HTMLElement;
}
