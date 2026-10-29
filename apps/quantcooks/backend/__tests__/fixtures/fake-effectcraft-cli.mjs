#!/usr/bin/env node
// Fake EffectCraft CLI for C-2 tests — a committed fixture, NOT the real
// binary. It mimics the real CLI's verified surface (spike report §3):
//   effectcraft-cli --project F.ecproj render --comp C --out FILE --progress
// printing the spike's captured stderr lines (header, `progress d t e eta`
// lines, `done: Comp → /path in Ns`) and writing output bytes (an MP4 ftyp
// box + payload) to --out.
//
// Behaviour knobs via env (test-controlled):
//   FAKE_EC_EXIT=<n>       exit with code n (after printing a failure line)
//   FAKE_EC_NO_OUTPUT=1    exit 0 but write no output file (RENDER_NO_OUTPUT)
//   FAKE_EC_SLEEP_MS=<n>   sleep before rendering (timeout tests)
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);

if (args.includes('--version')) {
  process.stdout.write('effectcraft-cli 0.18.0\n');
  process.exit(0);
}

const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : null;
const compIdx = args.indexOf('--comp');
const comp = compIdx >= 0 ? args[compIdx + 1] : 'Composition';

const sleepMs = Number(process.env.FAKE_EC_SLEEP_MS ?? 0);
if (sleepMs > 0) {
  const end = Date.now() + sleepMs;
  while (Date.now() < end) {
    // Busy-wait: keeps the fixture dependency-free and signal-responsive
    // enough for the runner's SIGTERM path.
  }
}

process.stderr.write('EffectCraft render\n');
process.stderr.write(`Comp: ${comp}\n`);
process.stderr.write('progress 15 30 0.55 0.55\n');
process.stderr.write('progress 24 30 0.8 0.2\n');
process.stderr.write('progress 30 30 1.05 -\n');

const exitCode = Number(process.env.FAKE_EC_EXIT ?? 0);
if (exitCode !== 0) {
  process.stderr.write('error: simulated render failure\n');
  process.exit(exitCode);
}

if (process.env.FAKE_EC_NO_OUTPUT !== '1' && out) {
  // Minimal MP4-looking payload: size + 'ftyp' box type at bytes 4..8.
  const header = Buffer.alloc(12);
  header.writeUInt32BE(24, 0);
  header.write('ftyp', 4, 'ascii');
  header.write('isom', 8, 'ascii');
  writeFileSync(out, Buffer.concat([header, Buffer.from('fake-render-payload')]));
}

process.stderr.write(`done: ${comp} → ${out} in 1.05s\n`);
process.exit(0);
