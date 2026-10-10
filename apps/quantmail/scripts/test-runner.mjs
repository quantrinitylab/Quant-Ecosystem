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
  // Gate OOM fix (PR #773) — attempt 8: quarantine the proven killer file.
  //
  // Proven root cause (CI run 38040006760, gate job): ONE test file eats
  // ~8 GB in its own isolated forks worker and dies with
  //   "Mark-Compact 8068.8 (8230.5) MB ... FATAL ERROR: Ineffective
  //    mark-compacts near heap limit Allocation failed - JavaScript heap
  //    out of memory"
  // while every other file passes:
  //   src/__tests__/qm-uiux-093-thread-more-menu-fake-success.test.tsx
  // (the regression test added by THIS PR — renders the real 3488-line
  // ConversationalThreadView + real framer-motion under jsdom).
  // Vitest 4 runs each test file in a FRESH fork (isolate:true default), so
  // cross-file heap accumulation is IMPOSSIBLE: the 1/2/4-shard fixes (and
  // the heap-bump/maxWorkers fixes before them) all targeted a phantom
  // mechanism. Forensics reproduced vitest's exact shard algorithm from its
  // packed source: in the 4-shard run the killer file was the SINGLE
  // uncompleted file in shard 4/4; in the 2-shard run it was the single
  // uncompleted file in 2/2. Worker lifetime ~332s (~10 tests x 30s
  // testTimeout) suggests the tests hang while leaking ~24 MB/s.
  //
  // Fix: exclude the killer file from the sharded invocations and run it as
  // a SEPARATE single-file invocation. Solo it gets the full 8 GB and zero
  // contention, so if the 332s was GC-thrash under contention it may pass;
  // and the reduced testTimeout (60s) makes a true hang fail fast with a
  // clear timeout error instead of OOM-killing the run. If the solo run
  // still OOMs, the leak is unbounded and the file needs a test-code fix
  // (mock framer-motion / split the ConversationalThreadView import) —
  // that goes back to the PR author, not the CI config.
  // ---------------------------------------------------------------------------
  const QUARANTINED_TEST =
    'src/__tests__/qm-uiux-093-thread-more-menu-fake-success.test.tsx';
  const QUARANTINED_TEST_TIMEOUT_MS = 60000;
  const shards = [
    ['--shard=1/4', '--exclude', QUARANTINED_TEST],
    ['--shard=2/4', '--exclude', QUARANTINED_TEST],
    ['--shard=3/4', '--exclude', QUARANTINED_TEST],
    ['--shard=4/4', '--exclude', QUARANTINED_TEST],
  ];
  let failed = false;
  for (const shardArgs of shards) {
    console.log(`\n[test-runner] running shard: vitest run ${shardArgs.join(' ')}\n`);
    const code = await runVitest(shardArgs);
    if (code !== 0) {
      failed = true;
    }
  }
  // Quarantined: the killer file runs solo with a reduced testTimeout so a
  // true hang fails fast (timeout) instead of OOM-killing the gate.
  if (fs.existsSync(QUARANTINED_TEST)) {
    console.log(
      `\n[test-runner] running quarantined file: vitest run ${QUARANTINED_TEST} --testTimeout=${QUARANTINED_TEST_TIMEOUT_MS}\n`,
    );
    const code = await runVitest([
      QUARANTINED_TEST,
      `--testTimeout=${QUARANTINED_TEST_TIMEOUT_MS}`,
    ]);
    if (code !== 0) {
      failed = true;
    }
  } else {
    console.log(
      `\n[test-runner] quarantined file ${QUARANTINED_TEST} not found, skipping\n`,
    );
  }
  process.exit(failed ? 1 : 0);
} else {
  const code = await runVitest(normalizedArgs);
  process.exit(code);
}
