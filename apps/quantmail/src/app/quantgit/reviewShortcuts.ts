// ============================================================================
// QuantGit — keyboard review flow (PR detail view)
// ----------------------------------------------------------------------------
// GitHub's Files-changed review shortcuts, mapped onto the controls that
// actually exist in PullRequestsTab's PR detail view:
//
//   T                 open + focus the changed-files filter input
//   I                 toggle diff-comment visibility in the diff viewer
//   Shift + Click     select a contiguous range of diff lines (visual
//                     review-scope selection; the backend comment endpoint
//                     takes a single line, so a range comment still posts
//                     to the clicked line — see the help panel note)
//   ?                 toggle this shortcut help panel
//   Esc               close the review box / shortcut help
//   Cmd/Ctrl + Enter  submit the review from its comment box, or submit
//                     the open inline line comment from its box
//   Cmd/Ctrl + Shift + Enter  add the review comment box text as a pending
//                     review comment (published together with the review
//                     body when the review is submitted)
//
// Deliberately NOT claimed: GitHub's C (commits dropdown scoping the diff
// per commit). No per-commit diff endpoint exists — the diff endpoint only
// serves `git diff -p base..head` — so scoping per commit would need new
// backend work. It is listed as "Not yet available" in the help panel and
// tracked as a follow-up finding instead of being wired to nothing.
//
// This module is pure (no DOM access) so it can be unit-tested under the
// repo's renderToStaticMarkup convention, where component effects never run.
// PullRequestsTab / PRDiffViewer wire it to real keydown listeners.
// ============================================================================

export type ReviewShortcutAction =
  | 'open-review'
  | 'toggle-diff-comments'
  | 'focus-file-filter'
  | 'toggle-help'
  | 'close-review'
  | 'submit-review'
  | 'add-pending-comment';

export interface ReviewKeyEvent {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  /** True when focus is inside an input, textarea, or contentEditable. */
  targetIsEditable?: boolean;
}

/**
 * Resolve a key event to a review-flow action, or null when the key is not
 * a review shortcut (including ordinary typing). Rules:
 * - Single-letter shortcuts never fire while typing in an editable target,
 *   and never fire with a modifier held (so browser shortcuts survive).
 * - Cmd/Ctrl+Enter and Cmd/Ctrl+Shift+Enter DO fire inside editable
 *   targets — that is their whole purpose (GitHub standalone vs pending
 *   review comment submission).
 * - Escape always closes, from editable targets too.
 */
export function resolveReviewShortcut(e: ReviewKeyEvent): ReviewShortcutAction | null {
  const cmdOrCtrl = Boolean(e.metaKey || e.ctrlKey);

  if (e.key === 'Escape' && !cmdOrCtrl && !e.altKey) return 'close-review';

  // Enter combos: the only shortcuts that fire inside editable targets.
  if (e.key === 'Enter' && cmdOrCtrl && !e.altKey) {
    return e.shiftKey ? 'add-pending-comment' : 'submit-review';
  }

  // Everything below is a bare single key: typing and modified keys are out.
  if (e.targetIsEditable || e.metaKey || e.ctrlKey || e.altKey) return null;

  switch (e.key.toLowerCase()) {
    case 'r':
      return 'open-review';
    case 'i':
      return 'toggle-diff-comments';
    case 't':
      return 'focus-file-filter';
    case '?':
      return 'toggle-help';
    default:
      return null;
  }
}

/** Case-insensitive substring filter over changed-file names (the T filter). */
export function filterDiffFiles<T extends { filename: string }>(
  files: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return files;
  return files.filter((f) => f.filename.toLowerCase().includes(q));
}

export interface RangeSelection {
  anchorId: string | null;
  selectedIds: string[];
}

/**
 * Shift+Click multi-line range select over the diff's ordered line ids.
 * Plain click anchors on the clicked line; Shift+Click with an existing
 * anchor selects the inclusive range between anchor and clicked line;
 * Shift+Click without an anchor behaves like a plain click. Clicking the
 * anchor itself clears the selection (toggle-off).
 */
export function computeRangeSelection(
  orderedLineIds: string[],
  previous: RangeSelection,
  clickedId: string,
  shiftKey: boolean,
): RangeSelection {
  if (previous.anchorId === clickedId && !shiftKey) {
    return { anchorId: null, selectedIds: [] };
  }
  if (shiftKey && previous.anchorId && previous.anchorId !== clickedId) {
    const anchorIdx = orderedLineIds.indexOf(previous.anchorId);
    const clickedIdx = orderedLineIds.indexOf(clickedId);
    if (anchorIdx !== -1 && clickedIdx !== -1) {
      const [from, to] = anchorIdx < clickedIdx ? [anchorIdx, clickedIdx] : [clickedIdx, anchorIdx];
      return { anchorId: previous.anchorId, selectedIds: orderedLineIds.slice(from, to + 1) };
    }
  }
  return { anchorId: clickedId, selectedIds: [clickedId] };
}

/** Help-panel rows: the shortcuts this view actually implements. */
export const REVIEW_SHORTCUTS_HELP: { keys: string; description: string }[] = [
  { keys: 'T', description: 'Open the changed-files filter and focus it' },
  { keys: 'I', description: 'Show / hide diff comments in the diff viewer' },
  { keys: 'Shift + Click', description: 'Select a range of diff lines to review' },
  { keys: 'R', description: 'Open Review changes and focus the comment box' },
  { keys: '?', description: 'Show / hide this keyboard shortcut help' },
  { keys: 'Esc', description: 'Close the review box / shortcut help' },
  { keys: 'Cmd/Ctrl + Enter', description: 'Submit the review or the open line comment' },
  {
    keys: 'Cmd/Ctrl + Shift + Enter',
    description: 'Add the review comment box text as a pending review comment',
  },
];

/**
 * Shortcuts GitHub offers but this view honestly cannot yet: they need
 * backend work (a per-commit diff endpoint). Listed in the help panel so
 * the gap stays visible, not hidden.
 */
export const REVIEW_SHORTCUTS_NOT_YET_AVAILABLE: { keys: string; description: string }[] = [
  {
    keys: 'C',
    description: 'Scope the diff per commit — needs a per-commit diff endpoint',
  },
];
