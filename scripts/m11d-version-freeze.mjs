#!/usr/bin/env node
/**
 * M11d Version Freeze — captures the six immutable identifiers required by
 * docs/M11D_PROTOCOL.md BEFORE any baseline run:
 *
 *   1. model ID (extraction + embedding)
 *   2. prompt revision (sha256 of the extraction system prompt source)
 *   3. policy version (MemoryPolicy.version)
 *   4. corpus version (CORPUS_VERSION)
 *   5. application commit SHA
 *   6. dependency lockfile hash
 *
 * Usage:
 *   node scripts/m11d-version-freeze.mjs            # print + write artifact
 *   node scripts/m11d-version-freeze.mjs --check    # print only, no artifact
 *
 * Writes: docs/baselines/version-freeze-<utc-timestamp>.json
 * Artifacts are append-only evidence (Law 2): never edit or delete them.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function extractConst(source, regex, label, file) {
  const m = source.match(regex);
  if (!m) throw new Error(`version-freeze: could not find ${label} in ${file}`);
  return m[1];
}

// 1. Model IDs (env override wins — record what the run will ACTUALLY use)
const extractionSrc = read('packages/ai/src/adapters/llm-extraction-model.ts');
const embeddingSrc = read('packages/ai/src/adapters/openai-embedding-provider.ts');
const extractionModel =
  process.env.EXTRACTION_MODEL ??
  extractConst(extractionSrc, /const DEFAULT_MODEL = '([^']+)'/, 'DEFAULT_MODEL', 'llm-extraction-model.ts');
const embeddingModel =
  process.env.OPENAI_EMBEDDING_MODEL ??
  extractConst(embeddingSrc, /const DEFAULT_MODEL = '([^']+)'/, 'DEFAULT_MODEL', 'openai-embedding-provider.ts');

// 2. Prompt revision — hash the SYSTEM_PROMPT block (stable across whitespace-only file moves)
const promptBlock = extractionSrc.match(/const SYSTEM_PROMPT = \[[\s\S]*?\]/);
if (!promptBlock) throw new Error('version-freeze: SYSTEM_PROMPT block not found');
const promptRevision = sha256(promptBlock[0]).slice(0, 16);

// 3. Policy version
const policySrc = read('packages/ai/src/core/memory-acceptance-policy.ts');
const policyVersion = extractConst(policySrc, /version: '([^']+)'/, 'MemoryPolicy.version', 'memory-acceptance-policy.ts');

// 4. Corpus version
const corpusSrc = read('packages/ai/src/eval/corpus.ts');
const corpusVersion = extractConst(corpusSrc, /export const CORPUS_VERSION = '([^']+)'/, 'CORPUS_VERSION', 'corpus.ts');

// 5. Commit SHA (+ dirty flag: a dirty tree is NOT a valid baseline)
const commitSha = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
const dirty = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }).trim().length > 0;

// 6. Lockfile hash
const lockfileHash = sha256(read('pnpm-lock.yaml')).slice(0, 16);

const freeze = {
  capturedAt: new Date().toISOString(),
  extractionModel,
  embeddingModel,
  promptRevision,
  policyVersion,
  corpusVersion,
  commitSha,
  workingTreeDirty: dirty,
  lockfileHash,
};

console.log('=== M11d Version Freeze ===');
for (const [k, v] of Object.entries(freeze)) console.log(`${k.padEnd(18)} ${v}`);
if (dirty) {
  console.error('\n⚠️  Working tree is DIRTY — commit or stash before running a baseline.');
  process.exitCode = 1;
}

if (!process.argv.includes('--check')) {
  const dir = join(root, 'docs', 'baselines');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `version-freeze-${freeze.capturedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(freeze, null, 2) + '\n');
  console.log(`\nArtifact written: ${file.replace(root + '/', '')}`);
}
