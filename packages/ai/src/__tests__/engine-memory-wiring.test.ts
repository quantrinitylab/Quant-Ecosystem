// ============================================================================
// Engine memory wiring tests (M11c follow-up).
//
// Covers: the real observe/recall path adapter (MemoryServiceEngineMemory),
// the EngineMemoryFacade fail-open contract in dual_write mode (a memory
// failure must never break a chat response), and AIEngine construction with
// the new engineMemory option (legacy default untouched).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  EngineMemoryFacade,
  LegacyEngineMemory,
  MemoryServiceEngineMemory,
  type EngineMemory,
} from '../core/engine-memory';
import type { MemoryBackend } from '../core/memory-facade';
import type { ConversationMessage } from '../types';
import { AIEngine } from '../core/engine';

function makeLegacy(): { legacy: EngineMemory; calls: string[] } {
  const calls: string[] = [];
  const legacy: EngineMemory = {
    enrich: async (_u: string, prompt: string, _c: ConversationMessage[]) => {
      calls.push(`enrich:${prompt}`);
      return `legacy:${prompt}`;
    },
    record: async (_u: string, m: string, _r: string) => {
      calls.push(`record:${m}`);
    },
  };
  return { legacy, calls };
}

function makeBackend(): { backend: MemoryBackend; observed: unknown[]; recalled: unknown[] } {
  const observed: unknown[] = [];
  const recalled: unknown[] = [];
  const backend: MemoryBackend = {
    observe: async (turn) => {
      observed.push(turn);
    },
    recall: async (ctx) => {
      recalled.push(ctx);
      return [{ id: 'm1', content: 'user likes dark mode', source: 'test', relevance: 0.9, backend: 'test' }];
    },
  };
  return { backend, observed, recalled };
}

describe('MemoryServiceEngineMemory (real observe/recall adapter)', () => {
  it('record() observes both the user and assistant turns', async () => {
    const { backend, observed } = makeBackend();
    const mem = new MemoryServiceEngineMemory(backend, { defaultSession: 's1' });

    await mem.record('u1', 'hello', 'hi there');

    expect(observed).toHaveLength(2);
    expect(observed[0]).toMatchObject({ actor: 'u1', session: 's1', role: 'user', content: 'hello' });
    expect(observed[1]).toMatchObject({
      actor: 'u1',
      session: 's1',
      role: 'assistant',
      content: 'hi there',
    });
  });

  it('enrich() recalls and assembles a prompt preamble', async () => {
    const { backend, recalled } = makeBackend();
    const mem = new MemoryServiceEngineMemory(backend, { recallLimit: 3 });

    const enriched = await mem.enrich('u1', 'what theme?', [{ role: 'user', content: 'hi' }]);

    expect(recalled).toHaveLength(1);
    expect(recalled[0]).toMatchObject({ actor: 'u1', query: 'what theme?', limit: 3 });
    expect(enriched).toContain('Relevant context from previous interactions:');
    expect(enriched).toContain('user likes dark mode');
    expect(enriched).toContain('user: what theme?');
  });
});

describe('EngineMemoryFacade dual_write fail-open contract', () => {
  it('record() never rejects when the new backend throws (legacy still authoritative)', async () => {
    const { legacy, calls } = makeLegacy();
    const throwingNext: EngineMemory = {
      enrich: async () => {
        throw new Error('db down');
      },
      record: async () => {
        throw new Error('db down');
      },
    };
    const errors: unknown[] = [];
    const facade = new EngineMemoryFacade({
      mode: 'dual_write',
      legacy,
      next: throwingNext,
      onSecondaryWriteError: (err) => {
        errors.push(err);
      },
    });

    // Must not throw: a memory failure must never break a chat response.
    await facade.record('u1', 'hello', 'hi');

    expect(calls).toContain('record:hello');
    expect(errors).toHaveLength(1);
  });

  it('enrich() in dual_write still serves the legacy (authoritative) prompt', async () => {
    const { legacy } = makeLegacy();
    const throwingNext: EngineMemory = {
      enrich: async () => {
        throw new Error('db down');
      },
      record: async () => {},
    };
    const facade = new EngineMemoryFacade({ mode: 'dual_write', legacy, next: throwingNext });

    const enriched = await facade.enrich('u1', 'hello', []);
    expect(enriched).toBe('legacy:hello');
  });

  it('legacy mode without next keeps the previous default behavior', async () => {
    const ctx = { enrichPrompt: async (_u: string, p: string) => `ctx:${p}`, addToHistory: async () => {} };
    const facade = new EngineMemoryFacade({
      mode: 'legacy',
      legacy: new LegacyEngineMemory(ctx as never),
    });
    expect(await facade.enrich('u1', 'hi', [])).toBe('ctx:hi');
    expect(facade.getMode()).toBe('legacy');
  });
});

describe('AIEngine engineMemory option', () => {
  it('constructs with a wired next backend (dual_write default)', () => {
    const { backend } = makeBackend();
    const next = new MemoryServiceEngineMemory(backend);
    // Must not throw: wiring the real path is a construction-time concern.
    const engine = new AIEngine({ engineMemory: { next } });
    expect(engine).toBeDefined();
  });

  it('constructs without the option exactly as before (legacy default)', () => {
    const engine = new AIEngine({ enableCaching: false });
    expect(engine).toBeDefined();
  });
});
