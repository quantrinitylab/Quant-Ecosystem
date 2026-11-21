import { describe, it, expect } from 'vitest';
import { mapBackendPullToPRItem } from '../components/mapBackendPull';

// CODEX fail-closed contract: the review verdict is TRUE | FALSE | NULL
// end-to-end, NULL = UNKNOWN. The page pass-through must preserve null
// verbatim — the pre-fix mapping (`item.reviewRequired === true`) rewrote
// null/unknown as false, destroying the distinction the backend preserves.
// These tests pin the pass-through: true stays true, false stays false,
// null stays null (never false), and absent/non-boolean payloads degrade
// to unknown (null), never to an asserted false.

function backendRow(overrides: Record<string, unknown> = {}) {
  return {
    number: 101,
    title: 'Fix login crash',
    status: 'open',
    author: 'kundan',
    branchSource: 'fix/login-crash',
    branchTarget: 'main',
    checksStatus: 'none',
    commentsCount: 3,
    createdAt: '2026-09-03T00:00:00.000Z',
    body: 'Fixes the crash',
    additions: null,
    deletions: null,
    changedFiles: null,
    ...overrides,
  };
}

describe('mapBackendPullToPRItem review-verdict pass-through', () => {
  it('passes a real true verdict through unchanged', () => {
    expect(mapBackendPullToPRItem(backendRow({ reviewRequired: true })).reviewRequired).toBe(
      true,
    );
  });

  it('passes a real false verdict through unchanged', () => {
    expect(mapBackendPullToPRItem(backendRow({ reviewRequired: false })).reviewRequired).toBe(
      false,
    );
  });

  it('preserves null (unknown) verbatim — never collapsed into false', () => {
    const mapped = mapBackendPullToPRItem(backendRow({ reviewRequired: null }));
    expect(mapped.reviewRequired).toBeNull();
    expect(mapped.reviewRequired).not.toBe(false);
  });

  it('degrades an absent verdict (old payloads) to null (unknown), not false', () => {
    const row = backendRow();
    delete (row as Record<string, unknown>).reviewRequired;
    expect(mapBackendPullToPRItem(row).reviewRequired).toBeNull();
  });

  it('degrades a non-boolean verdict to null (unknown), not false', () => {
    expect(mapBackendPullToPRItem(backendRow({ reviewRequired: 'yes' })).reviewRequired).toBeNull();
    expect(mapBackendPullToPRItem(backendRow({ reviewRequired: 1 })).reviewRequired).toBeNull();
  });

  it('keeps the rest of the row mapping honest after extraction', () => {
    const mapped = mapBackendPullToPRItem(
      backendRow({ status: 'closed', checksStatus: 'bogus', reviewRequired: false }),
    );
    expect(mapped.state).toBe('closed');
    // Unrecognized checksStatus normalizes to 'unknown' (#1071).
    expect(mapped.checksStatus).toBe('unknown');
    expect(mapped.commentsCount).toBe(3);
    expect(mapped.additions).toBeUndefined();
    expect(mapped.reviewRequired).toBe(false);
  });
});
