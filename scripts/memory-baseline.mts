// ============================================================================
// M11d — Live memory baseline runner (glue script)
//
// Wires the REAL Prisma client (@quant/database) into the dependency-injected
// baseline runner (@quant/ai) and freezes the result under docs/baselines/.
//
// Run (requires a running stack + real key — see docs/M11D_BASELINE_PROTOCOL.md):
//   docker compose -f docker-compose.dev.yml up -d postgres qdrant
//   pnpm --filter @quant/database db:migrate
//   OPENAI_API_KEY=sk-... QDRANT_URL=http://localhost:6333 \
//   DATABASE_URL=postgresql://quant:quant_secret@localhost:5432/quantdb \
//     pnpm tsx scripts/memory-baseline.mts
//
// DISCIPLINE: this script only MEASURES. It never tunes prompts, weights, or
// datasets. It fails fast if the key/stack is missing (no silent fake baseline).
// ============================================================================

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@quant/database';
import { composeLiveBaselineDeps, runBaseline, formatBaselineMarkdown } from '@quant/ai';

function commitSha(): string {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  const deps = await composeLiveBaselineDeps({
    prisma: prisma as never,
    embeddingClient: prisma as never,
    commitSha: commitSha(),
    notes: process.env['BASELINE_NOTES'] ?? 'M11d first honest baseline',
  });

  const report = await runBaseline(deps);

  const outDir = join(process.cwd(), 'docs', 'baselines');
  mkdirSync(outDir, { recursive: true });
  const stamp = report.meta.at.replace(/[:.]/g, '-');
  writeFileSync(join(outDir, `baseline-${stamp}.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, `baseline-${stamp}.md`), formatBaselineMarkdown(report));

  // eslint-disable-next-line no-console
  console.log(formatBaselineMarkdown(report));
  // eslint-disable-next-line no-console
  console.log(`\nArchived: docs/baselines/baseline-${stamp}.{json,md}`);
  await prisma.$disconnect();
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Baseline run failed:', err);
  process.exit(1);
});
