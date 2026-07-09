// ============================================================================
// M11d — Live memory smoke check (real Postgres, no OpenAI required)
//
// Proves the REAL (non-mock) memory pipeline works end-to-end against the live
// stack for the parts that DON'T need OpenAI: real PrismaMemoryStore (Postgres),
// real DefaultMemoryExtractor (rule-based), real keyword retriever. This is the
// storage + retrieval half of the M11d pipeline; embeddings + LLM extraction are
// exercised separately by scripts/memory-baseline.mts once OPENAI_API_KEY is set.
//
// Run:
//   docker compose -f docker-compose.dev.yml up -d postgres
//   DATABASE_URL=postgresql://quant:quant_secret@localhost:5432/quantdb \
//     pnpm tsx scripts/memory-smoke.mts
// ============================================================================

import { randomUUID } from 'node:crypto';
import { prisma } from '@quant/database';
import { createMemoryService } from '@quant/ai';

async function main(): Promise<void> {
  const service = createMemoryService({ prisma: prisma as never });
  const actor = `smoke:${randomUUID()}`;
  const session = 'smoke';

  // 1. Observe a small real conversation (rule extractor writes to Postgres).
  const turns = [
    { role: 'user', content: 'My name is Kundan' },
    { role: 'user', content: 'I live in Patna' },
    { role: 'user', content: 'I work at OpenAI' },
    { role: 'assistant', content: 'Noted!' },
  ];
  const tWriteStart = Date.now();
  for (const t of turns) {
    await service.observe({ actor, session, role: t.role, content: t.content });
  }
  const writeMs = Date.now() - tWriteStart;

  // 2. Recall through the real keyword retriever (real Postgres read).
  const queries = ['what is my name', 'where do I live', 'where do I work'];
  const results: Array<{ query: string; latencyMs: number; recalled: string[] }> = [];
  for (const query of queries) {
    const start = Date.now();
    const recalled = await service.recall({ actor, query });
    results.push({
      query,
      latencyMs: Date.now() - start,
      recalled: recalled.map((r) => r.content),
    });
  }

  // 3. Report (real numbers from the live DB round-trip).
  const hitRate = results.filter((r) => r.recalled.length > 0).length / results.length;
  const avgRecallMs = results.reduce((a, r) => a + r.latencyMs, 0) / results.length;

  // eslint-disable-next-line no-console
  console.log('=== M11d live smoke (real Postgres, rule extractor + keyword retriever) ===');
  // eslint-disable-next-line no-console
  console.log(`observe: ${turns.length} turns in ${writeMs}ms`);
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(`recall "${r.query}" (${r.latencyMs}ms): ${JSON.stringify(r.recalled)}`);
  }
  // eslint-disable-next-line no-console
  console.log(`memory hit rate: ${(hitRate * 100).toFixed(0)}% · avg recall: ${avgRecallMs.toFixed(1)}ms`);

  // 4. Clean up this smoke actor's rows (best-effort; leave the DB as we found it).
  try {
    await (prisma as unknown as {
      memoryRecord: { deleteMany: (a: { where: { ownerId: string } }) => Promise<unknown> };
    }).memoryRecord.deleteMany({ where: { ownerId: actor } });
  } catch {
    /* best-effort cleanup */
  }
  await prisma.$disconnect();
}

void main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('Smoke check failed:', err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
