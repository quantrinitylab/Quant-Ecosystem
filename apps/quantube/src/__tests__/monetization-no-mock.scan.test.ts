// Locks the monetization dashboard to real data.
//
// The page previously rendered MOCK_EARNINGS / MOCK_TIERS / MOCK_PAYOUT_HISTORY /
// MOCK_REVENUE_DATA / MOCK_SETTINGS behind a `setTimeout` that imitated a network
// call, so every creator saw the same invented income (`adsRevenue: 4523.67`) and
// six bank payouts that never happened. The endpoints it needed were already
// shipped and already proxied.
//
// These assertions run against a comment-and-string-free projection of the source,
// so a `MOCK_` or `setTimeout` mentioned only in prose (including the explanatory
// header on the page itself) cannot pass or fail the scan by accident. Only real
// code counts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Strip comments and string/template literals, preserving newlines. */
function toCodeOnly(src: string): string {
  let out = '';
  let i = 0;
  let state: 'code' | 'line' | 'block' | '"' | "'" | '`' = 'code';
  while (i < src.length) {
    const c = src[i] as string;
    const c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') {
        state = 'line';
        i += 2;
        continue;
      }
      if (c === '/' && c2 === '*') {
        state = 'block';
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        state = c;
        i += 1;
        out += ' ';
        continue;
      }
      out += c;
      i += 1;
      continue;
    }
    if (state === 'line') {
      if (c === '\n') {
        out += '\n';
        state = 'code';
      }
      i += 1;
      continue;
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') {
        state = 'code';
        i += 2;
        continue;
      }
      if (c === '\n') out += '\n';
      i += 1;
      continue;
    }
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === state) {
      state = 'code';
      i += 1;
      continue;
    }
    if (c === '\n') out += '\n';
    i += 1;
  }
  return out;
}

const PAGE = join(__dirname, '..', 'pages', 'monetization.tsx');
const HOOKS = join(__dirname, '..', 'features', 'monetization', 'useMonetization.ts');
const pageCode = toCodeOnly(readFileSync(PAGE, 'utf8'));
const hookSource = readFileSync(HOOKS, 'utf8');

describe('monetization dashboard reads real data', () => {
  it('declares no hardcoded data constant', () => {
    const found = [...pageCode.matchAll(/\b(?:MOCK|SAMPLE|DUMMY|FAKE|DEMO)_[A-Z0-9_]+\b/g)].map(
      (m) => m[0],
    );
    expect(found, `hardcoded data constants in monetization.tsx: ${found.join(', ')}`).toEqual([]);
  });

  it('has no timer-driven data loader', () => {
    // Loading state must come from the query flags, never a simulated delay.
    expect(pageCode).not.toMatch(/setTimeout\s*\(/);
  });

  it('does not inline a fetch — reads through the shared query hooks', () => {
    expect(pageCode).not.toMatch(/\bfetch\s*\(/);
    for (const hook of ['useEarnings', 'usePayoutHistory', 'usePayoutBalance', 'useCreatorTier']) {
      expect(pageCode, `monetization.tsx must call ${hook}`).toContain(hook);
    }
  });

  it('shows no invented growth percentage', () => {
    // The old page hardcoded growth text ("+8.2% this month", "vs previous period")
    // directly in JSX rather than in the mock objects, so deleting the constants
    // alone would have left it on screen.
    //
    // This asserts against the comment-stripped projection, NOT the raw file: JSX
    // text sits between tags rather than inside quotes, so `toCodeOnly` keeps it
    // while dropping prose. Scanning raw source made this test fail on the page's
    // own header comment, which quotes the very string it forbids.
    expect(pageCode).not.toMatch(/[+-]\d+(?:\.\d+)?%\s*this month/i);
    expect(pageCode).not.toMatch(/vs previous period/i);
  });

  it('renders every revenue stream the engine reports, including remix royalties', () => {
    // The old four cards omitted remixRoyalties, so they never summed to the
    // total displayed beside them.
    for (const field of ['adRevenue', 'subscriptions', 'tips', 'iap', 'remixRoyalties']) {
      expect(pageCode, `monetization.tsx must surface earnings.${field}`).toContain(field);
    }
  });
});

describe('monetization hooks target the shipped endpoints', () => {
  it('points at the real proxy paths', () => {
    for (const path of [
      '/api/creator/earnings',
      '/api/creator/tier',
      '/api/payouts',
      '/api/payouts/balance',
    ]) {
      expect(hookSource, `useMonetization must query ${path}`).toContain(path);
    }
  });

  it("mirrors the engine's EarningsBreakdown field names, not the old invented ones", () => {
    for (const field of ['tips', 'iap', 'adRevenue', 'subscriptions', 'remixRoyalties', 'total']) {
      expect(hookSource).toContain(field);
    }
    for (const invented of ['adsRevenue', 'memberships', 'superChats', 'merchShelf', 'percentChange']) {
      expect(
        toCodeOnly(hookSource),
        `useMonetization must not reintroduce the invented field ${invented}`,
      ).not.toContain(invented);
    }
  });
});
