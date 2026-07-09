// ============================================================================
// Memory Evaluation — LIVE semantic run (M08 + M09 proven together)
//
// Runs the exact same eval corpus and scoring as memory-eval.test.ts, but with
// the REAL semantic layer wired in: BedrockEmbeddingProvider (Titan v2) +
// QdrantVectorBackend (real Qdrant instance). Persistence stays in-memory so
// the measured variable is retrieval quality of the hybrid vector path.
//
// GATED: skips entirely unless AWS_BEARER_TOKEN_BEDROCK and QDRANT_URL are set.
// Never runs in CI without explicit credentials. Writes an append-only
// artifact to docs/baselines/ (Law 2) recording models, dims, and metrics.
//
// Run:  AWS_BEARER_TOKEN_BEDROCK=... QDRANT_URL=http://localhost:6333 \
//       npx vitest run src/__tests__/memory-eval-live.test.ts
// ============================================================================

import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runMemoryEval, formatDashboard, type EvalServiceFactory } from '../eval/memory-eval';
import { allScenarios } from '../eval/datasets';
import { createMemoryService } from '../core/memory-composition';
import {
  BedrockEmbeddingProvider,
  loadBedrockEmbeddingConfig,
} from '../adapters/bedrock-embedding-provider';
import { QdrantVectorBackend } from '../adapters/qdrant-vector-backend';
import type { EmbeddingProvider } from '../core/vector-memory-retriever';

const LIVE = Boolean(process.env['AWS_BEARER_TOKEN_BEDROCK'] && process.env['QDRANT_URL']);

/** Small retry wrapper: live APIs throttle; the eval should measure quality, not luck. */
class RetryingEmbedder implements EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimension: number;
  constructor(private readonly inner: EmbeddingProvider) {
    this.provider = inner.provider;
    this.model = inner.model;
    this.dimension = inner.dimension;
  }
  async embed(text: string): Promise<number[]> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.inner.embed(text);
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      }
    }
    throw lastErr;
  }
}

describe.skipIf(!LIVE)('memory evaluation — LIVE semantic layer (Bedrock + Qdrant)', () => {
  const qdrantUrl = (process.env['QDRANT_URL'] ?? '').replace(/\/$/, '');
  const runId = `evallive_${Date.now().toString(36)}`;
  const createdCollections: string[] = [];

  // Lazy: describe bodies run even when skipped; only build with real creds.
  const embedder: EmbeddingProvider = LIVE
    ? new RetryingEmbedder(new BedrockEmbeddingProvider(loadBedrockEmbeddingConfig()))
    : (null as unknown as EmbeddingProvider);

  async function createCollection(name: string): Promise<void> {
    const res = await fetch(`${qdrantUrl}/collections/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vectors: { size: embedder.dimension, distance: 'Cosine' } }),
    });
    if (!res.ok) throw new Error(`Qdrant collection create failed: ${res.status}`);
    createdCollections.push(name);
  }

  const factory: EvalServiceFactory = async (db, ctx) => {
    const collection = `${runId}_${ctx.scenario}_${ctx.caseId}`.replace(/[^a-zA-Z0-9_]/g, '_');
    await createCollection(collection);
    return createMemoryService({
      prisma: db,
      vector: {
        embedder,
        vectorBackend: new QdrantVectorBackend({ url: qdrantUrl, collection }),
        embeddingClient: { memoryEmbedding: { create: async () => ({}) } },
      },
    });
  };

  afterAll(async () => {
    for (const name of createdCollections) {
      await fetch(`${qdrantUrl}/collections/${name}`, { method: 'DELETE' }).catch(() => undefined);
    }
  });

  it(
    'runs the full corpus through the real hybrid vector path and archives the artifact',
    { timeout: 600_000 },
    async () => {
      const { perScenario, overall } = await runMemoryEval(allScenarios, factory);

      console.log('=== LIVE Semantic Memory Evaluation (Bedrock Titan v2 + Qdrant) ===');
      console.log(`embedder: ${embedder.provider}/${embedder.model} dim=${embedder.dimension}`);
      console.log(formatDashboard({ perScenario, overall }));

      // Archive an append-only artifact (Law 2) so this run is citable evidence.
      const root = join(__dirname, '..', '..', '..', '..');
      const dir = join(root, 'docs', 'baselines');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const commitSha = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
      const artifact = {
        kind: 'live-semantic-eval',
        capturedAt: new Date().toISOString(),
        embeddingProvider: embedder.provider,
        embeddingModel: embedder.model,
        embeddingDimension: embedder.dimension,
        vectorBackend: 'qdrant',
        persistence: 'in-memory (variable under test: hybrid retrieval quality)',
        commitSha,
        perScenario,
        overall,
      };
      const file = join(
        dir,
        `live-semantic-eval-${artifact.capturedAt.replace(/[:.]/g, '-')}.json`,
      );
      writeFileSync(file, JSON.stringify(artifact, null, 2) + '\n');
      console.log(`artifact: ${file}`);

      // Sanity floor only — this is a measurement run, not a gate run. The
      // dashboard + artifact are the deliverables; regressions are judged
      // against archived artifacts, not hardcoded numbers.
      expect(overall.totalQueries).toBeGreaterThan(0);
      expect(overall.recallAccuracy).toBeGreaterThan(0);
    },
  );
});
