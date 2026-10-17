import { describe, it, expect } from 'vitest';
import { INITIAL_REPOS } from '../constants';

// QM-UIUX-068 — the frontend fixture mirrors the backend's dev-seeded repos.
// The repos themselves are legitimate dev fixtures, but their engagement
// numbers must never be fabricated: stars/forks/watching stay at zero and
// only ever move through real Prisma-backed starring/forking/watching.
describe('QM-UIUX-068: seed fixture engagement honesty', () => {
  it('keeps the four dev-fixture repos', () => {
    expect(INITIAL_REPOS.map((r) => r.name)).toEqual([
      'Quant-Ecosystem',
      'quantmail-core',
      'quantchat-meet',
      'quant-mobile-android',
    ]);
  });

  it('carries zero fabricated engagement on every fixture repo', () => {
    for (const repo of INITIAL_REPOS) {
      expect(repo.stars).toBe(0);
      expect(repo.forks).toBe(0);
      expect(repo.watching).toBe(0);
    }
  });
});
