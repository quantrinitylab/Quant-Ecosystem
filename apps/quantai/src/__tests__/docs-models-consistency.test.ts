/**
 * F-192 guard: product spec docs must stay honest about the model lineup.
 *
 * `docs/quant-architecture/products/quantai/README.md` and `screens/A01-chat.md`
 * previously claimed "7 models" while the code registry
 * (`src/types/models.ts` `AVAILABLE_MODELS`) listed exactly one platform-served
 * model. The code was cleaned in PR #801 but the docs were left behind.
 *
 * These tests fail if a stale multi-model claim re-appears in the touched docs,
 * if the documented model id stops matching the registry, or if the registry
 * grows/shrinks without the docs being updated alongside it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVAILABLE_MODELS } from '../types/models';

// Repo root relative to this file: __tests__ -> src -> apps/quantai -> apps -> root
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

const TOUCHED_DOCS = [
  'docs/quant-architecture/products/quantai/README.md',
  'docs/quant-architecture/products/quantai/screens/A01-chat.md',
];

// Stale claims that must never re-appear: a plural model count presented as
// the product's live lineup, or phrasing that implies multi-model chat.
const STALE_CLAIM_PATTERNS: RegExp[] = [
  /\b[2-9]\d*\s+models?\b/i, // "7 models", "2 model" ...
  /\bseven\s+models?\b/i,
  /\bmultiple\s+(ai\s+)?models?\b/i,
  /\bacross\s+[a-z0-9-]+\s+models?\b/i, // "across 7 models", "across several models"
  /\bchat\s+with\s+[a-z0-9-]+\s+models?\b/i, // "chat with 7 models"
  /\bmulti-model\b/i,
];

describe('F-192: docs model-lineup consistency', () => {
  let docsText: string;

  beforeAll(() => {
    for (const rel of TOUCHED_DOCS) {
      const abs = path.join(REPO_ROOT, rel);
      expect(
        fs.existsSync(abs),
        `spec doc must exist so the guard can read it: ${rel}`,
      ).toBe(true);
    }
    docsText = TOUCHED_DOCS.map((rel) =>
      fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'),
    ).join('\n');
  });

  it('touched docs contain no stale multi-model claim', () => {
    for (const pattern of STALE_CLAIM_PATTERNS) {
      expect(
        docsText,
        `stale multi-model claim matching ${pattern} found in spec docs`,
      ).not.toMatch(pattern);
    }
  });

  it('documented model id matches the code registry', () => {
    // Every registry model must be named in the docs; the docs anchor to the
    // single source of truth (src/types/models.ts AVAILABLE_MODELS).
    for (const model of AVAILABLE_MODELS) {
      expect(
        docsText.toLowerCase(),
        `registry model id "${model.id}" missing from spec docs`,
      ).toContain(model.id.toLowerCase());
    }
    expect(docsText).toContain('types/models.ts');
  });

  it('registry size matches the documented single-model claim', () => {
    // The spec docs state exactly ONE platform-served model (Quant-1).
    // If the registry changes (a new platform model ships, or Quant-1 is
    // replaced), this fails on purpose — update the docs in the same change.
    const singleModelMentions = /(single|one)\s+(native|platform-served)\s+model/i;
    expect(
      docsText,
      'spec docs must state the one-model reality',
    ).toMatch(singleModelMentions);
    expect(
      AVAILABLE_MODELS.length,
      'registry model count drifted; update the spec docs in the same change',
    ).toBe(1);
  });

  it('edge case: every registry model still has the documented default', () => {
    const defaults = AVAILABLE_MODELS.filter((m) => m.isDefault);
    expect(defaults.length).toBe(1);
    expect(defaults[0].id).toBe('quant-1');
  });
});
