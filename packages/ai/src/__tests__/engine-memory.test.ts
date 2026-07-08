import { describe, it, expect, vi } from 'vitest';
import { ContextManager } from '../core/context-manager';
import {
  EngineMemoryFacade,
  LegacyEngineMemory,
  MemoryServiceEngineMemory,
  type EngineMemory,
  type EngineShadowReport,
} from '../core/engine-memory';
import type { MemoryBackend } from '../core/memory-facade';
import type { ConversationMessage } from '../types';
import type { ConversationTurn, RetrievalContext, RetrievedMemory } from '../core/memory-port';

// ─── LegacyEngineMemory: byte-identical delegation to ContextManager ──────────

describe('LegacyEngineMemory', () => {
  it('enrich delegates to ContextManager.enrichPrompt with same args', async () => {
    const cm = new ContextManager();
    const spy = vi.spyOn(cm, 'enrichPrompt');
    const legacy = new LegacyEngineMemory(cm);
    const ctx: ConversationMessage[] = [{ role: 'user', content: 'hi', timestamp: 1 }];

    await legacy.enrich('u1', 'hello', ctx);

    expect(spy).toHaveBeenCalledWith('u1', 'hello', ctx);
  });

  it('record delegates to ContextManager.addToHistory with same args', async () => {
    const cm = new ContextManager();
    const spy = vi.spyOn(cm, 'addToHistory');
    const legacy = new LegacyEngineMemory(cm);

    await legacy.record('u1', 'my question', 'the answer');

    expect(spy).toHaveBeenCalledWith('u1', 'my question', 'the answer');
  });

  it('produces the exact same enriched prompt as calling ContextManager directly', async () => {
    const cmDirect = new ContextManager();
    const cmFacade = new ContextManager();
    await cmDirect.addMemory('u1', 'name', 'my name is Sam', 0.9);
    await cmFacade.addMemory('u1', 'name', 'my name is Sam', 0.9);

    const direct = await cmDirect.enrichPrompt('u1', 'who am i', []);
    const viaLegacy = await new LegacyEngineMemory(cmFacade).enrich('u1', 'who am i', []);

    expect(viaLegacy).toBe(direct);
  });
});

// ─── EngineMemoryFacade: legacy mode is a pure pass-through ───────────────────

describe('EngineMemoryFacade legacy mode', () => {
  it('routes enrich/record straight to legacy (no next required)', async () => {
    const legacy: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('ENRICHED'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const facade = new EngineMemoryFacade({ mode: 'legacy', legacy });

    const out = await facade.enrich('u1', 'p', []);
    await facade.record('u1', 'p', 'r');

    expect(out).toBe('ENRICHED');
    expect(legacy.enrich).toHaveBeenCalledWith('u1', 'p', []);
    expect(legacy.record).toHaveBeenCalledWith('u1', 'p', 'r');
    expect(facade.getMode()).toBe('legacy');
  });

  it('never touches next in legacy mode', async () => {
    const legacy: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('L'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const next: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('N'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const facade = new EngineMemoryFacade({ mode: 'legacy', legacy, next });

    await facade.enrich('u1', 'p', []);
    await facade.record('u1', 'p', 'r');

    expect(next.enrich).not.toHaveBeenCalled();
    expect(next.record).not.toHaveBeenCalled();
  });

  it('requires next for non-legacy modes', () => {
    const legacy: EngineMemory = { enrich: vi.fn(), record: vi.fn() };
    expect(() => new EngineMemoryFacade({ mode: 'shadow', legacy })).toThrow(/requires a 'next'/);
    expect(() => new EngineMemoryFacade({ mode: 'new', legacy })).toThrow(/requires a 'next'/);
    expect(() => new EngineMemoryFacade({ mode: 'dual_write', legacy })).toThrow(
      /requires a 'next'/,
    );
  });
});

// ─── dual_write: asymmetric, legacy authoritative ────────────────────────────

describe('EngineMemoryFacade dual_write mode', () => {
  it('reads from legacy; writes to both (legacy first)', async () => {
    const order: string[] = [];
    const legacy: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('LEGACY'),
      record: vi.fn().mockImplementation(async () => {
        order.push('legacy');
      }),
    };
    const next: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('NEW'),
      record: vi.fn().mockImplementation(async () => {
        order.push('next');
      }),
    };
    const facade = new EngineMemoryFacade({ mode: 'dual_write', legacy, next });

    const out = await facade.enrich('u1', 'p', []);
    await facade.record('u1', 'p', 'r');

    expect(out).toBe('LEGACY');
    expect(next.enrich).not.toHaveBeenCalled();
    expect(order).toEqual(['legacy', 'next']);
  });

  it('swallows secondary write failure and reports it (never fails request)', async () => {
    const legacy: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('LEGACY'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const boom = new Error('new store down');
    const next: EngineMemory = {
      enrich: vi.fn(),
      record: vi.fn().mockRejectedValue(boom),
    };
    const onSecondaryWriteError = vi.fn();
    const facade = new EngineMemoryFacade({
      mode: 'dual_write',
      legacy,
      next,
      onSecondaryWriteError,
    });

    await expect(facade.record('u1', 'p', 'r')).resolves.toBeUndefined();
    expect(onSecondaryWriteError).toHaveBeenCalledWith(boom, {
      userId: 'u1',
      userMessage: 'p',
      assistantResponse: 'r',
    });
  });

  it('a throwing error-sink never impacts the request (ADR-011 constraint 3)', async () => {
    const legacy: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('LEGACY'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const next: EngineMemory = {
      enrich: vi.fn(),
      record: vi.fn().mockRejectedValue(new Error('new store down')),
    };
    const facade = new EngineMemoryFacade({
      mode: 'dual_write',
      legacy,
      next,
      onSecondaryWriteError: () => {
        throw new Error('error sink itself is broken');
      },
    });

    await expect(facade.record('u1', 'p', 'r')).resolves.toBeUndefined();
    expect(legacy.record).toHaveBeenCalledWith('u1', 'p', 'r');
  });
});

// ─── shadow: serve legacy, run new silently, compare, report ──────────────────

describe('EngineMemoryFacade shadow mode', () => {
  it('serves legacy enrichment and emits a shadow report', async () => {
    const legacy: EngineMemory = {
      enrich: vi
        .fn()
        .mockResolvedValue('Relevant context from previous interactions:\n- likes tea\n\nuser: q'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const next: EngineMemory = {
      enrich: vi
        .fn()
        .mockResolvedValue('Relevant context from previous interactions:\n- likes tea\n\nuser: q'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const reports: EngineShadowReport[] = [];
    const facade = new EngineMemoryFacade({
      mode: 'shadow',
      legacy,
      next,
      onShadow: (r) => reports.push(r),
    });

    const out = await facade.enrich('u1', 'q', []);

    expect(out).toBe('Relevant context from previous interactions:\n- likes tea\n\nuser: q');
    expect(reports).toHaveLength(1);
    expect(reports[0]!.divergence.identical).toBe(true);
    expect(reports[0]!.divergence.severity).toBe('LOW');
    expect(reports[0]!.divergence.agreementRate).toBe(1);
  });

  it('classifies a dropped memory as CRITICAL but still serves legacy', async () => {
    const legacy: EngineMemory = {
      enrich: vi
        .fn()
        .mockResolvedValue(
          'Relevant context from previous interactions:\n- allergy: peanuts\n\nuser: q',
        ),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const next: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('user: q'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const reports: EngineShadowReport[] = [];
    const facade = new EngineMemoryFacade({
      mode: 'shadow',
      legacy,
      next,
      onShadow: (r) => reports.push(r),
    });

    const out = await facade.enrich('u1', 'q', []);

    expect(out).toContain('allergy: peanuts');
    expect(reports[0]!.divergence.severity).toBe('CRITICAL');
    expect(reports[0]!.divergence.onlyLegacy).toEqual(['allergy: peanuts']);
  });

  it('a throwing shadow sink never impacts the request (ADR-011 constraint 3)', async () => {
    const legacy: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('user: q'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const next: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('user: q'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const facade = new EngineMemoryFacade({
      mode: 'shadow',
      legacy,
      next,
      onShadow: () => {
        throw new Error('metrics pipeline down');
      },
    });

    await expect(facade.enrich('u1', 'q', [])).resolves.toBe('user: q');
  });

  it('swallows a next-path error, marks HIGH, still serves legacy', async () => {
    const legacy: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('user: q'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const next: EngineMemory = {
      enrich: vi.fn().mockRejectedValue(new Error('recall failed')),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const reports: EngineShadowReport[] = [];
    const facade = new EngineMemoryFacade({
      mode: 'shadow',
      legacy,
      next,
      onShadow: (r) => reports.push(r),
    });

    const out = await facade.enrich('u1', 'q', []);

    expect(out).toBe('user: q');
    expect(reports[0]!.next.error).toBe('recall failed');
    expect(reports[0]!.divergence.severity).toBe('HIGH');
  });
});

// ─── new mode: authoritative next ─────────────────────────────────────────────

describe('EngineMemoryFacade new mode', () => {
  it('routes enrich/record to next only', async () => {
    const legacy: EngineMemory = { enrich: vi.fn(), record: vi.fn() };
    const next: EngineMemory = {
      enrich: vi.fn().mockResolvedValue('NEW'),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const facade = new EngineMemoryFacade({ mode: 'new', legacy, next });

    const out = await facade.enrich('u1', 'p', []);
    await facade.record('u1', 'p', 'r');

    expect(out).toBe('NEW');
    expect(legacy.enrich).not.toHaveBeenCalled();
    expect(legacy.record).not.toHaveBeenCalled();
    expect(next.record).toHaveBeenCalledWith('u1', 'p', 'r');
  });
});

// ─── MemoryServiceEngineMemory adapter (new-path shape) ───────────────────────

describe('MemoryServiceEngineMemory', () => {
  function fakeBackend(recall: RetrievedMemory[]): {
    backend: MemoryBackend;
    observed: ConversationTurn[];
  } {
    const observed: ConversationTurn[] = [];
    const backend: MemoryBackend = {
      observe: async (turn) => {
        observed.push(turn);
      },
      recall: async (_ctx: RetrievalContext) => recall,
    };
    return { backend, observed };
  }

  it('enrich assembles recalled contents like the legacy textual shape', async () => {
    const { backend } = fakeBackend([
      { id: '1', content: 'lives in Patna', source: 'new', relevance: 0.9 },
    ]);
    const mem = new MemoryServiceEngineMemory(backend);

    const enriched = await mem.enrich('u1', 'where do i live', []);

    expect(enriched).toBe(
      'Relevant context from previous interactions:\n- lives in Patna\n\nuser: where do i live',
    );
  });

  it('record observes a user turn then an assistant turn', async () => {
    const { backend, observed } = fakeBackend([]);
    const mem = new MemoryServiceEngineMemory(backend, { defaultSession: 's1' });

    await mem.record('u1', 'question', 'answer');

    expect(observed).toEqual([
      { actor: 'u1', session: 's1', role: 'user', content: 'question' },
      { actor: 'u1', session: 's1', role: 'assistant', content: 'answer' },
    ]);
  });
});
