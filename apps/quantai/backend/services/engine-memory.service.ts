// ============================================================================
// QuantAI — Engine Memory Composition (M11c follow-up)
//
// Builds the EngineMemory `next` backend that wires the REAL observe/recall
// path into AIEngine (the engine-memory.ts "NOT wired into AIEngine yet" TODO).
//
// Stack: createMemoryService({ prisma }) → DefaultMemoryService
//   (PrismaMemoryStore durable writes to memory_records +
//    PrismaMemoryRetriever keyword/recency reads — NO vector backend, NO
//    Qdrant, NO embedding API key required)
// → adapted via MemoryServiceEngineMemory to the engine's enrich/record
// pairing model.
//
// Mode is env-controlled (QUANTAI_ENGINE_MEMORY_MODE): legacy | dual_write |
// shadow. Default is `dual_write` when a database is available, `legacy`
// otherwise. `dual_write` keeps legacy (ContextManager) reads authoritative —
// chat behavior is byte-identical to today — while the durable backend
// receives best-effort writes. 'new' is rejected: the ADR-011 release gate
// (same rule as the route-level facade) requires human approval.
//
// Fail-open contract: this function NEVER throws. Any misconfiguration or
// construction error is logged and returns undefined → the caller keeps the
// legacy engine. A memory failure must never break a chat response.
// ============================================================================

import {
  createMemoryService,
  MemoryServiceEngineMemory,
  type EngineMemory,
  type MemoryDbClient,
} from '@quant/ai';

export type EngineMemoryWireMode = 'legacy' | 'dual_write' | 'shadow';

export interface EngineMemoryWiring {
  mode: EngineMemoryWireMode;
  next: EngineMemory;
}

const VALID_MODES: EngineMemoryWireMode[] = ['legacy', 'dual_write', 'shadow'];

export function resolveEngineMemoryMode(env: NodeJS.ProcessEnv = process.env): EngineMemoryWireMode {
  const configured = env['QUANTAI_ENGINE_MEMORY_MODE'];
  if (configured === undefined) return 'dual_write';
  const normalized = configured.trim().toLowerCase();
  if (normalized === 'new') {
    throw new Error(
      "QUANTAI_ENGINE_MEMORY_MODE='new' is blocked until the ADR-011 release gate is approved.",
    );
  }
  if ((VALID_MODES as string[]).includes(normalized)) return normalized as EngineMemoryWireMode;
  throw new Error(
    `Unsupported QUANTAI_ENGINE_MEMORY_MODE '${configured}'. Valid: ${VALID_MODES.join(', ')}.`,
  );
}

/**
 * Build the durable engine-memory wiring, or return undefined to keep the
 * legacy engine. Never throws — logs and degrades on any problem.
 */
export function buildEngineMemoryWiring(
  prisma: unknown,
  env: NodeJS.ProcessEnv = process.env,
  log?: { info: (msg: string) => void; warn: (msg: string) => void },
): EngineMemoryWiring | undefined {
  if (!prisma || !env['DATABASE_URL']) {
    log?.info('engine memory: no database — legacy ContextManager path (ephemeral)');
    return undefined;
  }

  let mode: EngineMemoryWireMode;
  try {
    mode = resolveEngineMemoryMode(env);
  } catch (err) {
    // Loud misconfiguration, but fail open: a bad env var must not crash boot.
    log?.warn(
      `engine memory: ${(err as Error).message} — falling back to legacy mode`,
    );
    return undefined;
  }

  if (mode === 'legacy') {
    log?.info('engine memory: QUANTAI_ENGINE_MEMORY_MODE=legacy — ContextManager path');
    return undefined;
  }

  try {
    const backend = createMemoryService({ prisma: prisma as MemoryDbClient });
    const next: EngineMemory = new MemoryServiceEngineMemory(backend, {
      defaultSession: 'engine',
      recallLimit: 8,
    });
    log?.info(`engine memory: durable backend wired (mode=${mode}, keyword/recency retriever)`);
    return { mode, next };
  } catch (err) {
    log?.warn(`engine memory: wiring failed (${(err as Error).message}) — legacy fallback`);
    return undefined;
  }
}
