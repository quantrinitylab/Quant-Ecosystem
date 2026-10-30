// Install the pinned PhotoCraft web bundle into public/photo-editor/.
//
// Why this script exists: studio-batch4.test.ts (F-C3-1) pins that the
// verified v0.17.0 web build IS installed at public/photo-editor/ — its
// exact 15-file set, its parts-manifest first line and its total of
// 13,253,507 bytes. The bundle was never vendored into the repo (see
// src/lib/studio/photocraft.ts: "this unit does NOT vendor it") and no
// install script or CI step ever landed, so a clean checkout — CI
// included — has no public/photo-editor/ at all and all 4 F-C3-1 tests
// fail with ENOENT. This script is the missing install step.
//
// What it does, in order, and what it refuses to do:
//   1. Downloads photocraft-web-0.17.0.zip from the upstream release
//      (pinned URL below, kept in step with PHOTOCRAFT_PIN in
//      src/lib/studio/photocraft.ts — update both together).
//   2. Refuses to proceed unless the zip is exactly 12,955,028 bytes
//      AND its sha256 matches the release's own SHA256SUMS.txt.
//   3. Extracts to a staging directory and verifies the staging tree
//      BEFORE touching public/photo-editor/: exact file list, exact
//      total bytes, parts.txt first line, index.html boot script and
//      relative URLs. A mismatch aborts with no target change.
//   4. Only then replaces public/photo-editor/ with the verified tree,
//      so a failed install never leaves a half-installed bundle behind.
//   5. If public/photo-editor/ already passes the same verification,
//      exits 0 without re-downloading (idempotent for local dev).
//
// It does NOT vendor the bundle (13 MB stays out of git), does NOT
// touch ci.yml, and does NOT change any test. Wiring it into CI is a
// one-line step for the parent to approve (see PR body):
//   - name: Install pinned PhotoCraft web bundle
//     run: pnpm --filter @quant/quantcooks run install:photo-editor
// The same step belongs in the deploy build if the editor is to be
// served live — a gate-only install greens the gate but does not by
// itself ship the bundle in the deployed image.
//
// Node builtins only. Requires the `unzip` command (present on
// ubuntu-latest runners and on most dev machines).

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..');
const TARGET = join(APP_ROOT, 'public', 'photo-editor');

const PIN = {
  version: '0.17.0',
  releaseZip: 'photocraft-web-0.17.0.zip',
  zipSha256: '9dbc979e138e83136d5958acd0cf7d1832aeae5095409eb4691dca577db5fc99',
  zipBytes: 12_955_028,
  totalBytes: 13_253_507,
  topDir: 'photocraft-web-0.17.0',
  bootJs: 'photocraft-web-boot-251aa3764a2189ed.js',
  expectedFiles: [
    '.htaccess',
    'ATTRIBUTION.md',
    'HOSTING.md',
    'LICENSE-APACHE',
    'LICENSE-MIT',
    'NOTICE',
    'README.md',
    '_headers',
    'app/parts.txt',
    'app/photocraft-web-25bf2289380b561f.part-aa',
    'app/photocraft-web.js',
    'index.html',
    'photocraft-web-boot-251aa3764a2189ed.js',
    'photocraft-web-boot-251aa3764a2189ed_bg.wasm',
    'snippets/eframe-d31a8450ea12dfc1/inline0.js',
  ],
};

const ZIP_URL =
  process.env.PHOTOCRAFT_WEB_ZIP_URL ??
  `https://github.com/storytold/photocraft/releases/download/v${PIN.version}/${PIN.releaseZip}`;

function fail(message) {
  console.error(`install-photo-editor: ${message}`);
  process.exit(1);
}

function walkFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

// Throws on the first mismatch, with a message naming it. Returns
// nothing on success. Used both for the already-installed fast path
// and for the staging tree before it replaces the target.
function verifyTree(dir) {
  if (!existsSync(dir)) fail(`bundle directory missing: ${dir}`);
  const files = walkFiles(dir);
  const expected = [...PIN.expectedFiles].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    fail(
      `file set mismatch.\n  expected: ${expected.join(', ')}\n  actual:   ${files.join(', ')}`,
    );
  }
  const total = files.reduce((sum, rel) => sum + statSync(join(dir, rel)).size, 0);
  if (total !== PIN.totalBytes) {
    fail(`total bytes mismatch: expected ${PIN.totalBytes}, got ${total}`);
  }
  const parts = readFileSync(join(dir, 'app', 'parts.txt'), 'utf8');
  if (parts.split('\n')[0]?.trim() !== 'photocraft-parts 1') {
    fail('app/parts.txt first line is not the genuine "photocraft-parts 1" witness');
  }
  const index = readFileSync(join(dir, 'index.html'), 'utf8');
  if (!index.includes(PIN.bootJs)) fail(`index.html does not boot ${PIN.bootJs}`);
  if (index.includes('src="/') || index.includes('href="/')) {
    fail('index.html uses absolute URLs; the build must boot through relative URLs');
  }
}

// NOTE: verifyTree() exits the process on mismatch, so the fast path
// below is a separate non-exiting check — it must never call verifyTree().
function isAlreadyInstalled() {
  if (!existsSync(TARGET)) return false;
  try {
    const files = walkFiles(TARGET);
    if (JSON.stringify(files) !== JSON.stringify([...PIN.expectedFiles].sort())) return false;
    const total = files.reduce((sum, rel) => sum + statSync(join(TARGET, rel)).size, 0);
    if (total !== PIN.totalBytes) return false;
    const parts = readFileSync(join(TARGET, 'app', 'parts.txt'), 'utf8');
    return parts.split('\n')[0]?.trim() === 'photocraft-parts 1';
  } catch {
    return false;
  }
}

async function main() {
  if (isAlreadyInstalled()) {
    console.log('install-photo-editor: public/photo-editor/ already verified, nothing to do.');
    return;
  }
  // Staging lives inside APP_ROOT on purpose: /tmp is a different
  // filesystem on many machines, and renameSync across devices fails
  // with EXDEV. The staging dir is removed in the finally block, so
  // a successful run leaves no extra directory behind.
  const work = mkdtempSync(join(APP_ROOT, '.photo-editor-install-'));
  try {
    const zipPath = join(work, PIN.releaseZip);
    console.log(`install-photo-editor: downloading ${ZIP_URL}`);
    const res = await fetch(ZIP_URL);
    if (!res.ok) fail(`download failed: HTTP ${res.status} for ${ZIP_URL}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length !== PIN.zipBytes) {
      fail(`zip size mismatch: expected ${PIN.zipBytes}, got ${bytes.length}`);
    }
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== PIN.zipSha256) {
      fail(`zip sha256 mismatch: expected ${PIN.zipSha256}, got ${sha}`);
    }
    writeFileSync(zipPath, bytes);

    const extractDir = join(work, 'extract');
    mkdirSync(extractDir);
    try {
      execFileSync('unzip', ['-q', '-o', zipPath, '-d', extractDir], { stdio: 'pipe' });
    } catch (err) {
      fail(`unzip failed (is 'unzip' installed?): ${err.message}`);
    }
    const staging = join(extractDir, PIN.topDir);
    if (!existsSync(staging)) fail(`zip has no top directory ${PIN.topDir}/`);
    verifyTree(staging);

    rmSync(TARGET, { recursive: true, force: true });
    mkdirSync(dirname(TARGET), { recursive: true });
    renameSync(staging, TARGET);
    console.log(
      `install-photo-editor: installed verified v${PIN.version} bundle ` +
        `(${PIN.totalBytes} bytes, ${PIN.expectedFiles.length} files) at public/photo-editor/`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
