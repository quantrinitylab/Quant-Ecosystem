#!/usr/bin/env node
// ============================================================================
// QuantCooks PHASE 0 VERIFICATION GATE (P0-6) — the runnable gate artefact.
//
//   node scripts/phase0-gate.mjs            (or: pnpm test:phase0-gate)
//
// Implements the 8 named checks of the P0-6 spec (quantcooks-p05-p06-build-
// specs.md §3.1) and prints a per-check PASS / FAIL / NOT RUN table plus the
// verdict in the spec's fixed vocabulary:
//
//   GREEN                          everything ran; only allowed failures
//   GREEN WITH OPEN EVIDENCE ITEMS named NOT RUN items remain (listed)
//   RED                            findings listed; exit code 1
//
// Honesty rules baked in:
//  - A check that did not run says NOT RUN with the reason. Nothing is ever
//    silently skipped, and no check can pass on a summary it didn't produce.
//  - Suite comparison is by failure SET, never raw counts (§3.2). In a proper
//    install (CI) the allowed set is EMPTY: zero failures, full stop. In a
//    no-install extract the allowed set is exactly the three named
//    environmental failures, and the gate says so.
//  - The gate fixes nothing and quarantines nothing. A failure is a finding.
//
// Environment modes:
//  - CI / proper install: app node_modules present → canonical configs
//    (in-repo vitest.config.ts, both tsconfigs, @quant/media's own config).
//  - Extract / no-install: the gate GENERATES a vitest config that resolves
//    packages from the pnpm store layout (the technique the lane's builders
//    used all through Phase 0) plus the in-repo @prisma/client stub, and runs
//    scoped strict tsc with store-resolved module paths — the spec §3.1 G3
//    fallback, with the mode stated in the output.
// ============================================================================

import { execFile } from 'node:child_process';
import {
  existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(APP, '..', '..');
const MEDIA = join(ROOT, 'packages', 'media');
const PROPER_INSTALL = existsSync(join(APP, 'node_modules', 'vitest'));
const MODE = PROPER_INSTALL ? 'ci (proper install)' : 'extract (no-install, generated configs)';

const results = []; // { id, name, status: PASS|FAIL|NOT RUN, detail }
function record(id, name, status, detail) {
  results.push({ id, name, status, detail });
  const tag = status === 'PASS' ? 'PASS   ' : status === 'FAIL' ? 'FAIL   ' : 'NOT RUN';
  console.log(`\n[${id}] ${name}: ${tag}`);
  for (const line of String(detail).split('\n')) console.log(`    ${line}`);
}

async function run(cmd, args, { cwd = APP, timeout = 900_000, env = {} } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd, timeout, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, out: stdout + stderr };
  } catch (err) {
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.killed ? '\n[TIMEOUT]' : ''}`,
    };
  }
}

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

// --- pnpm-store helpers (extract mode) --------------------------------------
function storePkg(name) {
  const store = join(ROOT, 'node_modules', '.pnpm');
  if (!existsSync(store)) return null;
  const enc = name.replace('/', '+');
  const dirs = readdirSync(store).filter(
    (d) => d.startsWith(`${enc}@`) || d === enc || d.startsWith(`${enc}_`),
  );
  if (dirs.length === 0) return null;
  const exact = dirs.find((d) => d.startsWith(`${enc}@`)) ?? dirs[0];
  const p = join(store, exact, 'node_modules', name);
  return existsSync(p) ? p : null;
}
function findVitest() {
  const local = join(APP, 'node_modules', 'vitest', 'vitest.mjs');
  if (existsSync(local)) return local;
  const store = join(ROOT, 'node_modules', '.pnpm');
  const dir = readdirSync(store).find((d) => d.startsWith('vitest@'));
  return dir ? join(store, dir, 'node_modules', 'vitest', 'vitest.mjs') : null;
}
function findTsc() {
  const local = join(APP, 'node_modules', 'typescript', 'bin', 'tsc');
  if (existsSync(local)) return local;
  const store = join(ROOT, 'node_modules', '.pnpm');
  const dir = readdirSync(store).find((d) => d.startsWith('typescript@'));
  return dir ? join(store, dir, 'node_modules', 'typescript', 'bin', 'tsc') : null;
}
function buildStoreAliases() {
  const store = join(ROOT, 'node_modules', '.pnpm');
  const declared = {};
  for (const pj of [join(APP, 'package.json'), join(ROOT, 'package.json')]) {
    try {
      const j = JSON.parse(readFileSync(pj, 'utf8'));
      for (const s of ['dependencies', 'devDependencies']) {
        for (const [k, v] of Object.entries(j[s] ?? {})) declared[k] ??= v;
      }
    } catch { /* root package.json may not exist in the extract */ }
  }
  const byName = new Map();
  for (const dir of readdirSync(store)) {
    const m = dir.match(/^((?:@[^+@]+)\+)?([^@_]+)@([^_]+)/);
    if (!m) continue;
    const name = m[1] ? `@${m[1].slice(1, -1)}/${m[2]}` : m[2];
    const path = join(store, dir, 'node_modules', name);
    if (!existsSync(path)) continue;
    const score = (v) => {
      const want = declared[name];
      let s = 0;
      if (want) {
        const maj = want.replace(/^[^0-9]*/, '').split('.')[0];
        if (v.split('.')[0] === maj) s += 100;
        if (want.includes(v)) s += 50;
      }
      return s;
    };
    const cur = byName.get(name);
    if (!cur || score(m[3]) > score(cur.version)
      || (score(m[3]) === score(cur.version)
        && m[3].localeCompare(cur.version, undefined, { numeric: true }) > 0)) {
      byName.set(name, { version: m[3], path });
    }
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const aliases = [];
  for (const [name, { path }] of byName) {
    aliases.push({ find: new RegExp(`^${esc(name)}$`), replacement: path });
    aliases.push({ find: new RegExp(`^${esc(name)}/(.+)$`), replacement: `${path}/$1` });
  }
  return aliases;
}

let tmpDir = null;
function generatedVitestConfig() {
  tmpDir = mkdtempSync(join(tmpdir(), 'qc-gate-'));
  const cfgPath = join(tmpDir, 'vitest.gate.config.mjs');
  const react = storePkg('react');
  const reactDom = storePkg('react-dom');
  const specific = [
    { find: /^next\/server$/, replacement: join(APP, 'src/__tests__/stubs/next-server.ts') },
    ...(react ? [
      { find: /^react$/, replacement: `${react}/index.js` },
      { find: /^react\/jsx-runtime$/, replacement: `${react}/jsx-runtime.js` },
      { find: /^react\/jsx-dev-runtime$/, replacement: `${react}/jsx-dev-runtime.js` },
    ] : []),
    ...(reactDom ? [
      { find: /^react-dom\/server$/, replacement: `${reactDom}/server.node.js` },
      { find: /^react-dom$/, replacement: `${reactDom}/index.js` },
    ] : []),
    { find: /^@prisma\/client$/, replacement: join(APP, 'src/__tests__/stubs/prisma-client.mjs') },
    { find: /^@quant\/([a-z0-9-]+)$/, replacement: join(ROOT, 'packages/$1/src/index.ts') },
    { find: /^@quant\/([a-z0-9-]+)\/src\/(.+)$/, replacement: join(ROOT, 'packages/$1/src/$2') },
    { find: /^@quant\/([a-z0-9-]+)\/(.+)$/, replacement: join(ROOT, 'packages/$1/src/$2') },
  ];
  const aliases = [...specific, ...buildStoreAliases()];
  // Emit the config as code (not JSON) so the alias RegExps survive.
  const code = `export default {\n  root: ${JSON.stringify(APP)},\n  esbuild: { jsx: 'automatic' },\n  resolve: { alias: [\n${aliases.map((a) => `    { find: ${a.find.toString()}, replacement: ${JSON.stringify(a.replacement)} },`).join('\n')}\n  ] },\n};\n`;
  writeFileSync(cfgPath, code);
  return cfgPath;
}

// --- The allowed failure set (§3.2) ------------------------------------------
// CI/proper install: EMPTY. Extract: exactly these, all pre-existing and
// environmental. A failure outside the set — or one of these files failing
// DIFFERENTLY (a 4th cors test, tests actually running in an import-failure
// file) — fails the gate.
const ALLOWED_SUITE_FILES = PROPER_INSTALL ? [] : [
  'backend/__tests__/ffmpeg-auto-edit-renderer.test.ts',
  'backend/__tests__/guest-public-paths.test.ts',
];
const ALLOWED_TEST_FAILURES = PROPER_INSTALL ? [] : [
  'src/__tests__/cors-origins.test.ts > allow-lists the production QuantCooks origin',
  'src/__tests__/cors-origins.test.ts > keeps the flagship and sibling-app origins intact',
  'src/__tests__/cors-origins.test.ts > entries are clean https origins (no trailing slash, no duplicates)',
];
const TEST_COUNT_FLOOR = 232; // post-P0-2 floor (§3.2); drops need a named deletion

function parseSuite(out) {
  const clean = stripAnsi(out);
  const filesLine = clean.match(/Test Files\s+(.*)/)?.[1] ?? '';
  const testsLine = clean.match(/^\s*Tests\s+(.*)$/m)?.[1] ?? '';
  const num = (line, label) => {
    const m = line.match(new RegExp(`(\\d+) ${label}`));
    return m ? Number(m[1]) : 0;
  };
  const suiteFailures = new Set();
  const testFailures = new Set();
  for (const m of clean.matchAll(/FAIL\s+(\S+\.test\.ts)(?:\s+>\s+(.+))?/g)) {
    const file = m[1];
    // Vitest prints "FAIL <file> > <describe> > <test name>": the comparable
    // test identity is the file + the LAST segment.
    const segments = (m[2] ?? '').split(' > ').map((s) => s.trim()).filter(Boolean);
    const name = segments.length ? segments[segments.length - 1].replace(/\s+\d+(?:\.\d+)?m?s$/, '') : '';
    if (name && !name.startsWith('[')) testFailures.add(`${file} > ${name}`);
    else suiteFailures.add(file);
  }
  const skippedFiles = [...clean.matchAll(/↓\s+(\S+\.test\.ts)/g)].map((m) => m[1]);
  return {
    filesLine, testsLine,
    passed: num(testsLine, 'passed'), failed: num(testsLine, 'failed'),
    skipped: num(testsLine, 'skipped'),
    total: num(testsLine, 'passed') + num(testsLine, 'failed') + num(testsLine, 'skipped'),
    suiteFailures, testFailures, skippedFiles,
    contractPassed: /✓\s+src\/__tests__\/api-contract\.test\.ts/.test(clean)
      || /api-contract\.test\.ts\s+\(8 tests\)/.test(clean),
  };
}

// ============================================================================
console.log(`QuantCooks Phase 0 gate — mode: ${MODE}`);
console.log(`app: ${APP}`);

const vitest = findVitest();
if (!vitest) {
  record('G1', 'Full unit suite', 'NOT RUN', 'no vitest binary found (no install, no pnpm store)');
  process.exit(1);
}
const gateConfig = PROPER_INSTALL ? null : generatedVitestConfig();
const vitestArgs = (extra = []) => [
  'run', ...(gateConfig ? ['--config', gateConfig] : []), ...extra,
];

// --- G1 + G2 -----------------------------------------------------------------
const g1 = await run('node', [vitest, ...vitestArgs()], { timeout: 1_200_000 });
const suite = parseSuite(g1.out);
{
  const disallowed = [
    ...[...suite.suiteFailures].filter((f) => !ALLOWED_SUITE_FILES.includes(f))
      .map((f) => `suite failure: ${f}`),
    ...[...suite.testFailures].filter((t) => !ALLOWED_TEST_FAILURES.includes(t))
      .map((t) => `test failure: ${t}`),
  ];
  const detail = [
    `Test Files ${suite.filesLine}`,
    `Tests ${suite.testsLine}`,
    `failure set: suite-level [${[...suite.suiteFailures].join(', ') || 'none'}]; test-level [${[...suite.testFailures].join(', ') || 'none'}]`,
    `env-gated suites skipped (named, not absent): [${suite.skippedFiles.join(', ') || 'none'}]`,
    ...(disallowed.length ? [`DISALLOWED: ${disallowed.join('; ')}`] : ['failure set ⊆ allowed set for this environment']),
    ...(suite.total < TEST_COUNT_FLOOR ? [`test-count floor violated: ${suite.total} < ${TEST_COUNT_FLOOR}`] : [`test count ${suite.total} ≥ floor ${TEST_COUNT_FLOOR}`]),
  ].join('\n');
  record('G1', 'Full unit suite', disallowed.length === 0 && suite.total >= TEST_COUNT_FLOOR ? 'PASS' : 'FAIL', detail);
}
{
  const src = readFileSync(join(APP, 'src/__tests__/api-contract.test.ts'), 'utf8');
  const endpoints = Number(src.match(/expect\(backend\.length\)\.toBe\((\d+)\)/)?.[1] ?? NaN);
  const methodsBlock = src.match(/EXPECTED_CLIENT_METHODS = \[([\s\S]*?)\]/)?.[1] ?? '';
  const methods = (methodsBlock.match(/'[A-Za-z]+'/g) ?? []).length;
  const ok = suite.contractPassed && endpoints === 64 && methods === 51;
  record('G2', 'Contract test (derived counts)', suite.contractPassed ? (ok ? 'PASS' : 'FAIL') : 'FAIL',
    `contract suite in G1 run: ${suite.contractPassed ? 'green' : 'NOT GREEN'}; derived from source: backend endpoints = ${endpoints} (expected 64), client methods = ${methods} (expected 51); backend-only allowlist asserted inside the contract suite itself`);
}

// --- G3 ----------------------------------------------------------------------
{
  const tsc = findTsc();
  if (PROPER_INSTALL && tsc) {
    const r = await run('node', [tsc, '--noEmit'], { timeout: 900_000 });
    const r2 = await run('node', [tsc, '--noEmit', '-p', 'tsconfig.backend.json'], { timeout: 900_000 });
    const errs = (stripAnsi(r.out).match(/error TS/g) ?? []).length
      + (stripAnsi(r2.out).match(/error TS/g) ?? []).length;
    record('G3', 'Typecheck (both tsconfigs)', errs === 0 ? 'PASS' : 'FAIL',
      `pnpm typecheck equivalent: ${errs} errors`);
  } else if (tsc) {
    // Extract fallback (§3.1 G3): scoped strict tsc with store-resolved paths.
    const typeRoots = [storePkg('@types/node') ? join(storePkg('@types/node'), '..') : null].filter(Boolean);
    const paths = {
      '@quant/common': [join(ROOT, 'packages/common/src/index.ts')], '@quant/common/*': [join(ROOT, 'packages/common/src/*')],
      '@quant/auth': [join(ROOT, 'packages/auth/src/index.ts')], '@quant/auth/*': [join(ROOT, 'packages/auth/src/*')],
      '@quant/database': [join(ROOT, 'packages/database/dist/index.d.ts')], '@quant/database/*': [join(ROOT, 'packages/database/dist/*')],
      '@quant/realtime': [join(ROOT, 'packages/realtime/src/index.ts')], '@quant/realtime/*': [join(ROOT, 'packages/realtime/src/*')],
      '@quant/server-core': [join(ROOT, 'packages/server-core/src/index.ts')], '@quant/server-core/*': [join(ROOT, 'packages/server-core/src/*')],
      '@quant/storage': [join(ROOT, 'packages/storage/src/index.ts')], '@quant/storage/*': [join(ROOT, 'packages/storage/src/*')],
      '@quant/ai': [join(ROOT, 'packages/ai/src/index.ts')], '@quant/ai/*': [join(ROOT, 'packages/ai/src/*')],
      '@quant/media': [join(ROOT, 'packages/media/src/index.ts')], '@quant/media/*': [join(ROOT, 'packages/media/src/*')],
      '@quant/quant-tools': [join(ROOT, 'packages/quant-tools/src/index.ts')], '@quant/quant-tools/*': [join(ROOT, 'packages/quant-tools/src/*')],
      '@quant/quanty-contracts': [join(ROOT, 'packages/quanty-contracts/src/index.ts')], '@quant/quanty-contracts/*': [join(ROOT, 'packages/quanty-contracts/src/*')],
      '@quant/credits': [join(ROOT, 'packages/credits/src/index.ts')], '@quant/credits/*': [join(ROOT, 'packages/credits/src/*')],
    };
    for (const p of ['fastify', 'zod']) {
      const s = storePkg(p);
      if (s) { paths[p] = [s]; paths[`${p}/*`] = [`${s}/*`]; }
    }
    const base = {
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true,
        noEmit: true, esModuleInterop: true, resolveJsonModule: true, isolatedModules: true,
        skipLibCheck: true, jsx: 'react-jsx', ...(typeRoots.length ? { typeRoots } : {}), paths,
      },
      exclude: ['node_modules'],
    };
    const beCfg = join(tmpDir, 'tsconfig.gate-backend.json');
    writeFileSync(beCfg, JSON.stringify({
      ...base,
      include: [join(APP, 'backend/services/**/*.ts'), join(APP, 'backend/routes/**/*.ts')],
    }, null, 2));
    const be = await run('node', [tsc, '--noEmit', '-p', beCfg], { timeout: 900_000 });
    const beLines = stripAnsi(be.out).split('\n').filter((l) => l.includes('error TS'));
    const beAppErrors = beLines.filter((l) => l.includes(join('apps', 'quantcooks')));
    record('G3', 'Typecheck (scoped, extract fallback)', beAppErrors.length === 0 ? 'PASS' : 'FAIL',
      `mode: scoped strict tsc over backend/services + backend/routes (backend/app.ts excluded per spec — extract module-graph limit; its registrations are runtime-proven by route tests)\nerrors in apps/quantcooks files: ${beAppErrors.length}${beAppErrors.length ? `\n${beAppErrors.join('\n')}` : ''}\nresidual errors elsewhere (stale generated @prisma/client in packages/*, pre-existing): ${beLines.length - beAppErrors.length}\nfull-config typecheck is a CI-mode check (proper install)`);
  } else {
    record('G3', 'Typecheck', 'NOT RUN', 'no typescript binary found');
  }
}

// --- G4 ----------------------------------------------------------------------
{
  const mediaVitestArgs = PROPER_INSTALL
    ? ['run']
    : (() => {
        const zod = storePkg('zod');
        const cfg = join(tmpDir, 'vitest.media.config.mjs');
        writeFileSync(cfg, `export default {\n  root: ${JSON.stringify(MEDIA)},\n  resolve: { alias: [${zod ? `{ find: /^zod$/, replacement: ${JSON.stringify(zod)} },` : ''}] },\n  test: { globals: true, environment: 'node', exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'] },\n};\n`);
        return ['run', '--config', cfg];
      })();
  const r = await run('node', [vitest, ...mediaVitestArgs], { cwd: MEDIA, timeout: 900_000 });
  const s = parseSuite(r.out);
  record('G4', '@quant/media suite', s.failed === 0 && s.suiteFailures.size === 0 ? 'PASS' : 'FAIL',
    `Test Files ${s.filesLine}\nTests ${s.testsLine}${PROPER_INSTALL ? '' : '\n(extract mode: run with the media package’s own config + a generated zod store alias — the plain run fails at import on the extract’s missing install linking, recorded in the gate report)'}`);
}

// --- G5 ----------------------------------------------------------------------
{
  const store = join(ROOT, 'node_modules', '.pnpm');
  const prismaDir = existsSync(store)
    ? readdirSync(store).find((d) => d.startsWith('prisma@')) : null;
  const prismaCli = join(APP, 'node_modules', 'prisma', 'build', 'index.js');
  const cli = existsSync(prismaCli)
    ? prismaCli
    : prismaDir ? join(store, prismaDir, 'node_modules', 'prisma', 'build', 'index.js') : null;
  if (!cli) {
    record('G5', 'Prisma validate/generate/migrate', 'NOT RUN', 'prisma CLI not found');
  } else {
    const schema = join(ROOT, 'packages/database/prisma/schema.prisma');
    const v = await run('node', [cli, 'validate', '--schema', schema], { cwd: ROOT, timeout: 180_000 });
    const vOut = stripAnsi(v.out);
    if (v.code === 0 && /valid/i.test(vOut)) {
      const g = await run('node', [cli, 'generate', '--schema', schema], { cwd: ROOT, timeout: 300_000 });
      let detail = `validate: PASS\ngenerate: ${g.code === 0 ? 'PASS' : 'FAIL'}`;
      if (process.env['DATABASE_URL']) {
        const m = await run('node', [cli, 'migrate', 'deploy', '--schema', schema], { cwd: ROOT, timeout: 300_000 });
        detail += `\nmigrate deploy (migration 0107_quantcooks_edit_project_persistence named): ${m.code === 0 ? 'PASS' : 'FAIL'}`;
        record('G5', 'Prisma validate/generate/migrate', g.code === 0 && m.code === 0 ? 'PASS' : 'FAIL', detail);
      } else {
        record('G5', 'Prisma validate/generate/migrate', 'NOT RUN',
          `${detail}\nmigrate deploy: NOT RUN — DATABASE_URL not set (CI test database required)`);
      }
    } else if (/aborted|ECONNRESET|download|fetch failed|network/i.test(vOut)) {
      record('G5', 'Prisma validate/generate/migrate', 'NOT RUN',
        'prisma CLI cannot download its schema engine in this environment (network abort, recorded since P0-1) — validate/generate/migrate deploy (migration 0107_quantcooks_edit_project_persistence) are CI-only');
    } else {
      record('G5', 'Prisma validate/generate/migrate', 'FAIL',
        `prisma validate failed:\n${vOut.split('\n').slice(0, 10).join('\n')}`);
    }
  }
}

// --- G6 ----------------------------------------------------------------------
{
  const patterns = [
    { needle: 'storage.quant.example.com', dirs: ['src', 'backend'], testsOk: true, commentsOk: false },
    { needle: 'MOCK_ASSETS', dirs: ['src'], testsOk: false, commentsOk: true },
    { needle: 'placeholder.jpg', dirs: ['src'], testsOk: false, commentsOk: true },
  ];
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else if (/\.tsx?$/.test(e.name)) {
        const lines = readFileSync(p, 'utf8').split('\n');
        lines.forEach((line, i) => {
          for (const pat of patterns) {
            if (!line.includes(pat.needle)) continue;
            const isTest = p.includes('__tests__');
            const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
            if ((isTest && pat.testsOk) || (isComment && pat.commentsOk)) continue;
            hits.push(`${p.slice(APP.length + 1)}:${i + 1} contains ${pat.needle}`);
          }
        });
      }
    }
  };
  for (const d of ['src', 'backend']) walk(join(APP, d));
  // Hard-coded credit balance guard: a numeric literal bound to a balance
  // display in non-test source (per-tool credit COSTS are legitimate and do
  // not match this pattern).
  const balanceHits = [];
  const walkSrc = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walkSrc(p);
      else if (/\.tsx?$/.test(e.name) && !p.includes('__tests__')) {
        readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          if (/(creditsRemaining|balance)\s*[:=]\s*\d+/i.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
            balanceHits.push(`${p.slice(APP.length + 1)}:${i + 1}`);
          }
        });
      }
    }
  };
  walkSrc(join(APP, 'src'));
  const bad = [...hits, ...balanceHits.map((h) => `${h} hard-coded credit balance`)];
  record('G6', 'Fabricated-data guards', bad.length === 0 ? 'PASS' : 'FAIL',
    bad.length === 0
      ? 'storage.quant.example.com: only inside the guard test’s absence assertions\nMOCK_ASSETS / placeholder.jpg: only in historical comments\nno numeric literal bound to a credit balance in non-test source'
      : bad.join('\n'));
}

// --- G7 + G8 -------------------------------------------------------------------
const smokeWanted = process.env['PHASE0_SMOKE'] === '1';
const smokeMissing = [
  ...(!process.env['DATABASE_URL'] ? ['DATABASE_URL'] : []),
  ...(!process.env['JWT_SECRET'] ? ['JWT_SECRET'] : []),
  ...(!['ATTACHMENTS_BUCKET', 'R2_BUCKET', 'S3_BUCKET'].some((k) => process.env[k])
    ? ['an explicit storage bucket (ATTACHMENTS_BUCKET / R2_BUCKET / S3_BUCKET)'] : []),
  'real Postgres + real object storage + ffmpeg/ffprobe (environment, not just env vars)',
];
if (smokeWanted) {
  const r = await run('node', [vitest, ...vitestArgs(['backend/__tests__/phase0-restart-smoke.e2e.test.ts'])], { timeout: 1_200_000 });
  const s = parseSuite(r.out);
  const ok = s.failed === 0 && s.suiteFailures.size === 0;
  record('G7', 'Restart-persistence smoke (process level)', ok ? 'PASS' : 'FAIL', `Tests ${s.testsLine}`);
  record('G8', 'Phase 0 E2E smoke — backend chain (= G7 steps 1–6)', ok ? 'PASS' : 'FAIL',
    'backend chain executed as part of the restart smoke\nfrontend-pair checklist: NOT RUN (manual sign-off — see gate report; the gate never auto-passes it)');
} else {
  record('G7', 'Restart-persistence smoke (process level)', 'NOT RUN',
    `PHASE0_SMOKE not set. Missing here: ${smokeMissing.join('; ')}. Closing command: PHASE0_SMOKE=1 DATABASE_URL=… JWT_SECRET=… <storage env> node scripts/phase0-gate.mjs (CI/staging)`);
  record('G8', 'Phase 0 E2E smoke', 'NOT RUN',
    'backend chain: NOT RUN (runs as the restart smoke, G7)\nfrontend-pair checklist: NOT RUN — requires a locally running frontend+backend pair, a real SSO session and a browser; recorded step-by-step in the gate report, never auto-passed');
}

// --- Verdict -------------------------------------------------------------------
const fails = results.filter((r) => r.status === 'FAIL');
const notRun = results.filter((r) => r.status === 'NOT RUN');
const verdict = fails.length > 0
  ? 'RED'
  : notRun.length > 0
    ? 'GREEN WITH OPEN EVIDENCE ITEMS'
    : 'GREEN';

console.log('\n================ PHASE 0 GATE ================');
for (const r of results) console.log(`${r.id}  ${r.status.padEnd(7)} ${r.name}`);
console.log(`\nVERDICT: ${verdict}`);
if (notRun.length) {
  console.log('Open evidence items:');
  for (const r of notRun) console.log(`  - ${r.id} ${r.name}`);
}
if (fails.length) {
  console.log('Findings:');
  for (const r of fails) console.log(`  - ${r.id} ${r.name}`);
}
if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
process.exit(verdict === 'RED' ? 1 : 0);
