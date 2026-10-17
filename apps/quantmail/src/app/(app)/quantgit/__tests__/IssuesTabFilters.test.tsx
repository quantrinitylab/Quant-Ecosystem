// @vitest-environment jsdom
// QM-FIX (fix/qm-issues-filters): the IssuesTab filter dropdowns
// (Author/Label/Projects/Milestones/Assignee/Sort) were native alert() stubs —
// clicking them did nothing real. They are now:
//   - Author / Label / Assignee: real client-side filters over the issue list
//   - Sort: real ordering (Newest/Oldest/Most commented/Least commented)
//   - Projects / Milestones: HONEST disabled buttons (IssueItem carries no
//     project/milestone field, so no fake options are offered)
// These tests pin that behavior and that no alert() stub remains.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IssuesTab } from '../components/IssuesTab';
import type { IssueItem } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const issues: IssueItem[] = [
  {
    id: 1,
    title: 'Oldest bug',
    state: 'open',
    author: 'alice',
    labels: [{ name: 'bug', color: '#D73A4A' }],
    commentsCount: 1,
    createdAt: '5 days ago',
    assignee: 'bob',
  },
  {
    id: 2,
    title: 'Feature request',
    state: 'open',
    author: 'bob',
    labels: [{ name: 'enhancement', color: '#A2EEEF' }],
    commentsCount: 9,
    createdAt: '3 days ago',
    // no assignee — the "Unassigned" case
  },
  {
    id: 3,
    title: 'Newest bug',
    state: 'open',
    author: 'alice',
    labels: [
      { name: 'bug', color: '#D73A4A' },
      { name: 'urgent', color: '#B60205' },
    ],
    commentsCount: 4,
    createdAt: '1 day ago',
    assignee: 'carol',
  },
];

const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    issueSearchQuery: '',
    setIssueSearchQuery: vi.fn(),
    filteredIssues: issues,
    allIssues: issues,
    openIssuesCount: 3,
    closedIssuesCount: 0,
    setModalState: vi.fn(),
    openIssueDetail: vi.fn(),
    handleToggleIssue: vi.fn(),
    onCreateIssue: vi.fn().mockResolvedValue({ ok: true }),
    onPostIssueComment: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

function renderTab(props: Record<string, unknown>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(<IssuesTab {...(props as never)} />);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
}

function byTestId(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as HTMLElement;
}

function rowIds(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll('[data-testid^="issue-row-"]')).map(
    (el) => Number((el.getAttribute('data-testid') || '').replace('issue-row-', '')),
  );
}

function openMenu(container: HTMLElement, menuId: string) {
  click(byTestId(container, menuId));
}

function pickOption(container: HTMLElement, menuId: string, optionTestId: string) {
  openMenu(container, menuId);
  click(byTestId(container, optionTestId));
}

afterEach(() => {
  alertSpy.mockClear();
});

describe('IssuesTab real filter dropdowns (no alert stubs)', () => {
  it('the filter alert() stub is gone from the component source', () => {
    const src = readFileSync(
      path.resolve(process.cwd(), 'src/app/quantgit/components/IssuesTab.tsx'),
      'utf8',
    );
    expect(src).not.toContain('Filter by ${flt}');
    // Behavioral coverage (alertSpy below) proves no native dialog fires during
    // real filter interactions; a bare 'alert(' substring check is too blunt
    // here because the explanatory comments above name the old stub pattern.
  });

  it('renders all filter controls and never calls alert() when they are used', () => {
    const { container, unmount } = renderTab(baseProps());
    for (const id of [
      'issue-filter-author',
      'issue-filter-label',
      'issue-filter-projects',
      'issue-filter-milestones',
      'issue-filter-assignee',
      'issue-filter-sort',
    ]) {
      expect(container.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
    }
    pickOption(container, 'issue-filter-author', 'issue-filter-author-option-alice');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(rowIds(container)).toEqual([3, 1]); // newest-first within alice's issues
    unmount();
  });

  it('author filter shows only that author\u2019s issues, clear restores the full list', () => {
    const { container, unmount } = renderTab(baseProps());
    pickOption(container, 'issue-filter-author', 'issue-filter-author-option-bob');
    expect(rowIds(container)).toEqual([2]);
    // Active filter is reflected on the button label.
    expect(byTestId(container, 'issue-filter-author').textContent).toContain('bob');
    click(byTestId(container, 'issue-filters-clear'));
    expect(rowIds(container)).toEqual([3, 2, 1]);
    unmount();
  });

  it('label filter shows only issues carrying that label', () => {
    const { container, unmount } = renderTab(baseProps());
    pickOption(container, 'issue-filter-label', 'issue-filter-label-option-urgent');
    expect(rowIds(container)).toEqual([3]);
    click(byTestId(container, 'issue-filters-clear'));
    pickOption(container, 'issue-filter-label', 'issue-filter-label-option-bug');
    expect(rowIds(container)).toEqual([3, 1]);
    unmount();
  });

  it('assignee filter offers real assignees plus an honest Unassigned option', () => {
    const { container, unmount } = renderTab(baseProps());
    openMenu(container, 'issue-filter-assignee');
    // Real assignees derived from the data.
    expect(byTestId(container, 'issue-filter-assignee-option-bob')).not.toBeNull();
    expect(byTestId(container, 'issue-filter-assignee-option-carol')).not.toBeNull();
    expect(byTestId(container, 'issue-filter-assignee-option-__unassigned__')).not.toBeNull();
    unmount();

    const second = renderTab(baseProps());
    pickOption(second.container, 'issue-filter-assignee', 'issue-filter-assignee-option-__unassigned__');
    expect(rowIds(second.container)).toEqual([2]);
    second.unmount();
  });

  it('sort dropdown really reorders the list', () => {
    const { container, unmount } = renderTab(baseProps());
    // Default: newest first.
    expect(rowIds(container)).toEqual([3, 2, 1]);
    pickOption(container, 'issue-filter-sort', 'issue-filter-sort-option-oldest');
    expect(rowIds(container)).toEqual([1, 2, 3]);
    pickOption(container, 'issue-filter-sort', 'issue-filter-sort-option-most-commented');
    expect(rowIds(container)).toEqual([2, 3, 1]);
    pickOption(container, 'issue-filter-sort', 'issue-filter-sort-option-least-commented');
    expect(rowIds(container)).toEqual([1, 3, 2]);
    unmount();
  });

  it('projects/milestones are honest disabled states — clickable does nothing, no alert', () => {
    const { container, unmount } = renderTab(baseProps());
    for (const id of ['issue-filter-projects', 'issue-filter-milestones']) {
      const btn = byTestId(container, id) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('title')).toMatch(/unavailable/i);
      click(btn);
    }
    expect(alertSpy).not.toHaveBeenCalled();
    // List untouched by the disabled buttons.
    expect(rowIds(container)).toEqual([3, 2, 1]);
    unmount();
  });

  it('empty state names the filters when they exclude everything', () => {
    const { container, unmount } = renderTab(baseProps());
    // alice has no "enhancement"-labeled issue... combine alice + enhancement.
    pickOption(container, 'issue-filter-author', 'issue-filter-author-option-alice');
    pickOption(container, 'issue-filter-label', 'issue-filter-label-option-enhancement');
    expect(rowIds(container)).toEqual([]);
    const empty = byTestId(container, 'issue-list-empty');
    expect(empty.textContent).toMatch(/current filters/i);
    unmount();
  });

  it('filter menus offer options derived from allIssues, not just the filtered list', () => {
    const onlyAlices = issues.filter((i) => i.author === 'alice');
    const { container, unmount } = renderTab(
      baseProps({ filteredIssues: onlyAlices, allIssues: issues }),
    );
    // Row list is alice-only…
    expect(rowIds(container)).toEqual([3, 1]);
    // …but the author menu still offers bob (from allIssues), so the user can
    // switch authors without clearing the parent search first.
    openMenu(container, 'issue-filter-author');
    expect(byTestId(container, 'issue-filter-author-option-bob')).not.toBeNull();
    unmount();
  });
});
