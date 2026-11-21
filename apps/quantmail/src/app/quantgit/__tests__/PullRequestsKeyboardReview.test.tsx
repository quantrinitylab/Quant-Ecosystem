import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  resolveReviewShortcut,
  filterDiffFiles,
  computeRangeSelection,
  REVIEW_SHORTCUTS_HELP,
  REVIEW_SHORTCUTS_NOT_YET_AVAILABLE,
} from '../reviewShortcuts';
import { PullRequestsTab } from '../components/PullRequestsTab';
import { PRDiffViewer } from '../components/PRDiffViewer';
import { parseUnifiedDiff } from '../components/prDiffParser';
import type { PRDiffFile, PRItem } from '../types';

// QM-FIX — the PR diff review flow was click-only: PullRequestsTab
// registered zero keydown listeners. These tests pin the keyboard layer:
// the pure key resolver (testable because renderToStaticMarkup never runs
// component effects), the T file filter, Shift+Click range selection, and
// the rendered shortcut affordances. C (per-commit scoping) stays honestly
// "not yet available": no per-commit diff endpoint exists.

const MOCK_PR: PRItem = {
  id: 301,
  title: 'fix: keyboard review flow',
  state: 'open',
  author: 'tester',
  branchSource: 'fix/keyboard-review',
  branchTarget: 'main',
  checksStatus: 'passing',
  commentsCount: 0,
  createdAt: '1 minute ago',
  additions: 3,
  deletions: 1,
  changedFiles: 2,
};

const DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
+const z = 4;
diff --git a/src/util.ts b/src/util.ts
index 3333333..4444444 100644
--- a/src/util.ts
+++ b/src/util.ts
@@ -1 +1 @@
-old
+new
`;

const FILES: PRDiffFile[] = parseUnifiedDiff(DIFF);

describe('resolveReviewShortcut — GitHub review keys on real controls', () => {
  it('maps bare keys: R opens review, I toggles comments, T focuses the file filter, ? toggles help', () => {
    expect(resolveReviewShortcut({ key: 'r' })).toBe('open-review');
    expect(resolveReviewShortcut({ key: 'R' })).toBe('open-review');
    expect(resolveReviewShortcut({ key: 'i' })).toBe('toggle-diff-comments');
    expect(resolveReviewShortcut({ key: 't' })).toBe('focus-file-filter');
    expect(resolveReviewShortcut({ key: '?' })).toBe('toggle-help');
    expect(resolveReviewShortcut({ key: 'Escape' })).toBe('close-review');
  });

  it('never fires single-letter shortcuts while typing in an editable target', () => {
    for (const key of ['r', 'i', 't', '?']) {
      expect(resolveReviewShortcut({ key, targetIsEditable: true })).toBeNull();
    }
    // Escape still closes from inside a textarea.
    expect(resolveReviewShortcut({ key: 'Escape', targetIsEditable: true })).toBe('close-review');
  });

  it('never hijacks modified single keys (browser shortcuts survive)', () => {
    expect(resolveReviewShortcut({ key: 'r', metaKey: true })).toBeNull();
    expect(resolveReviewShortcut({ key: 't', ctrlKey: true })).toBeNull();
    expect(resolveReviewShortcut({ key: 'i', altKey: true })).toBeNull();
    expect(resolveReviewShortcut({ key: 'x' })).toBeNull();
  });

  it('fires Cmd/Ctrl+Enter and Cmd/Ctrl+Shift+Enter inside editable targets', () => {
    expect(
      resolveReviewShortcut({ key: 'Enter', metaKey: true, targetIsEditable: true }),
    ).toBe('submit-review');
    expect(
      resolveReviewShortcut({ key: 'Enter', ctrlKey: true, targetIsEditable: true }),
    ).toBe('submit-review');
    expect(
      resolveReviewShortcut({
        key: 'Enter',
        metaKey: true,
        shiftKey: true,
        targetIsEditable: true,
      }),
    ).toBe('add-pending-comment');
    expect(
      resolveReviewShortcut({
        key: 'Enter',
        ctrlKey: true,
        shiftKey: true,
        targetIsEditable: true,
      }),
    ).toBe('add-pending-comment');
    // Plain Enter inside a textarea is just a newline, never a submit.
    expect(resolveReviewShortcut({ key: 'Enter', targetIsEditable: true })).toBeNull();
  });
});

describe('filterDiffFiles — the T changed-files filter', () => {
  it('returns all files on an empty query and matches substrings case-insensitively', () => {
    expect(filterDiffFiles(FILES, '')).toHaveLength(FILES.length);
    expect(filterDiffFiles(FILES, 'APP')).toHaveLength(1);
    expect(filterDiffFiles(FILES, 'APP')[0].filename).toBe('src/app.ts');
    expect(filterDiffFiles(FILES, 'src/')).toHaveLength(2);
    expect(filterDiffFiles(FILES, 'zzz')).toHaveLength(0);
  });
});

describe('computeRangeSelection — Shift+Click multi-line range select', () => {
  const ordered = ['l1', 'l2', 'l3', 'l4', 'l5'];
  const empty = { anchorId: null, selectedIds: [] as string[] };

  it('plain click anchors on the clicked line', () => {
    expect(computeRangeSelection(ordered, empty, 'l3', false)).toEqual({
      anchorId: 'l3',
      selectedIds: ['l3'],
    });
  });

  it('Shift+Click with an anchor selects the inclusive range in either direction', () => {
    const anchored = { anchorId: 'l2', selectedIds: ['l2'] };
    expect(computeRangeSelection(ordered, anchored, 'l4', true)).toEqual({
      anchorId: 'l2',
      selectedIds: ['l2', 'l3', 'l4'],
    });
    expect(computeRangeSelection(ordered, anchored, 'l1', true)).toEqual({
      anchorId: 'l2',
      selectedIds: ['l1', 'l2'],
    });
  });

  it('Shift+Click without an anchor behaves like a plain click, and clicking the anchor clears', () => {
    expect(computeRangeSelection(ordered, empty, 'l4', true)).toEqual({
      anchorId: 'l4',
      selectedIds: ['l4'],
    });
    expect(
      computeRangeSelection(ordered, { anchorId: 'l2', selectedIds: ['l2'] }, 'l2', false),
    ).toEqual({ anchorId: null, selectedIds: [] });
  });
});

describe('review shortcut help — honest about what exists and what does not', () => {
  it('documents every implemented shortcut and marks C per-commit scoping as unavailable', () => {
    const keys = REVIEW_SHORTCUTS_HELP.map((s) => s.keys);
    expect(keys).toContain('T');
    expect(keys).toContain('I');
    expect(keys).toContain('Shift + Click');
    expect(keys).toContain('R');
    expect(keys).toContain('?');
    expect(keys).toContain('Esc');
    expect(keys).toContain('Cmd/Ctrl + Enter');
    expect(keys).toContain('Cmd/Ctrl + Shift + Enter');
    expect(REVIEW_SHORTCUTS_NOT_YET_AVAILABLE.map((s) => s.keys)).toContain('C');
    expect(REVIEW_SHORTCUTS_NOT_YET_AVAILABLE[0].description).toMatch(/per-commit diff/);
  });

  it('PullRequestsTab detail view exposes the review button with its keyboard hint', () => {
    const html = renderToStaticMarkup(
      <PullRequestsTab
        pullSearchQuery=""
        setPullSearchQuery={vi.fn()}
        filteredPulls={[MOCK_PR]}
        openPullsCount={1}
        closedPullsCount={0}
        initialSelectedPR={MOCK_PR}
      />,
    );
    expect(html).toContain('data-testid="pr-detail-view"');
    expect(html).toContain('data-testid="review-changes-btn"');
    expect(html).toContain('aria-keyshortcuts="r"');
  });
});

describe('PRDiffViewer range selection rendering', () => {
  function baseProps(overrides: Partial<React.ComponentProps<typeof PRDiffViewer>> = {}) {
    return {
      files: FILES,
      activeLineKey: null as string | null,
      lineCommentText: '',
      diffComments: {},
      onOpenLine: vi.fn(),
      onCancelLine: vi.fn(),
      onChangeCommentText: vi.fn(),
      onSubmitComment: vi.fn(),
      ...overrides,
    };
  }

  it('marks only the range-selected lines with data-selected', () => {
    const lineIds = FILES.flatMap((f) => f.hunks.flatMap((h) => h.lines.map((l) => l.id)));
    expect(lineIds.length).toBeGreaterThan(2);
    const selected = lineIds.slice(0, 2);
    const html = renderToStaticMarkup(
      <PRDiffViewer {...baseProps({ selectedLineIds: selected, onLineClick: vi.fn() })} />,
    );
    expect((html.match(/data-selected="true"/g) ?? []).length).toBe(2);
    expect(html).toContain(`data-testid="diff-line-${selected[0]}"`);
  });

  it('renders the open line comment box (the Cmd/Ctrl+Enter submit target)', () => {
    const firstLineId = FILES[0].hunks[0].lines[0].id;
    const html = renderToStaticMarkup(
      <PRDiffViewer {...baseProps({ activeLineKey: firstLineId, lineCommentText: 'nit: ' })} />,
    );
    expect(html).toContain('data-testid="diff-line-comment-input"');
    expect(html).toContain('data-testid="diff-line-comment-submit"');
  });
});
