// ============================================================================
// M11d — Live Qdrant integration check (real Qdrant, no OpenAI required)
//
// Proves the REAL QdrantVectorBackend adapter works against the live Qdrant:
// collection create → upsert points (with owner) → owner-scoped vector query →
// verify the owner filter never crosses users → cleanup.
//
// Uses DETERMINISTIC test vectors (not OpenAI embeddings) so it verifies the
// TRANSPORT + owner-scoping integration independently of the OpenAI key. The
// semantic quality baseline (real embeddings) is captured by memory-baseline.mts
// once OPENAI_API_KEY is set. This is a connectivity/integration check, not the
// semantic baseline — labeled honestly.
//
// Run:
//   docker compose -f docker-compose.dev.yml up -d qdrant
//   QDRANT_URL=http://localhost:6333 pnpm tsx scripts/qdrant-smoke.mts
// ============================================================================

import { QdrantVectorBackend, toPointId } from '@quant/ai';

const QDRANT_URL = process.env['QDRANT_URL'] ?? 'http://localhost:6333';
const COLLECTION = 'quant_memories_smoke';
const DIM = 8;

async function qdrant(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${QDRANT_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** A deterministic unit-ish vector from an id (NOT a semantic embedding). */
function testVector(seed: number): number[] {
  const v = Array.from({ length: DIM }, (_, i) => Math.sin(seed * (i + 1)));
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

async function main(): Promise<void> {
  // 1. Create the collection (the adapter upserts/queries but does not create).
  await qdrant(`/collections/${COLLECTION}`, 'PUT', {
    vectors: { size: DIM, distance: 'Cosine' },
  });

  const backend = new QdrantVectorBackend({ url: QDRANT_URL, collection: COLLECTION });

  // 2. Upsert real points for two owners.
  const alice = 'user_alice';
  const bob = 'user_bob';
  await backend.upsert({ id: 'mem_a1', vector: testVector(1), ownerId: alice });
  await backend.upsert({ id: 'mem_a2', vector: testVector(2), ownerId: alice });
  await backend.upsert({ id: 'mem_b1', vector: testVector(3), ownerId: bob });

  // Qdrant indexes asynchronously; give it a moment.
  await new Promise((r) => setTimeout(r, 500));

  // 3. Owner-scoped query: querying as alice must NEVER return bob's point.
  const aliceHits = await backend.query({ vector: testVector(1), ownerId: alice, limit: 5 });
  const bobHits = await backend.query({ vector: testVector(3), ownerId: bob, limit: 5 });

  const aliceIds = aliceHits.map((h) => h.id);
  const bobIds = bobHits.map((h) => h.id);
  const leak = aliceIds.includes('mem_b1') || bobIds.some((id) => id.startsWith('mem_a'));

  // eslint-disable-next-line no-console
  console.log('=== M11d live Qdrant integration (real adapter → live Qdrant) ===');
  // eslint-disable-next-line no-console
  console.log(`point id mapping (cuid → uuid): mem_a1 → ${toPointId('mem_a1')}`);
  // eslint-disable-next-line no-console
  console.log(`alice query hits: ${JSON.stringify(aliceIds)}`);
  // eslint-disable-next-line no-console
  console.log(`bob query hits:   ${JSON.stringify(bobIds)}`);
  // eslint-disable-next-line no-console
  console.log(`owner isolation:  ${leak ? 'FAIL — cross-owner leak!' : 'OK — no cross-owner leak'}`);
  // eslint-disable-next-line no-console
  console.log(`self-recall:      alice sees mem_a1=${aliceIds.includes('mem_a1')}`);

  // 4. Cleanup: drop the smoke collection.
  await qdrant(`/collections/${COLLECTION}`, 'DELETE');

  if (leak || !aliceIds.includes('mem_a1')) process.exit(1);
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Qdrant smoke failed:', err);
  process.exit(1);
});
