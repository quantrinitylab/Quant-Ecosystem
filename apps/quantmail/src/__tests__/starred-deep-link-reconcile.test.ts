// @vitest-environment node
// ============================================================================
// ?filter=starred deep-link reconcile — regression tests.
//
// Related to the /starred shim fix (/?view=inbox&filter=starred): the classic
// inbox's InboxPageContent applied the Pinned filter chip when the param was
// present but never cleared it when the param disappeared — so navigating
// from /?view=inbox&filter=starred back to a plain /?view=inbox left the Pinned
// filter silently stuck on for the rest of the session.
//
// The reconcile helper (src/lib/starredDeepLink.ts) encodes the decision; the
// component tracks whether the deep link was the applier via a ref so a
// hand-toggled Pinned chip is never wiped by an unrelated param change.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { reconcileStarredFilterParam } from '../lib/starredDeepLink';

describe('reconcileStarredFilterParam', () => {
  it('applies the Pinned chip when the URL says ?filter=starred', () => {
    expect(reconcileStarredFilterParam('starred', false)).toBe('apply');
  });

  it('re-applies (idempotent) when the param is still present', () => {
    expect(reconcileStarredFilterParam('starred', true)).toBe('apply');
  });

  it('clears the chip when the param is gone but the deep link applied it', () => {
    // The stuck-filter regression: leaving /?view=inbox&filter=starred for a
    // plain /?view=inbox must release the Pinned chip.
    expect(reconcileStarredFilterParam(null, true)).toBe('clear');
  });

  it('keeps a manually-set chip when the deep link never applied it', () => {
    // The user toggled the Pinned chip themselves; an unrelated param change
    // (e.g. switching lens tabs) must not wipe it.
    expect(reconcileStarredFilterParam(null, false)).toBe('keep');
  });

  it('ignores unrecognized filter param values', () => {
    expect(reconcileStarredFilterParam('everything', false)).toBe('keep');
    expect(reconcileStarredFilterParam('everything', true)).toBe('clear');
  });

  it('treats the empty string like an absent param', () => {
    expect(reconcileStarredFilterParam('', true)).toBe('clear');
    expect(reconcileStarredFilterParam('', false)).toBe('keep');
  });
});
