// ============================================================================
// QuantAI Memory Facade integration tests (M11c Priority 3: migration safety)
//
// Proves, per ADR-011 / M11c success definition:
//   1. legacy mode (default) touches ONLY the existing store — behavior today.
//   2. dual_write never affects the user-visible result.
//   3. shadow collects evidence (ShadowReports) without changing answers.
//   4. Canary modes remain reversible without enabling unapproved `new` authority.
//   5. Unknown and unapproved explicit modes fail startup; only an absent value
//      defaults to legacy.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { MemoryService } from '../services/memory.service';
import {
  createQuantaiMemoryFacade,
  resolveFacadeMode,
  QuantaiMemoryConfigurationError,
  type QuantaiMemoryFacade,
  type QuantaiMemoryFacadeOptions,
  type QuantaiVectorConfig,
} from '../services/memory-facade.service';
import type { FacadeMode } from '@quant/ai';
import { createInMemoryMemoryDb } from '../../../../packages/ai/src/core/in-memory-memory-db';

type CanaryMode = Exclude<FacadeMode, 'new'>;

const durableDependencies = (
  mode: Exclude<CanaryMode, 'legacy'>,
): Pick<QuantaiMemoryFacadeOptions, 'database' | 'vector' | 'shadowSink'> => {
  const client = createInMemoryMemoryDb();
  const vectorConfig: QuantaiVectorConfig = {
    embedder: {
      provider: 'test',
      model: 'deterministic',
      dimension: 2,
      embed: async () => [1, 0],
    },
    vectorBackend: {
      name: 'test-vector',
      upsert: async () => undefined,
      query: async () => [],
    },
    embeddingClient: {
      memoryEmbedding: { create: async () => ({}) },
    },
  };

  return {
    database: { durability: 'durable', client },
    vector: { durability: 'durable', config: vectorConfig },
    ...(mode === 'shadow'
      ? {
          shadowSink: {
            durability: 'durable' as const,
            emit: async () => undefined,
          },
        }
      : {}),
  };
};

const optionsFor = (mode: CanaryMode, service: MemoryService): QuantaiMemoryFacadeOptions => ({
  legacyService: service,
  mode,
  ...(mode === 'legacy' ? {} : durableDependencies(mode)),
});

const build = (
  mode: CanaryMode,
  service = new MemoryService(),
): QuantaiMemoryFacade & { service: MemoryService } => {
  const f = createQuantaiMemoryFacade(optionsFor(mode, service));
  return { ...f, service };
};

describe('resolveFacadeMode', () => {
  it('defaults to legacy only when the env value is absent', () => {
    expect(resolveFacadeMode({} as NodeJS.ProcessEnv)).toBe('legacy');
  });

  it('rejects an invalid explicit mode with a structured startup error', () => {
    expect(() => resolveFacadeMode({ QUANTAI_MEMORY_MODE: 'chaos' } as NodeJS.ProcessEnv)).toThrow(
      QuantaiMemoryConfigurationError,
    );

    try {
      resolveFacadeMode({ QUANTAI_MEMORY_MODE: 'chaos' } as NodeJS.ProcessEnv);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'MEMORY_CANARY_CONFIGURATION_INVALID',
        requestedMode: 'chaos',
        missing: ['valid_mode'],
      });
    }
  });

  it('honors canary modes case-insensitively', () => {
    expect(resolveFacadeMode({ QUANTAI_MEMORY_MODE: 'SHADOW' } as NodeJS.ProcessEnv)).toBe(
      'shadow',
    );
    expect(resolveFacadeMode({ QUANTAI_MEMORY_MODE: 'dual_write' } as NodeJS.ProcessEnv)).toBe(
      'dual_write',
    );
  });

  it('rejects new authority until the ADR-011 release gate is approved', () => {
    expect(() => resolveFacadeMode({ QUANTAI_MEMORY_MODE: 'new' } as NodeJS.ProcessEnv)).toThrow(
      /release gate/,
    );

    try {
      resolveFacadeMode({ QUANTAI_MEMORY_MODE: 'new' } as NodeJS.ProcessEnv);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'MEMORY_CANARY_CONFIGURATION_INVALID',
        requestedMode: 'new',
        missing: ['new_authority_approval'],
      });
    }
  });
});

describe('fail-closed canary dependencies', () => {
  it.each(['dual_write', 'shadow'] as const)(
    'rejects %s without durable database/vector dependencies',
    (mode) => {
      expect(() => createQuantaiMemoryFacade({ legacyService: new MemoryService(), mode })).toThrow(
        QuantaiMemoryConfigurationError,
      );
    },
  );

  it('rejects programmatic new authority even when durable dependencies are present', () => {
    const dependencies = durableDependencies('shadow');
    expect(() =>
      createQuantaiMemoryFacade({
        legacyService: new MemoryService(),
        mode: 'new',
        database: dependencies.database,
        vector: dependencies.vector,
      }),
    ).toThrow(/release gate/);
  });

  it('reports every missing shadow dependency with a stable error code', () => {
    try {
      createQuantaiMemoryFacade({ legacyService: new MemoryService(), mode: 'shadow' });
      expect.unreachable('shadow startup should fail closed');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'MEMORY_CANARY_CONFIGURATION_INVALID',
        requestedMode: 'shadow',
        missing: ['database', 'vector', 'shadow_report_sink'],
      });
    }
  });

  it('requires the durable report sink only for shadow mode', () => {
    const service = new MemoryService();
    const dependencies = durableDependencies('shadow');
    expect(() =>
      createQuantaiMemoryFacade({
        legacyService: service,
        mode: 'shadow',
        database: dependencies.database,
        vector: dependencies.vector,
      }),
    ).toThrow(/shadow_report_sink/);
  });
});

describe('legacy mode (default)', () => {
  it('observe lands in the existing store as a PENDING candidate (review flow intact)', async () => {
    const { facade, service } = build('legacy');
    await facade.observe({
      actor: 'u1',
      session: 's1',
      role: 'user',
      content: 'I prefer dark mode',
    });

    const pending = service.getPendingCandidates('u1');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.content).toBe('I prefer dark mode');
    expect(service.listMemories('u1')).toHaveLength(0); // not active until approved
  });

  it('recall reads from the existing store only', async () => {
    const { facade, service } = build('legacy');
    service.createMemory('u1', {
      category: 'preferences',
      content: 'dark mode always',
      source: 'test',
      sourceApp: 'quantai',
      explanation: 'test',
      writeSignal: 'explicit',
      accessScopes: ['quantai'],
      tags: [],
    });

    const results = await facade.recall({ actor: 'u1', query: 'dark' });
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe('dark mode always');
    expect(results[0]?.source).toBe('quantai-store');
  });

  it('collects no shadow reports in legacy mode', async () => {
    const { facade, shadowReports } = build('legacy');
    await facade.recall({ actor: 'u1', query: 'anything' });
    expect(shadowReports).toHaveLength(0);
  });
});

describe('dual_write mode', () => {
  it('user-visible result is identical to legacy; new subsystem write is best-effort', async () => {
    const service = new MemoryService();
    const legacyOnly = build('legacy', service);
    const dual = createQuantaiMemoryFacade(optionsFor('dual_write', service));

    await dual.facade.observe({
      actor: 'u2',
      session: 's',
      role: 'user',
      content: 'I live in Patna',
    });
    // Legacy store received it exactly as legacy mode would:
    expect(service.getPendingCandidates('u2')).toHaveLength(1);

    // Read path stays legacy-authoritative:
    service.createMemory('u2', {
      category: 'preferences',
      content: 'chai over coffee',
      source: 't',
      sourceApp: 'quantai',
      explanation: 't',
      writeSignal: 'explicit',
      accessScopes: ['quantai'],
      tags: [],
    });
    const viaDual = await dual.facade.recall({ actor: 'u2', query: 'chai' });
    const viaLegacy = await legacyOnly.facade.recall({ actor: 'u2', query: 'chai' });
    expect(viaDual.map((r) => r.content)).toEqual(viaLegacy.map((r) => r.content));
  });
});

describe('shadow mode', () => {
  it('answers from legacy AND records a ShadowReport comparing both backends', async () => {
    const service = new MemoryService();
    const { facade, shadowReports } = createQuantaiMemoryFacade(optionsFor('shadow', service));

    service.createMemory('u3', {
      category: 'preferences',
      content: 'weekly summary emails',
      source: 't',
      sourceApp: 'quantai',
      explanation: 't',
      writeSignal: 'explicit',
      accessScopes: ['quantai'],
      tags: [],
    });

    const results = await facade.recall({ actor: 'u3', query: 'summary' });
    expect(results.map((r) => r.content)).toEqual(['weekly summary emails']); // legacy answer
    expect(shadowReports).toHaveLength(1);
    expect(shadowReports[0]?.mode).toBe('shadow');
    expect(shadowReports[0]?.legacy.recalled).toEqual(['weekly summary emails']);
    expect(shadowReports[0]?.divergence).toBeDefined();
  });
});

describe('canary mode reversibility before cutover approval', () => {
  it('LEGACY→DUAL_WRITE→SHADOW→DUAL_WRITE→LEGACY reuses dependencies and preserves authority', async () => {
    const service = new MemoryService();
    const dependencies = durableDependencies('shadow');
    const cycle: CanaryMode[] = ['legacy', 'dual_write', 'shadow', 'dual_write', 'legacy'];
    expect(cycle).not.toContain('new');

    const seeded = service.createMemory('u4', {
      category: 'preferences',
      content: 'seeded memory',
      source: 't',
      sourceApp: 'quantai',
      explanation: 't',
      writeSignal: 'explicit',
      accessScopes: ['quantai'],
      tags: ['keep'],
    });
    let shadowReportCount = 0;

    for (const mode of cycle) {
      const { facade, shadowReports } = createQuantaiMemoryFacade({
        legacyService: service,
        mode,
        ...(mode === 'legacy'
          ? {}
          : {
              database: dependencies.database,
              vector: dependencies.vector,
              ...(mode === 'shadow' ? { shadowSink: dependencies.shadowSink } : {}),
            }),
      });
      await facade.observe({
        actor: 'u4',
        session: `s_${mode}`,
        role: 'user',
        content: `turn in ${mode}`,
      });
      const recalled = await facade.recall({ actor: 'u4', query: 'seeded' });
      expect(recalled.map(({ id, content }) => ({ id, content }))).toEqual([
        { id: seeded.id, content: 'seeded memory' },
      ]);
      expect(shadowReports).toHaveLength(mode === 'shadow' ? 1 : 0);
      shadowReportCount += shadowReports.length;
    }

    const survived = service.getMemory(seeded.id);
    expect(survived?.content).toBe('seeded memory');
    expect(service.listMemories('u4', { search: 'seeded' })).toHaveLength(1);
    expect(shadowReportCount).toBe(1);

    const pending = service.getPendingCandidates('u4');
    expect(pending.filter((candidate) => candidate.content.startsWith('turn in'))).toHaveLength(
      cycle.length,
    );
  });
});
