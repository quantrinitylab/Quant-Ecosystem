import { describe, it, expect, vi } from 'vitest';
import { MemoryFacade, type MemoryBackend, type ShadowReport } from '../core/memory-facade';
import type { ConversationTurn, RetrievedMemory } from '../core/memory-port';

const turn: ConversationTurn = {
  actor: 'u1',
  session: 's1',
  role: 'user',
  content: 'I live in Patna',
};
const hit = (content: string): RetrievedMemory => ({
  id: content,
  content,
  source: 'x',
  relevance: 1,
});

function backend(over: Partial<MemoryBackend> = {}): MemoryBackend {
  return {
    observe: over.observe ?? vi.fn(async () => {}),
    recall: over.recall ?? vi.fn(async () => []),
  };
}

// ─── Routing per mode ─────────────────────────────────────────────────────────

describe('MemoryFacade routing', () => {
  it('legacy mode reads and writes only legacy', async () => {
    const legacy = backend({ recall: vi.fn(async () => [hit('L')]) });
    const next = backend();
    const f = new MemoryFacade({ mode: 'legacy', legacy, next });
    await f.observe(turn);
    const out = await f.recall({ actor: 'u1', query: 'q' });
    expect(legacy.observe).toHaveBeenCalledOnce();
    expect(next.observe).not.toHaveBeenCalled();
    expect(next.recall).not.toHaveBeenCalled();
    expect(out.map((m) => m.content)).toEqual(['L']);
  });

  it('new mode reads and writes only new', async () => {
    const legacy = backend();
    const next = backend({ recall: vi.fn(async () => [hit('N')]) });
    const f = new MemoryFacade({ mode: 'new', legacy, next });
    await f.observe(turn);
    const out = await f.recall({ actor: 'u1', query: 'q' });
    expect(next.observe).toHaveBeenCalledOnce();
    expect(legacy.observe).not.toHaveBeenCalled();
    expect(out.map((m) => m.content)).toEqual(['N']);
  });

  it('dual_write writes both but reads legacy', async () => {
    const legacy = backend({ recall: vi.fn(async () => [hit('L')]) });
    const next = backend();
    const f = new MemoryFacade({ mode: 'dual_write', legacy, next });
    await f.observe(turn);
    const out = await f.recall({ actor: 'u1', query: 'q' });
    expect(legacy.observe).toHaveBeenCalledOnce();
    expect(next.observe).toHaveBeenCalledOnce();
    expect(next.recall).not.toHaveBeenCalled(); // reads legacy only
    expect(out.map((m) => m.content)).toEqual(['L']);
  });
});

// ─── Asymmetric dual-write ────────────────────────────────────────────────────

describe('MemoryFacade asymmetric dual-write', () => {
  it('a secondary (new) write failure never fails the request; it hits the sink', async () => {
    const onSecondaryWriteError = vi.fn();
    const legacy = backend();
    const next = backend({
      observe: vi.fn(async () => {
        throw new Error('new store down');
      }),
    });
    const f = new MemoryFacade({ mode: 'dual_write', legacy, next, onSecondaryWriteError });
    await expect(f.observe(turn)).resolves.toBeUndefined(); // request succeeds
    expect(legacy.observe).toHaveBeenCalledOnce();
    expect(onSecondaryWriteError).toHaveBeenCalledOnce();
  });

  it('a PRIMARY (legacy) write failure DOES fail the request', async () => {
    const legacy = backend({
      observe: vi.fn(async () => {
        throw new Error('legacy down');
      }),
    });
    const f = new MemoryFacade({ mode: 'dual_write', legacy, next: backend() });
    await expect(f.observe(turn)).rejects.toThrow('legacy down');
  });
});

// ─── Shadow mode ───────────────────────────────────────────────────────────────

describe('MemoryFacade shadow mode', () => {
  it('serves legacy to the user and runs new silently', async () => {
    const legacy = backend({ recall: vi.fn(async () => [hit('lives in Patna')]) });
    const next = backend({ recall: vi.fn(async () => [hit('lives in Delhi')]) });
    const reports: ShadowReport[] = [];
    const f = new MemoryFacade({ mode: 'shadow', legacy, next, onShadow: (r) => reports.push(r) });

    const out = await f.recall({ actor: 'u1', query: 'where do I live' });
    // User ALWAYS gets legacy in shadow.
    expect(out.map((m) => m.content)).toEqual(['lives in Patna']);
    // New ran silently and was compared.
    expect(next.recall).toHaveBeenCalledOnce();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.divergence.onlyLegacy).toContain('lives in patna');
    expect(reports[0]?.divergence.onlyNew).toContain('lives in delhi');
    expect(reports[0]?.divergence.agreementRate).toBe(0);
  });

  it('reports full agreement (LOW severity) when both recall the same facts', async () => {
    const legacy = backend({ recall: vi.fn(async () => [hit('lives in Patna')]) });
    const next = backend({ recall: vi.fn(async () => [hit('Lives in  Patna')]) }); // whitespace/case diff only
    const reports: ShadowReport[] = [];
    const f = new MemoryFacade({ mode: 'shadow', legacy, next, onShadow: (r) => reports.push(r) });
    await f.recall({ actor: 'u1', query: 'q' });
    expect(reports[0]?.divergence.agreementRate).toBe(1); // semantic, not byte
    expect(reports[0]?.divergence.severity).toBe('LOW');
  });

  it('swallows a new-path error, still serves legacy, and records it as HIGH', async () => {
    const legacy = backend({ recall: vi.fn(async () => [hit('L')]) });
    const next = backend({
      recall: vi.fn(async () => {
        throw new Error('qdrant down');
      }),
    });
    const reports: ShadowReport[] = [];
    const f = new MemoryFacade({ mode: 'shadow', legacy, next, onShadow: (r) => reports.push(r) });

    const out = await f.recall({ actor: 'u1', query: 'q' });
    expect(out.map((m) => m.content)).toEqual(['L']); // user unaffected
    expect(reports[0]?.next.error).toBe('qdrant down');
    expect(reports[0]?.divergence.severity).toBe('HIGH');
  });

  it('does not require a sink (shadow is optional observability)', async () => {
    const f = new MemoryFacade({
      mode: 'shadow',
      legacy: backend({ recall: vi.fn(async () => [hit('L')]) }),
      next: backend(),
    });
    await expect(f.recall({ actor: 'u1', query: 'q' })).resolves.toBeDefined();
  });

  it('honors a custom severity classifier (safety-critical divergence = CRITICAL)', async () => {
    const legacy = backend({ recall: vi.fn(async () => [hit('allergic to peanuts')]) });
    const next = backend({ recall: vi.fn(async () => []) }); // new lost the allergy
    const reports: ShadowReport[] = [];
    const f = new MemoryFacade({
      mode: 'shadow',
      legacy,
      next,
      onShadow: (r) => reports.push(r),
      classifySeverity: (onlyLegacy) =>
        onlyLegacy.some((c) => c.includes('allergic')) ? 'CRITICAL' : 'LOW',
    });
    await f.recall({ actor: 'u1', query: 'allergies' });
    expect(reports[0]?.divergence.severity).toBe('CRITICAL');
  });
});

// ─── Statelessness / constraint checks ────────────────────────────────────────

describe('MemoryFacade constraints (ADR-011)', () => {
  it('exposes its mode and holds no accumulating state across calls', async () => {
    const legacy = backend({ recall: vi.fn(async () => [hit('L')]) });
    const f = new MemoryFacade({ mode: 'shadow', legacy, next: backend() });
    expect(f.getMode()).toBe('shadow');
    // Repeated calls behave identically (no memoization / accumulation).
    const a = await f.recall({ actor: 'u1', query: 'q' });
    const b = await f.recall({ actor: 'u1', query: 'q' });
    expect(a).toEqual(b);
  });
});
