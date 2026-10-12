// ============================================================================
// QuantAI — dead AgentPerformance component guard (F-168)
//
// F-168 removed the genuinely dead component
// src/components/AgentPerformance.tsx: zero importers repo-wide (verified
// with the F-133 discipline — greps over apps/quantai/src, packages/*/src,
// and every other apps/*/src, plus a dynamic-import and string-reference
// sweep; the only match was the file itself). No page ever mounted it, so
// its fetch never ran — and even mounted it would have 404'd, because it
// called /api/analytics/agents/top, a Next proxy route that never existed.
//
// Deadness was NOT a false positive: unlike F-133 (/api/auth/userinfo, live
// via a shared-ui fetch default), AgentPerformance had no bridge defaults,
// no lazy imports, and no route registrations pointing at it.
//
// This test freezes the deletion: the component file must not come back,
// and no source file may reference it again.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = dirname(fileURLToPath(import.meta.url)); // src/__tests__ -> src
const APP_SRC = join(SRC_DIR, '..');

const REMOVED_COMPONENT = 'components/AgentPerformance.tsx';

function* walkTsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      yield* walkTsFiles(full);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      yield full;
    }
  }
}

describe('F-168: dead AgentPerformance component stays deleted', () => {
  it('has no AgentPerformance component file', () => {
    expect(
      existsSync(join(APP_SRC, REMOVED_COMPONENT)),
      `Dead component must stay deleted (F-168): ${REMOVED_COMPONENT}`,
    ).toBe(false);
  });

  it('has no references to AgentPerformance anywhere in app source', () => {
    const hits: string[] = [];
    for (const file of walkTsFiles(APP_SRC)) {
      if (file.endsWith('.guard.test.ts') || file.endsWith('.guard.test.tsx')) {
        continue; // this guard file itself names the component
      }
      const text = readFileSync(file, 'utf8');
      if (text.includes('AgentPerformance')) {
        hits.push(file.replace(APP_SRC + '/', ''));
      }
    }
    expect(
      hits,
      `No source file may reintroduce the dead AgentPerformance component (F-168):\n${hits
        .map((h) => `  ${h}`)
        .join('\n')}`,
    ).toHaveLength(0);
  });
});
