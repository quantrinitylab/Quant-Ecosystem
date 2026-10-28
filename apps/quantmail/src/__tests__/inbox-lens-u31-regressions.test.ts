// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  normalizeLensParam,
  resolveLensSync,
  mergeInFlightFolders,
  reconcileFolderLens,
  combinedLensKeys,
} from '../lib/inbox-lens';
// The roving arithmetic the page imports from '@quant/shared-ui'
// (re-exported from this file); imported here by relative path so the
// test does not depend on workspace-package resolution.
import { nextRovingIndex } from '../../../../packages/shared-ui/src/utils/roving-focus';

/**
 * U3.1 regressions — CEO deep review 2026-10-28 13:22:54 IST, PR #1719:
 * logic CLEAR, but the PR had NO new regression tests (the tester
 * 15/15 were existing suites). These 4 tests are the merge gate the
 * CEO named; HOW is component-level-or-pure at our choice, WHAT is
 * fixed. Pure-helper pinning is the repo's established precedent for
 * this page (see inbox-nav-selected-target.test.ts): the 4600-line
 * page component cannot be mounted cheaply, so the page delegates to
 * `src/lib/inbox-lens.ts` and these tests pin the helpers the page
 * actually calls.
 */

const PILLS = ['all', 'unread', 'contacts', 'spam'];

describe('U3.1 (1) folder_* lens does not bounce to All', () => {
  it('accepts a folder_* key syntactically, before the folder list loads', () => {
    expect(normalizeLensParam('folder_abc123')).toBe('folder_abc123');
    expect(normalizeLensParam('folder_')).toBe('folder_');
  });

  it('keeps a valid folder lens once the list has loaded', () => {
    const folders = [{ id: 'abc123' }, { id: 'other' }];
    expect(reconcileFolderLens('folder_abc123', true, folders)).toBe('keep');
  });

  it('does NOT bounce a folder lens against an unloaded (possibly empty) list', () => {
    // The pre-U3.1 failure: validating against the empty initial list
    // reset every folder deep link to All. Gating on foldersLoaded is
    // what keeps the deep link alive until the list exists.
    expect(reconcileFolderLens('folder_abc123', false, [])).toBe('keep');
  });

  it('resets only a genuinely unknown folder lens, after load', () => {
    const folders = [{ id: 'other' }];
    expect(reconcileFolderLens('folder_gone', true, folders)).toBe('reset');
  });

  it('leaves non-folder lenses alone in reconciliation', () => {
    expect(reconcileFolderLens('all', true, [])).toBe('keep');
    expect(reconcileFolderLens('spam', true, [])).toBe('keep');
  });
});

describe('U3.1 (2) ?lens=drafts redirects to All', () => {
  it('redirects a leftover ?lens=drafts to the canonical All view', () => {
    expect(resolveLensSync('drafts')).toEqual({ lens: 'all', redirectToAll: true });
  });

  it('does NOT accept drafts as a lens in the normaliser itself', () => {
    // Drafts live at /drafts now; mapping drafts → a lens would keep a
    // dead pill alive instead of redirecting cleanly.
    expect(normalizeLensParam('drafts')).toBe('all');
  });

  it('does NOT redirect garbage lenses — they keep the default→all mapping with the URL untouched', () => {
    expect(resolveLensSync('nonsense')).toEqual({ lens: 'all', redirectToAll: false });
    expect(resolveLensSync(null)).toEqual({ lens: 'all', redirectToAll: false });
  });

  it('passes known lenses through, including the TopBar promos spelling', () => {
    expect(resolveLensSync('spam')).toEqual({ lens: 'spam', redirectToAll: false });
    expect(resolveLensSync('promos')).toEqual({ lens: 'promotions', redirectToAll: false });
    expect(resolveLensSync('folder_abc123')).toEqual({
      lens: 'folder_abc123',
      redirectToAll: false,
    });
  });
});

describe('U3.1 (3) F1 optimistic row survives the load merge', () => {
  it('preserves an in-flight optimistic row the load effect would otherwise overwrite', () => {
    const merged = [{ id: 'saved-1', name: 'Saved' }];
    const inFlight = new Map([
      ['custom_123', { id: 'custom_123', name: 'New folder' }],
    ]);
    const result = mergeInFlightFolders(merged, inFlight.values());
    expect(result.map((f) => f.id)).toEqual(['saved-1', 'custom_123']);
  });

  it('replaces the temp id by the saved id on create success, without duplicating', () => {
    // handleCreateFolder deletes the temp id from the in-flight ref and
    // sets the saved id; a merge finishing after that success must keep
    // the saved row exactly once.
    const merged = [{ id: 'saved-1', name: 'Saved' }];
    const inFlight = new Map([['backend-9', { id: 'backend-9', name: 'New folder' }]]);
    const result = mergeInFlightFolders(merged, inFlight.values());
    expect(result.map((f) => f.id)).toEqual(['saved-1', 'backend-9']);
    expect(result.filter((f) => f.name === 'New folder')).toHaveLength(1);
  });

  it('does not duplicate an in-flight row already present in the merged list', () => {
    const merged = [{ id: 'backend-9', name: 'New folder' }];
    const inFlight = new Map([['backend-9', { id: 'backend-9', name: 'New folder' }]]);
    expect(mergeInFlightFolders(merged, inFlight.values())).toHaveLength(1);
  });

  it('cannot resurrect a folder deleted on another device', () => {
    // The merge takes only (merged, inFlight): a deleted folder that is
    // in neither input cannot appear in the output, and a rolled-back
    // optimistic row (dropped from the in-flight ref on failure) is
    // likewise absent, so reconciliation may reset its lens to All.
    const merged = [{ id: 'saved-1', name: 'Saved' }];
    const result = mergeInFlightFolders(merged, new Map().values());
    expect(result.map((f) => f.id)).toEqual(['saved-1']);
    expect(reconcileFolderLens('folder_deleted-elsewhere', true, result)).toBe('reset');
  });

  it('keeps the lens of a preserved optimistic row after the merge', () => {
    const merged = mergeInFlightFolders(
      [{ id: 'saved-1', name: 'Saved' }],
      new Map([['custom_123', { id: 'custom_123', name: 'New folder' }]]).values(),
    );
    expect(reconcileFolderLens('folder_custom_123', true, merged)).toBe('keep');
  });
});

describe('U3.1 (4) keyboard roving crosses the pill→folder boundary', () => {
  const keys = combinedLensKeys(PILLS, [{ id: 'f1' }, { id: 'f2' }]);

  it('builds one continuous strip: pills followed by visible folder tabs', () => {
    expect(keys).toEqual(['all', 'unread', 'contacts', 'spam', 'folder_f1', 'folder_f2']);
  });

  it('ArrowRight from the last pill lands on the first folder tab', () => {
    const lastPill = PILLS.length - 1;
    expect(nextRovingIndex('ArrowRight', lastPill, keys.length)).toBe(PILLS.length);
    expect(keys[nextRovingIndex('ArrowRight', lastPill, keys.length)!]).toBe('folder_f1');
  });

  it('ArrowLeft from the first folder tab lands back on the last pill', () => {
    const firstFolder = PILLS.length;
    expect(nextRovingIndex('ArrowLeft', firstFolder, keys.length)).toBe(PILLS.length - 1);
    expect(keys[nextRovingIndex('ArrowLeft', firstFolder, keys.length)!]).toBe('spam');
  });

  it('wraps past either end of the combined strip', () => {
    expect(nextRovingIndex('ArrowRight', keys.length - 1, keys.length)).toBe(0);
    expect(nextRovingIndex('ArrowLeft', 0, keys.length)).toBe(keys.length - 1);
  });

  it('Home/End span the whole strip, not just the pills', () => {
    expect(nextRovingIndex('End', 0, keys.length)).toBe(keys.length - 1);
    expect(nextRovingIndex('Home', keys.length - 1, keys.length)).toBe(0);
  });
});
