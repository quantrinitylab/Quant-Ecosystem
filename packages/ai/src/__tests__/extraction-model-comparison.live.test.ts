// ============================================================================
// Extraction model comparison — LIVE, multi-model (V3 §17 in practice)
//
// "Onboarding a model = running the benchmark suite." This harness runs the
// SAME frozen extraction dataset across a comma-separated list of models on
// an OpenAI-compatible gateway and archives ONE comparison artifact — the
// provider-portfolio evidence the V3 paper requires before routing-table
// entries are added or changed.
//
// GATED: skips unless EXTRACTION_API_KEY + EXTRACTION_BASE_URL +
// EXTRACTION_MODELS (comma-separated) are set.
//
// Run:
//   EXTRACTION_API_KEY=... EXTRACTION_BASE_URL=https://<gateway>/v1 \
//   EXTRACTION_MODELS=deepseek.v3.2,openai.gpt-oss-120b,mistral.ministral-3-8b-instruct \
//   npx vitest run src/__tests__/extraction-model-comparison.live.test.ts
// ============================================================================

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  runExtractionEval,
  ruleExtractorAdapter,
  llmExtractorAdapter,
  formatExtractionDashboard,
  type ExtractionQualityMetrics,
} from '../eval/extraction-eval';
import { LlmExtractionModel } from '../adapters/llm-extraction-model';

const LIVE = Boolean(
  process.env['EXTRACTION_API_KEY'] &&
  process.env['EXTRACTION_BASE_URL'] &&
  process.env['EXTRACTION_MODELS'],
);

describe.skipIf(!LIVE)('extraction model comparison — LIVE multi-model', () => {
  it(
    'benchmarks every listed model on the same dataset and archives one artifact',
    { timeout: 1_800_000 },
    async () => {
      const models = (process.env['EXTRACTION_MODELS'] as string)
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);

      const rows: ExtractionQualityMetrics[] = [await runExtractionEval(ruleExtractorAdapter())];
      const failures: Array<{ model: string; error: string }> = [];

      for (const model of models) {
        try {
          const llm = new LlmExtractionModel({
            apiKey: process.env['EXTRACTION_API_KEY'] as string,
            baseUrl: process.env['EXTRACTION_BASE_URL'] as string,
            model,
          });
          rows.push(await runExtractionEval(llmExtractorAdapter(llm, model)));
        } catch (err) {
          // A model that errors is a RESULT (unavailable on this account/gateway),
          // not a reason to lose the rest of the comparison.
          failures.push({ model, error: String(err).slice(0, 200) });
        }
      }

      console.log(formatExtractionDashboard(rows));
      if (failures.length) {
        console.log('unavailable models:');
        for (const f of failures) console.log(`  ✗ ${f.model}: ${f.error}`);
      }

      // Archive append-only evidence (Law 2).
      const root = join(__dirname, '..', '..', '..', '..');
      const dir = join(root, 'docs', 'baselines');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const artifact = {
        kind: 'extraction-model-comparison',
        capturedAt: new Date().toISOString(),
        commitSha: execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(),
        baseUrlHost: new URL(process.env['EXTRACTION_BASE_URL'] as string).host,
        modelsRequested: models,
        rows,
        unavailable: failures,
      };
      const file = join(
        dir,
        `extraction-model-comparison-${artifact.capturedAt.replace(/[:.]/g, '-')}.json`,
      );
      writeFileSync(file, JSON.stringify(artifact, null, 2) + '\n');
      console.log(`artifact: ${file}`);

      // At least the rule baseline must exist; live rows depend on availability.
      expect(rows.length).toBeGreaterThanOrEqual(1);
    },
  );
});
