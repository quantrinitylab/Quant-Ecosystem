#!/usr/bin/env node
// ============================================================================
// Fake PhotoCraft CLI (C-3B route/adapter tests).
//
// Stands in for the pinned photocraft-cli in fast tests: implements
// --version and the `run <in> --cmd <id> [--params <json>] ... --out <file>`
// shape the adapter builds — writes deterministic "edited" bytes (a PNG
// header + payload marker) to the --out path and echoes one JSON results
// line per --cmd, like the real binary. Behaviour knobs via env:
//   FAKE_PC_EXIT=3        -> exit non-zero (writes nothing)
//   FAKE_PC_NO_OUTPUT=1   -> exit 0 but write NO output file
//   FAKE_PC_SLEEP_MS=5000 -> sleep before answering (timeout tests)
// ============================================================================
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);

if (process.env['FAKE_PC_SLEEP_MS']) {
  const ms = Number(process.env['FAKE_PC_SLEEP_MS']);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

if (args[0] === '--version') {
  process.stdout.write('photocraft-cli 0.17.0 (fake fixture)\n');
  process.exit(0);
}

if (args[0] === 'run') {
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  const exitCode = Number(process.env['FAKE_PC_EXIT'] ?? '0');
  if (exitCode !== 0) {
    process.stderr.write(`fake photocraft failure (exit ${exitCode})\n`);
    process.exit(exitCode);
  }
  const cmdCount = args.filter((a) => a === '--cmd').length;
  for (let i = 0; i < cmdCount; i++) {
    process.stdout.write(`{"status":"ok","fake":true,"index":${i}}\n`);
  }
  if (out && process.env['FAKE_PC_NO_OUTPUT'] !== '1') {
    writeFileSync(out, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('FAKE-PC-EDITED', 'utf8'),
    ]));
  }
  process.exit(0);
}

process.stderr.write(`fake photocraft: unsupported args ${args.join(' ')}\n`);
process.exit(2);
