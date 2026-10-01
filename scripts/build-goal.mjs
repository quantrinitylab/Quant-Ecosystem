#!/usr/bin/env node
// Assembles GOAL.md from the ordered parts in docs/goal/_parts/.
// Edit the parts, then run:  node scripts/build-goal.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const partsDir = join(root, 'docs', 'goal', '_parts');

// Explicit order — do not rely on glob sorting.
const ORDER = [
  '_00-header.md',
  '_01-frame.md',
  'cross-cutting.md',
  '_50-apps-divider.md',
  'hub-ads.md',
  'social.md',
  'media-ai.md',
  '_90-closing.md',
];

const missing = ORDER.filter((f) => !existsSync(join(partsDir, f)));
if (missing.length) {
  console.error(`Missing part(s), aborting: ${missing.join(', ')}`);
  process.exit(1);
}

// Guard the other direction too: a part that exists on disk but isn't wired
// into ORDER would be silently dropped from GOAL.md. Fail loudly so a new part
// can't go missing just because someone forgot to add it here.
const extra = readdirSync(partsDir)
  .filter((f) => f.endsWith('.md'))
  .filter((f) => !ORDER.includes(f));
if (extra.length) {
  console.error(`Part(s) present but not in ORDER (add to build-goal.mjs or delete): ${extra.join(', ')}`);
  process.exit(1);
}

const body = ORDER.map((f) => readFileSync(join(partsDir, f), 'utf8').trim()).join('\n\n');
writeFileSync(join(root, 'GOAL.md'), body + '\n', 'utf8');

const lines = body.split('\n').length;
console.log(`GOAL.md written (${lines} lines) from ${ORDER.length} parts.`);
