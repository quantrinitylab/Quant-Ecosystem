// ============================================================================
// QuantAI — dead /training route guard (F-154)
//
// F-154 removed genuinely dead training surface: src/pages/training.tsx
// (rendered null unconditionally at live URL /training, zero in-app links),
// the Next proxy routes /api/training and /api/training/[id] (zero fetch
// callers; only the dead apiClient methods referenced them), the dead
// apiClient methods startTraining/listTrainingJobs/cancelTraining, and the
// orphaned TrainingJob/TrainingStatus types. Deadness was verified with
// repo-wide greps (apps/quantai/src + packages/*), a shared-ui
// bridge-default trace (no training URL defaults), and a sitemap/nav grep
// before deletion — the F-133 false-positive lesson.
//
// This test freezes the deletion: the artifacts must not come back.
// The null-stub sweep also fails if ANY page under src/pages/ becomes a
// null-rendering stub (a page whose component returns null with zero JSX
// output), the exact class F-154 deleted.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = dirname(fileURLToPath(import.meta.url)); // src/__tests__ -> src
const APP_SRC = join(SRC_DIR, '..');

const REMOVED_TRAINING_ARTIFACTS = [
  'pages/training.tsx',
  'app/api/training/route.ts',
  'app/api/training/[id]/route.ts',
];

const REMOVED_TRAINING_API_METHODS = [
  'startTraining',
  'listTrainingJobs',
  'cancelTraining',
];

const PAGES_DIR = join(APP_SRC, 'pages');

describe('F-154: dead /training route stays deleted', () => {
  it('has no training page stub or /api/training proxy routes', () => {
    const present = REMOVED_TRAINING_ARTIFACTS.filter((rel) =>
      existsSync(join(APP_SRC, rel)),
    );
    expect(
      present,
      `Dead training artifacts must stay deleted (F-154):\n${present
        .map((p) => `  ${p}`)
        .join('\n')}`,
    ).toHaveLength(0);
  });

  it('has no dead training methods on the apiClient', () => {
    const client = readFileSync(
      join(APP_SRC, 'services', 'api-client.ts'),
      'utf8',
    );
    const found = REMOVED_TRAINING_API_METHODS.filter((m) =>
      new RegExp(`\\b${m}\\b`).test(client),
    );
    expect(
      found,
      `Dead apiClient training methods must not return (F-154): ${found.join(', ')}`,
    ).toHaveLength(0);
  });

  it('has no orphaned TrainingJob / TrainingStatus types', () => {
    const types = readFileSync(join(APP_SRC, 'types', 'index.ts'), 'utf8');
    expect(types, 'TrainingJob must stay deleted').not.toMatch(
      /interface TrainingJob\b/,
    );
    expect(types, 'TrainingStatus must stay deleted').not.toMatch(
      /type TrainingStatus\b/,
    );
  });
});

describe('F-154 improvement: no null-rendering stub pages', () => {
  it('every page under src/pages renders real JSX (no unconditional null stubs)', () => {
    const stubs: string[] = [];
    for (const entry of readdirSync(PAGES_DIR)) {
      if (!entry.endsWith('.tsx')) continue;
      const content = readFileSync(join(PAGES_DIR, entry), 'utf8');
      const nullReturns = (content.match(/return\s+null\s*;/g) ?? []).length;
      const jsxReturns = (
        content.match(/return\s*[\(\s]*</g) ?? []
      ).length;
      // A live page may return null conditionally (e.g. `if (!x) return null;`)
      // but must render JSX somewhere. A null-only component is a dead stub.
      if (nullReturns > 0 && jsxReturns === 0) {
        stubs.push(entry);
      }
    }
    expect(
      stubs,
      `Null-rendering stub pages at live URLs are not allowed (F-154):\n${stubs
        .map((s) => `  pages/${s}`)
        .join('\n')}`,
    ).toHaveLength(0);
  });
});
