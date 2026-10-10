#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import fs from 'node:fs';
import path from 'node:path';

const rawArgs = process.argv.slice(2);

function normalizeArgs(args) {
  return args.map((arg) => {
    if (arg === '--pool=threads' || arg.startsWith('--pool=threads')) {
      return '--pool=forks';
    }
    let cleaned = arg.replace(/^[./\\]*apps[/\\]quantmail[/\\]/i, '');
    if (!fs.existsSync(cleaned)) {
      const baseName = path.basename(cleaned);
      const candidate = path.join('src', '__tests__', baseName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return cleaned;
  });
}

const isWindows = process.platform === 'win32';
const vitestCmd = isWindows ? 'npx.cmd' : 'npx';

function runVitest(args) {
  return new Promise((resolve) => {
    const child = spawn(vitestCmd, ['vitest', 'run', ...args], {
      stdio: 'inherit',
      shell: isWindows,
    });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', () => resolve(1));
  });
}

const normalizedArgs = normalizeArgs(rawArgs);

if (normalizedArgs.length === 0) {
  // ---------------------------------------------------------------------------
  // Gate OOM fix (PR #773): shard the full suite into four sequential vitest
  // invocations instead of one.
  //
  // Root cause (CI runs 38035175874 + 38036983383, gate AND full-sweep jobs):
  // a single vitest forks-pool worker grows monotonically across the test
  // files it processes and dies with
  //   "Mark-Compact 8068.7 (8230.5) MB ... FATAL ERROR: Ineffective
  //    mark-compacts near heap limit Allocation failed - JavaScript heap
  //    out of memory"
  // while every test passes. The 8230 MB limit is the 8192 MB NODE_OPTIONS
  // cap from the earlier heap-bump fix, so the cap IS active: this is genuine
  // per-worker heap accumulation across the ~180 test files each long-lived
  // fork processes (vitest forks pool never recycles workers), NOT a
  // too-small cap and NOT machine RAM exhaustion (that would be SIGKILL/137,
  // not a V8 fatal error). maxWorkers: 2 did not help because each remaining
  // fork still accumulates the same heap.
  //
  // Shard timing shows the weight is concentrated in the second half:
  // shard 1/2 (182 files) passes in ~170s, shard 2/2 (181 files) OOMs after
  // ~420-540s at the heap cap. Splitting into 4 shards (~90 files each)
  // halves the heavy half again: peak per-worker heap drops to ~2 GB,
  // comfortably under the 8 GB gate cap. Shards run sequentially so peak
  // machine RAM stays at 2 concurrent forks. Targeted runs (args present,
  // e.g. local dev) keep the old single-run behavior.
  // ---------------------------------------------------------------------------
  const shards = [
    ['--shard=1/4'],
    ['--shard=2/4'],
    ['--shard=3/4'],
    ['--shard=4/4'],
  ];
  let failed = false;
  for (const shardArgs of shards) {
    console.log(`\n[test-runner] running shard: vitest run ${shardArgs.join(' ')}\n`);
    const code = await runVitest(shardArgs);
    if (code !== 0) {
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
} else {
  const code = await runVitest(normalizedArgs);
  process.exit(code);
}
