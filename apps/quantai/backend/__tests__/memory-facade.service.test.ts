// ============================================================================
// QuantAI Memory Facade integration tests (M11c Priority 3: migration safety)
//
// Proves, per ADR-011 / M11c success definition:
//   1. legacy mode (default) touches ONLY the existing store — behavior today.
//   2. dual_write never affects the user-visible result.
//   3. shadow collects evidence (ShadowReports) without changing answers.
//   4. Full mode cycle LEGACY→DUAL_WRITE→SHADOW→NEW→SHADOW→LEGACY is
//      reversible with no state corruption of the legacy store.
//   5. Unknown env values fall back to legacy (fail-safe).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { MemoryService } from '../services/memory.service';
import {
  createQuantaiMemoryFacade,
  resolveFacadeMode,
  type QuantaiMemoryFacade,
} from '../services/memory-facade.service';
import type { FacadeMode } from '@quant/ai';

const build = (
  mode: FacadeMode,
  service = new MemoryService(),
): QuantaiMemoryFacade & { service: MemoryService } => {
  const f = createQuantaiMemoryFacade({ legacyService: service, mode });
  return { ...f, service };
};

describe('resolveFacadeMode', () => {
  it('defaults to legacy when env is unset or invalid (fail-safe)', () => {
    expect(resolveFacadeMode({} as NodeJS.ProcessEnv)).toBe('legacy');
    expect(resolveFacadeMode({ QUANTAI_MEMORY_MODE: 'chaos' } as NodeJS.ProcessEnv)).toBe('legacy');
  });

  it('honors valid modes case-insensitively', () => {
    expect(resolveFacadeMode({ QUANTAI_MEMORY_MODE: 'SHADOW' } as NodeJS.ProcessEnv)).toBe(
      'shadow',
    );
    expect(resolveFacadeMode({ QUANTAI_MEMORY_MODE: 'dual_write' } as NodeJS.ProcessEnv)).toBe(
      'dual_write',
    );
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
    const dual = createQuantaiMemoryFacade({ legacyService: service, mode: 'dual_write' });

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
    const { facade, shadowReports } = createQuantaiMemoryFacade({
      legacyService: service,
      mode: 'shadow',
    });

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

describe('mode cycle reversibility (M11c Priority 3)', () => {
  it('LEGACY→DUAL_WRITE→SHADOW→NEW→SHADOW→LEGACY leaves the legacy store uncorrupted', async () => {
    const service = new MemoryService();
    const cycle: FacadeMode[] = ['legacy', 'dual_write', 'shadow', 'new', 'shadow', 'legacy'];

    // Seed one explicit memory that must survive the whole journey untouched.
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

    for (const mode of cycle) {
      const { facade } = createQuantaiMemoryFacade({ legacyService: service, mode });
      await facade.observe({
        actor: 'u4',
        session: `s_${mode}`,
        role: 'user',
        content: `turn in ${mode}`,
      });
      await facade.recall({ actor: 'u4', query: 'seeded' });
    }

    // The seeded memory is intact — no corruption, no loss, no duplication.
    const survived = service.getMemory(seeded.id);
    expect(survived?.content).toBe('seeded memory');
    expect(service.listMemories('u4', { search: 'seeded' })).toHaveLength(1);

    // Legacy-writing modes (all except 'new') each produced exactly one pending
    // candidate — nothing double-wrote.
    const pending = service.getPendingCandidates('u4');
    expect(pending.filter((p) => p.content.startsWith('turn in'))).toHaveLength(
      cycle.filter((m) => m !== 'new').length,
    );
  });
});
