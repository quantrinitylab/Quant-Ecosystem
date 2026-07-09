// ============================================================================
// Memory Evaluation — LIVE end-to-end with a REAL LLM extractor
//
// The deepest live measurement available pre-cutover: the full memory-eval
// corpus (observe → REAL LLM extraction → acceptance policy → store →
// recall → scoring) with the production orchestration. Retrieval stays
// keyword-based so the measured variable is EXTRACTION quality end-to-end
// (the semantic layer has its own live eval).
//
// GATED: skips unless EXTRACTION_API_KEY + EXTRACTION_BASE_URL are set.
//
// Run:
//   EXTRACTION_API_KEY=... EXTRACTION_BASE_URL=https://<gateway>/v1 \
//   EXTRACTION_MODEL=deepseek.v3.2 \
//   npx vitest run src/__tests__/memory-eval-live-llm.test.ts
// ============================================================================

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runMemoryEval, formatDashboard, type EvalServiceFactory } from '../eval/memory-eval';
import { allScenarios } from '../eval/datasets';
import { createMemoryService } from '../core/memory-composition';
import { LlmExtractionModel } from '../adapters/llm-extraction-model';

const LIVE = Boolean(process.env['EXTRACTION_API_KEY'] && process.env['EXTRACTION_BASE_URL']);

describe.skipIf(!LIVE)('memory evaluation — LIVE e2e with real LLM extraction', () => {
  it(
    'runs the full corpus with the LLM extractor and archives the artifact',
    { timeout: 1_800_000 },
    async () => {
      const model = process.env['EXTRACTION_MODEL'] ?? 'gpt-4o-mini';
      const factory: EvalServiceFactory = (db) =>
        createMemoryService({
          prisma: db,
          extractor: new LlmExtractionModel({
            apiKey: process.env['EXTRACTION_API_KEY'] as string,
            baseUrl: process.env['EXTRACTION_BASE_URL'] as string,
            model,
          }),
        });

      const { perScenario, overall } = await runMemoryEval(allScenarios, factory);

      console.log(`=== LIVE Memory Evaluation (extractor: ${model}) ===`);
      console.log(formatDashboard({ perScenario, overall }));

      // Archive append-only evidence (Law 2).
      const root = join(__dirname, '..', '..', '..', '..');
      const dir = join(root, 'docs', 'baselines');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const artifact = {
        kind: 'live-memory-eval-llm-extraction',
        capturedAt: new Date().toISOString(),
        commitSha: execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(),
        baseUrlHost: new URL(process.env['EXTRACTION_BASE_URL'] as string).host,
        extractionModel: model,
        retrieval: 'keyword (variable under test: extraction quality)',
        persistence: 'in-memory client (plumbing proven separately by env gate)',
        perScenario,
        overall,
      };
      const file = join(
        dir,
        `live-memory-eval-llm-${artifact.capturedAt.replace(/[:.]/g, '-')}.json`,
      );
      writeFileSync(file, JSON.stringify(artifact, null, 2) + '\n');
      console.log(`artifact: ${file}`);

      expect(overall.totalQueries).toBeGreaterThan(0);
    },
  );
});
