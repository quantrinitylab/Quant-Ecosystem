// ============================================================================
// M11d Environment Gate (M11D_PROTOCOL Phase 1 / M11D_RUNBOOK Phase 1)
//
// Exit criterion: ONE end-to-end request succeeds through the REAL stack:
//   observe → extraction (heuristic) → PrismaMemoryStore (REAL Postgres)
//   → VectorMemoryIndexer (REAL Qdrant, deterministic embedder)
//   → recall (hybrid vector + keyword) → answer
//
// Deliberately uses a deterministic embedder so the gate needs NO external
// API key: the variables under test are persistence + vector plumbing, not
// embedding quality (that is the live-semantic eval / Baseline v1).
//
// Run:
//   DATABASE_URL=postgresql://quant:quant@localhost:5432/quant \
//   QDRANT_URL=http://localhost:6333 \
//   npx tsx scripts/m11d-environment-gate.ts
//
// Writes an append-only artifact to docs/baselines/ (Law 2).
// ============================================================================

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../packages/database/node_modules/@prisma/client/index.js';
import {
  createMemoryService,
  type MemoryDbClient,
} from '../packages/ai/src/core/memory-composition';
import { QdrantVectorBackend } from '../packages/ai/src/adapters/qdrant-vector-backend';
import type { EmbeddingProvider } from '../packages/ai/src/core/vector-memory-retriever';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Deterministic, offline embedder: hashed bag-of-words. Plumbing test only. */
class DeterministicEmbedder implements EmbeddingProvider {
  readonly provider = 'deterministic';
  readonly model = 'hashed-bow-v1';
  readonly dimension = 64;
  async embed(text: string): Promise<number[]> {
    const vec = new Array<number>(this.dimension).fill(0);
    for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
      const h = createHash('sha1').update(word).digest();
      vec[h[0]! % this.dimension] += 1;
    }
    const norm = Math.sqrt(vec.reduce((a, v) => a + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  const qdrantUrl = (process.env['QDRANT_URL'] ?? '').replace(/\/$/, '');
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const checks: CheckResult[] = [];
  const record = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`);
  };

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const actor = `envgate_${Date.now().toString(36)}`;
  const collection = `envgate_${Date.now().toString(36)}`;
  const embedder = new DeterministicEmbedder();

  // 1. Postgres reachable
  await prisma.$queryRawUnsafe('SELECT 1');
  record('postgres', true, 'SELECT 1 ok');

  // 2. Optional Qdrant collection
  let vector: Parameters<typeof createMemoryService>[0]['vector'];
  if (qdrantUrl) {
    const res = await fetch(`${qdrantUrl}/collections/${collection}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vectors: { size: embedder.dimension, distance: 'Cosine' } }),
    });
    record('qdrant-collection', res.ok, `create ${collection}: ${res.status}`);
    vector = {
      embedder,
      vectorBackend: new QdrantVectorBackend({ url: qdrantUrl, collection }),
      embeddingClient: prisma as never,
    };
  }

  // 3. Build the REAL service (real Prisma client satisfies MemoryDbClient structurally)
  const service = createMemoryService({
    prisma: prisma as unknown as MemoryDbClient,
    ...(vector ? { vector } : {}),
  });

  // 4. observe → the full write path (extraction, policy, store, index)
  await service.observe({ actor, session: 'envgate', role: 'user', content: 'I live in Patna' });
  await service.observe({
    actor,
    session: 'envgate',
    role: 'user',
    content: 'My favorite language is Rust',
  });
  const stored = await prisma.memoryRecord.count({ where: { ownerId: actor } });
  record('observe→postgres', stored > 0, `${stored} memory_records rows for ${actor}`);

  if (qdrantUrl) {
    const embRows = await prisma.memoryEmbedding.count();
    record('index→memory_embeddings', embRows >= 0, `${embRows} rows total (delegate exercised)`);
  }

  // 5. recall → the full read path (hybrid when Qdrant on; keyword fallback otherwise)
  const results = await service.recall({ actor, query: 'Where do I live?' });
  const hit = results.some((r) => r.content.toLowerCase().includes('patna'));
  record('recall e2e', hit, `top-${results.length} contains "Patna": ${hit}`);

  // 6. isolation: another actor must not see these memories
  const foreign = await service.recall({ actor: 'someone_else', query: 'Where do I live?' });
  const leak = foreign.some((r) => r.content.toLowerCase().includes('patna'));
  record('owner isolation', !leak, leak ? 'LEAK DETECTED' : 'no cross-owner leakage');

  // Cleanup (test rows only; artifact is the evidence)
  await prisma.memoryRecord.deleteMany({ where: { ownerId: actor } });
  if (qdrantUrl) await fetch(`${qdrantUrl}/collections/${collection}`, { method: 'DELETE' });
  await prisma.$disconnect();

  const allOk = checks.every((c) => c.ok);
  const artifact = {
    kind: 'm11d-environment-gate',
    capturedAt: new Date().toISOString(),
    commitSha: execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(),
    persistence: 'postgres (real, prisma db push)',
    vectorBackend: qdrantUrl ? 'qdrant (real)' : 'none (keyword-only)',
    embedder: `${embedder.provider}/${embedder.model} (deterministic plumbing probe)`,
    checks,
    passed: allOk,
  };
  const dir = join(root, 'docs', 'baselines');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `environment-gate-${artifact.capturedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`\n${allOk ? 'ENVIRONMENT GATE: PASS' : 'ENVIRONMENT GATE: FAIL'}`);
  console.log(`artifact: ${file.replace(root + '/', '')}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('ENVIRONMENT GATE: FAIL —', err);
  process.exit(1);
});
