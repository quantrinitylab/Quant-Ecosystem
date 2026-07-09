// ============================================================================
// Extraction Quality — LIVE run (real LLM vs rule baseline, side by side)
//
// The single most important measurement in the memory subsystem (per the CEO
// review: assistants are extraction-limited long before they are graph-
// limited). Runs the SAME labeled dataset through the rule extractor and a
// REAL LLM extractor, and archives the comparison as an append-only artifact.
//
// GATED: skips unless EXTRACTION_API_KEY + EXTRACTION_BASE_URL are set.
// Works with any OpenAI-compatible /chat/completions endpoint (OpenAI, or
// Bedrock's OpenAI-compatible gateway). Model via EXTRACTION_MODEL.
//
// Run:
//   EXTRACTION_API_KEY=... \
//   EXTRACTION_BASE_URL=https://<gateway>/v1 \
//   EXTRACTION_MODEL=deepseek.v3.2 \
//   npx vitest run src/__tests__/extraction-eval-live.test.ts
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
} from '../eval/extraction-eval';
import { LlmExtractionModel } from '../adapters/llm-extraction-model';

const LIVE = Boolean(process.env['EXTRACTION_API_KEY'] && process.env['EXTRACTION_BASE_URL']);

describe.skipIf(!LIVE)('extraction quality — LIVE (real LLM vs rule)', () => {
  it(
    'measures rule and LLM extractors on the same dataset and archives the artifact',
    { timeout: 900_000 },
    async () => {
      const model = process.env['EXTRACTION_MODEL'] ?? 'gpt-4o-mini';
      const llm = new LlmExtractionModel({
        apiKey: process.env['EXTRACTION_API_KEY'] as string,
        baseUrl: process.env['EXTRACTION_BASE_URL'] as string,
        model,
      });

      const rule = await runExtractionEval(ruleExtractorAdapter());
      const live = await runExtractionEval(llmExtractorAdapter(llm, model));

      console.log(formatExtractionDashboard([rule, live]));

      // Archive append-only evidence (Law 2).
      const root = join(__dirname, '..', '..', '..', '..');
      const dir = join(root, 'docs', 'baselines');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const artifact = {
        kind: 'live-extraction-eval',
        capturedAt: new Date().toISOString(),
        commitSha: execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(),
        baseUrlHost: new URL(process.env['EXTRACTION_BASE_URL'] as string).host,
        extractionModel: model,
        rows: [rule, live],
      };
      const file = join(
        dir,
        `live-extraction-eval-${artifact.capturedAt.replace(/[:.]/g, '-')}.json`,
      );
      writeFileSync(file, JSON.stringify(artifact, null, 2) + '\n');
      console.log(`artifact: ${file}`);

      // Sanity only — this is a measurement run. Numbers are judged against
      // archived artifacts and the decision log, not hardcoded expectations.
      expect(live.totalCandidates).toBeGreaterThanOrEqual(0);
      expect(rule.candidateRecall).toBeGreaterThan(0);
    },
  );
});
