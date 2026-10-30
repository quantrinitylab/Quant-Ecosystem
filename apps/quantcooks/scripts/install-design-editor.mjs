// Install the pinned FigCraft web bundle into public/design-editor/0.12.1/.
//
// Why this script exists: studio-figcraft.test.ts (C-7 step 1) pins that the
// verified v0.12.1 web build IS installed at public/design-editor/0.12.1/ —
// its exact 40-file set, its total of 25,677,236 bytes, its single wasm
// (25,314,039 bytes) and its index.html canvas marker. The bundle was never
// vendored into the repo (see src/lib/studio/figcraft.ts) and no install
// script or CI step ever landed, so a clean checkout — CI included — has
// no public/design-editor/ at all and the step-1 tests fail with ENOENT.
// This script is the missing install step, following the same pattern as
// scripts/install-photo-editor.mjs (PR #1845/#1848).
//
// What it does, in order, and what it refuses to do:
//   1. Downloads figcraft-web-0.12.1.zip from the upstream release
//      (pinned URL below, kept in step with FIGCRAFT_PIN in
//      src/lib/studio/figcraft.ts — update both together).
//   2. Refuses to proceed unless the zip is exactly 9,913,496 bytes
//      AND its sha256 matches the release's own SHA256SUMS.txt.
//   3. Extracts to a staging directory and verifies the staging tree
//      BEFORE touching public/design-editor/0.12.1/: exact file list,
//      exact total bytes, wasm size, license files, index.html canvas
//      marker + wasm reference and relative URLs. A mismatch aborts
//      with no target change.
//   4. Only then replaces public/design-editor/0.12.1/ with the
//      verified tree, so a failed install never leaves a
//      half-installed bundle behind.
//   5. If public/design-editor/0.12.1/ already passes the same
//      verification, exits 0 without re-downloading (idempotent).
//
// It does NOT vendor the bundle (25 MB stays out of git), does NOT
// touch ci.yml, and does NOT change any test. It is wired into the
// quantcooks test script (package.json), so gate step 15 and
// full-sweep both install it before vitest runs.
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
const TARGET = join(APP_ROOT, 'public', 'design-editor', '0.12.1');

const PIN = {
  version: '0.12.1',
  releaseZip: 'figcraft-web-0.12.1.zip',
  zipSha256: '8f52f52d4897d35b14c2a347c44ab6362b60b93d6a2f54a17d218111b9006c37',
  zipBytes: 9_913_496,
  totalBytes: 25_677_236,
  topDir: 'figcraft-web-0.12.1',
  wasmFile: 'figcraft-web-44d2aabb268291d5_bg.wasm',
  wasmBytes: 25_314_039,
  expectedFiles: [
    ".htaccess",
    "HOSTING.md",
    "LICENSE-APACHE",
    "LICENSE-MIT",
    "NOTICE",
    "OFL-biz-ud-mincho.txt",
    "OFL-biz-ud-pgothic.txt",
    "OFL-caladea.txt",
    "OFL-carlito.txt",
    "OFL-inter.txt",
    "OFL-lato.txt",
    "OFL-liberation-mono.txt",
    "OFL-liberation-sans.txt",
    "OFL-liberation-serif.txt",
    "OFL-lxgw-wenkai-lite.txt",
    "OFL-merriweather.txt",
    "OFL-montserrat.txt",
    "OFL-nanum-gothic.txt",
    "OFL-noto-sans-arabic.txt",
    "OFL-noto-sans-cjk-sc.txt",
    "OFL-noto-sans-devanagari.txt",
    "OFL-noto-sans-georgian.txt",
    "OFL-noto-sans-hebrew.txt",
    "OFL-noto-sans-symbols-2.txt",
    "OFL-noto-sans-symbols.txt",
    "OFL-noto-sans-thai.txt",
    "OFL-nunito-sans.txt",
    "OFL-open-sans.txt",
    "OFL-playfair-display.txt",
    "OFL-poppins.txt",
    "OFL-roboto.txt",
    "OFL-shippori-mincho.txt",
    "OFL-source-sans-3.txt",
    "OFL-source-serif-4.txt",
    "README.md",
    "_headers",
    "figcraft-web-44d2aabb268291d5.js",
    "figcraft-web-44d2aabb268291d5_bg.wasm",
    "index.html",
    "snippets/eframe-d31a8450ea12dfc1/inline0.js",
  ],
};

const ZIP_URL =
  process.env.FIGCRAFT_WEB_ZIP_URL ??
  `https://github.com/storytold/figcraft/releases/download/v${PIN.version}/${PIN.releaseZip}`;

function fail(message) {
  console.error(`install-design-editor: ${message}`);
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
// nothing on success. Used for the staging tree before it replaces
// the target.
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
  const wasmSize = statSync(join(dir, PIN.wasmFile)).size;
  if (wasmSize !== PIN.wasmBytes) {
    fail(`wasm size mismatch: expected ${PIN.wasmBytes}, got ${wasmSize}`);
  }
  const index = readFileSync(join(dir, 'index.html'), 'utf8');
  if (!index.includes('id="figcraft_canvas"')) {
    fail('index.html does not contain the figcraft_canvas witness marker');
  }
  if (!index.includes(PIN.wasmFile)) fail(`index.html does not reference ${PIN.wasmFile}`);
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
    const wasmSize = statSync(join(TARGET, PIN.wasmFile)).size;
    if (wasmSize !== PIN.wasmBytes) return false;
    const index = readFileSync(join(TARGET, 'index.html'), 'utf8');
    return index.includes('id="figcraft_canvas"') && index.includes(PIN.wasmFile);
  } catch {
    return false;
  }
}

async function main() {
  if (isAlreadyInstalled()) {
    console.log('install-design-editor: public/design-editor/0.12.1/ already verified, nothing to do.');
    return;
  }
  // Staging lives inside APP_ROOT on purpose: /tmp is a different
  // filesystem on many machines, and renameSync across devices fails
  // with EXDEV. The staging dir is removed in the finally block, so
  // a successful run leaves no extra directory behind.
  const work = mkdtempSync(join(APP_ROOT, '.design-editor-install-'));
  try {
    const zipPath = join(work, PIN.releaseZip);
    console.log(`install-design-editor: downloading ${ZIP_URL}`);
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
      `install-design-editor: installed verified v${PIN.version} bundle ` +
        `(${PIN.totalBytes} bytes, ${PIN.expectedFiles.length} files) at public/design-editor/0.12.1/`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
