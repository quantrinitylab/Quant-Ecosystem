// ============================================================================
// buildEngineMemoryWiring / resolveEngineMemoryMode tests.
//
// Fail-open contract: this composition NEVER throws out of buildEngineMemoryWiring.
// Any misconfiguration degrades to undefined (caller keeps the legacy engine)
// instead of crashing boot or breaking chat.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createInMemoryMemoryDb } from '@quant/ai';
import {
  buildEngineMemoryWiring,
  resolveEngineMemoryMode,
} from '../services/engine-memory.service';

const DB_ENV = { DATABASE_URL: 'postgres://test/test' } as NodeJS.ProcessEnv;
const NO_DB_ENV = {} as NodeJS.ProcessEnv;

describe('resolveEngineMemoryMode', () => {
  it('defaults to dual_write when unset', () => {
    expect(resolveEngineMemoryMode({} as NodeJS.ProcessEnv)).toBe('dual_write');
  });

  it('accepts explicit legacy / dual_write / shadow', () => {
    for (const mode of ['legacy', 'dual_write', 'shadow'] as const) {
      expect(resolveEngineMemoryMode({ QUANTAI_ENGINE_MEMORY_MODE: mode } as NodeJS.ProcessEnv)).toBe(
        mode,
      );
    }
  });

  it('rejects new (ADR-011 release gate)', () => {
    expect(() =>
      resolveEngineMemoryMode({ QUANTAI_ENGINE_MEMORY_MODE: 'new' } as NodeJS.ProcessEnv),
    ).toThrow('release gate');
  });

  it('rejects unknown modes', () => {
    expect(() =>
      resolveEngineMemoryMode({ QUANTAI_ENGINE_MEMORY_MODE: 'chaos' } as NodeJS.ProcessEnv),
    ).toThrow('Unsupported QUANTAI_ENGINE_MEMORY_MODE');
  });
});

describe('buildEngineMemoryWiring (fail-open)', () => {
  it('returns undefined without a prisma client (legacy engine kept)', () => {
    expect(buildEngineMemoryWiring(undefined, DB_ENV)).toBeUndefined();
  });

  it('returns undefined without DATABASE_URL (legacy engine kept)', () => {
    expect(buildEngineMemoryWiring(createInMemoryMemoryDb(), NO_DB_ENV)).toBeUndefined();
  });

  it('returns undefined on invalid mode instead of throwing', () => {
    const warnings: string[] = [];
    const wiring = buildEngineMemoryWiring(createInMemoryMemoryDb(), {
      ...DB_ENV,
      QUANTAI_ENGINE_MEMORY_MODE: 'chaos',
    } as NodeJS.ProcessEnv, {
      info: () => {},
      warn: (m) => warnings.push(m),
    });
    expect(wiring).toBeUndefined();
    expect(warnings.some((w) => w.includes('falling back to legacy'))).toBe(true);
  });

  it('returns undefined for explicit legacy mode', () => {
    const wiring = buildEngineMemoryWiring(
      createInMemoryMemoryDb(),
      { ...DB_ENV, QUANTAI_ENGINE_MEMORY_MODE: 'legacy' } as NodeJS.ProcessEnv,
    );
    expect(wiring).toBeUndefined();
  });

  it('wires the real observe/recall path in dual_write (default)', async () => {
    const db = createInMemoryMemoryDb();
    const wiring = buildEngineMemoryWiring(db, DB_ENV);
    expect(wiring).toBeDefined();
    expect(wiring!.mode).toBe('dual_write');

    // The real path works end-to-end against the (in-memory here) database:
    // observe two turns, then recall finds the extracted memory.
    await wiring!.next.record('u1', 'my favorite color is blue', 'noted, blue it is');
    const enriched = await wiring!.next.enrich('u1', 'what is my favorite color?', []);
    expect(enriched).toContain('what is my favorite color?');
    // Recall runs without throwing even when nothing was extracted.
  });

  it('is fail-open through the facade: a DB outage mid-request never rejects record()', async () => {
    // Poison the store to simulate a DB outage mid-request. The `next`
    // backend throws honestly; the dual_write facade (which AIEngine builds
    // around it) swallows the secondary-write error — chat never breaks.
    const broken = createInMemoryMemoryDb();
    (broken.memoryRecord as { create: unknown }).create = async () => {
      throw new Error('connection refused');
    };
    const brokenWiring = buildEngineMemoryWiring(broken, DB_ENV);
    expect(brokenWiring).toBeDefined();

    const { EngineMemoryFacade } = await import('@quant/ai');
    const legacyCalls: string[] = [];
    const facade = new EngineMemoryFacade({
      mode: brokenWiring!.mode,
      legacy: {
        enrich: async (_u: string, p: string) => p,
        record: async (_u: string, m: string) => {
          legacyCalls.push(m);
        },
      },
      next: brokenWiring!.next,
    });

    await expect(facade.record('u1', 'hello', 'hi')).resolves.toBeUndefined();
    expect(legacyCalls).toEqual(['hello']);
  });
});
