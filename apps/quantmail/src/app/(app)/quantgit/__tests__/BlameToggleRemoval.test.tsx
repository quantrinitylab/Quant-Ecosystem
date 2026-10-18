import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * QM-BLAME-001 — dead "Blame" toggle purge regression tests.
 *
 * The QuantGit Code viewer used to render a "Blame" toggle button that was a
 * guaranteed-empty promise: no backend blame endpoint exists, so toggling it
 * only ever showed a "Blame unavailable" gutter. The honest fix is to remove
 * the toggle (and its gutter/state plumbing) entirely — never show a control
 * whose only possible outcome is an apology.
 *
 * These tests pin that: no shipped QuantGit source may contain blame UI
 * markers, and the blame state plumbing must be gone from CodeTab.
 */

const QUANTGIT_ROOT = fileURLToPath(new URL('../', import.meta.url));

const DEAD_BLAME_MARKERS = [
  'blame-toggle-button',
  'blame-gutter',
  'Blame unavailable',
  'Toggle git commit blame author annotations',
  'isBlameActive',
  'initialIsBlameActive',
];

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('QM-BLAME-001 blame toggle removal', () => {
  it('no shipped quantgit source contains dead blame UI markers', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(QUANTGIT_ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const marker of DEAD_BLAME_MARKERS) {
        if (source.includes(marker)) {
          offenders.push(`${path.basename(file)}: ${marker}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('CodeTab offers real file history, not a fabricated blame promise', () => {
    const codeTab = readFileSync(
      path.join(QUANTGIT_ROOT, 'components', 'CodeTab.tsx'),
      'utf8',
    );
    // The honest blame-adjacent surface is the real file commit history button.
    expect(codeTab).toContain('data-testid="file-history-button"');
    // And no blame copy may promise what the backend cannot deliver.
    expect(codeTab.toLowerCase()).not.toContain('blame');
  });
});
