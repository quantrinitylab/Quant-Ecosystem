// @vitest-environment node
/**
 * QM-EMAIL-BOTTOM-BAR-DEAD-CODE — EmailBottomBar.tsx stays deleted.
 *
 * Findings-queue 2026-10-11 [P2] [mobile-nav]: EmailBottomBar.tsx (a
 * thread-read reply/forward/reaction bottom bar) had zero importers anywhere
 * in the repo — only its own definition sites — yet shipped lock-violating
 * styles that would have gone live the moment anyone wired it in: raw
 * Unicode emoji reactions (against the strictly-ZERO-raw-Unicode-emojis
 * rule), a border-t divider line (against the pure-black/no-divider-lines
 * lock), bg-black/95 (not pure black), and a blue-gradient Reply button on
 * the Mail surface (Mail-orange is the locked accent).
 *
 * The thread view does NOT need a replacement: ConversationalThreadView
 * already renders its own live quick-reply bar plus menu Reply/Forward, so
 * resurrecting this component would duplicate reply/forward actions in a
 * second bottom bar. Removal, not a lock-compliant rewrite, is the fix.
 *
 * Regression contract:
 *  1. The component file does not exist.
 *  2. No source file outside __tests__ imports or references EmailBottomBar
 *     (so a re-add can never silently become a live import again).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPONENT_PATH = fileURLToPath(
  new URL('../components/EmailBottomBar.tsx', import.meta.url),
);
// src/ itself: the parent of this file's __tests__/ directory.
const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('EmailBottomBar dead-code removal', () => {
  it('the component file does not exist', () => {
    expect(fs.existsSync(COMPONENT_PATH)).toBe(false);
  });

  it('no source file references EmailBottomBar', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC_DIR)) {
      if (fs.readFileSync(file, 'utf8').includes('EmailBottomBar')) {
        offenders.push(path.relative(SRC_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
