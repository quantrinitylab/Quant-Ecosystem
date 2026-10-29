#!/usr/bin/env node
// ============================================================================
// Fake FigCraft CLI (C-7 step 4 adapter/service tests).
//
// Stands in for the pinned figcraft-cli in fast tests: implements
// --version, the `run <script.json>` shape (reads the script, honours
// file.newFromTemplate / file.new + file.saveAs, writes deterministic
// fake .figcraft bytes — a ZIP magic header + payload marker — to the
// saveAs path and prints one JSON result line per step, like the real
// binary) and the `export <file> -o <out> --format <fmt> [--node X]`
// shape (single file with format magic when <out> carries the format
// extension, else one file per frame into the <out> directory).
// Behaviour knobs via env:
//   FAKE_FIG_EXIT=3        -> exit non-zero (writes nothing)
//   FAKE_FIG_NO_OUTPUT=1   -> exit 0 but write NO output
//   FAKE_FIG_SLEEP_MS=5000 -> sleep before answering (timeout tests)
// An unknown template id in a run script fails the step with
// {"ok":false,...} and exit 1, exactly like the real binary.
// ============================================================================
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);

if (process.env['FAKE_FIG_SLEEP_MS']) {
  const ms = Number(process.env['FAKE_FIG_SLEEP_MS']);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const KNOWN_TEMPLATES = [
  'mobile-app', 'landing-page', 'dashboard', 'design-system',
  'wireframe-kit', 'social-posts', 'slides', 'icon-set',
];

const exitCode = Number(process.env['FAKE_FIG_EXIT'] ?? '0');
const noOutput = process.env['FAKE_FIG_NO_OUTPUT'] === '1';

function fail(code) {
  process.stderr.write(`fake figcraft failure (exit ${code})\n`);
  process.exit(code);
}

function magicFor(format) {
  if (format === 'png') return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (format === 'pdf') return Buffer.from('%PDF-1.7\n', 'utf8');
  if (format === 'svg') return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">', 'utf8');
  return Buffer.from('FAKE-FIG', 'utf8');
}

if (args[0] === '--version') {
  process.stdout.write('figcraft-cli 0.12.1 (fake fixture)\n');
  process.exit(0);
}

if (args[0] === 'run') {
  const scriptPath = args[1];
  let steps;
  try {
    steps = JSON.parse(readFileSync(scriptPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`fake figcraft: cannot read script: ${err.message}\n`);
    process.exit(2);
  }
  if (exitCode !== 0) fail(exitCode);
  let savePath = null;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.command === 'file.newFromTemplate' && !KNOWN_TEMPLATES.includes(step.params?.template)) {
      process.stdout.write(JSON.stringify({
        command: step.command,
        ok: false,
        error: `invalid parameters for \`file.newFromTemplate\`: \`template\` must be an id from \`template.list\``,
        rolledBack: true,
        step: i,
      }) + '\n');
      process.stderr.write(`error: step ${i} (file.newFromTemplate) failed: invalid template\n`);
      process.exit(1);
    }
    if (step.command === 'file.saveAs') savePath = step.params?.path ?? null;
    process.stdout.write(JSON.stringify({ command: step.command, ok: true, result: {}, step: i }) + '\n');
  }
  if (savePath && !noOutput) {
    // A .figcraft is a ZIP: PK magic + a marker payload (tests assert both).
    writeFileSync(savePath, Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('FAKE-FIGCRAFT-DOCUMENT', 'utf8'),
    ]));
  }
  process.exit(0);
}

if (args[0] === 'export') {
  const inputPath = args[1];
  const outIdx = args.indexOf('-o');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  const fmtIdx = args.indexOf('--format');
  const format = fmtIdx >= 0 ? args[fmtIdx + 1] : 'png';
  if (exitCode !== 0) fail(exitCode);
  if (!inputPath || !existsSync(inputPath)) {
    process.stderr.write(`error: can't open ${inputPath}: no such file\n`);
    process.exit(1);
  }
  if (!out) {
    process.stderr.write('fake figcraft: missing -o\n');
    process.exit(2);
  }
  if (!noOutput) {
    const payload = Buffer.concat([magicFor(format), Buffer.from('FAKE-FIG-EXPORT', 'utf8')]);
    if (out.endsWith(`.${format}`)) {
      writeFileSync(out, payload);
    } else {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `Welcome.${format}`), payload);
      writeFileSync(join(out, `Explore.${format}`), payload);
    }
  }
  process.exit(0);
}

process.stderr.write(`fake figcraft: unsupported args ${args.join(' ')}\n`);
process.exit(2);
