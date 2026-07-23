import { describe, it, expect, vi } from 'vitest';
import { ContextManager } from '../core/context-manager';
import { LegacyMemoryAdapter } from '../core/legacy-memory-adapter';
import { MemoryFacade, type MemoryBackend, type ShadowReport } from '../core/memory-facade';
import type { ConversationTurn, RetrievedMemory } from '../core/memory-port';
import {
  aggregateShadowReports,
  verifyReproducible,
  evaluateCutoverGates,
} from '../eval/shadow-replay';

const hit = (content: string): RetrievedMemory => ({
  id: content,
  content,
  source: 'x',
  relevance: 1,
});
const backend = (over: Partial<MemoryBackend> = {}): MemoryBackend => ({
  observe: over.observe ?? vi.fn(async () => {}),
  recall: over.recall ?? vi.fn(async () => []),
});

// ─── LegacyMemoryAdapter ──────────────────────────────────────────────────────

describe('LegacyMemoryAdapter', () => {
  it('recalls legacy memories mapped to RetrievedMemory', async () => {
    const cm = new ContextManager();
    await cm.addMemory('u1', 'location', 'I live in Patna', 0.8);
    const adapter = new LegacyMemoryAdapter(cm);

    const out = await adapter.recall({ actor: 'u1', query: 'where do I live' });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.content).toContain('Patna');
    expect(out[0]?.source).toBe('legacy');
  });

  it('observe records a user turn into legacy memory (extraction path)', async () => {
    const cm = new ContextManager();
    const adapter = new LegacyMemoryAdapter(cm);
    const turn: ConversationTurn = {
      actor: 'u1',
      session: 's',
      role: 'user',
      content: 'My name is Kundan',
    };
    await adapter.observe(turn);
    // Legacy extractMemories should have stored user_name.
    const mem = cm.getRelevantMemories('u1', 'what is my name');
    expect(mem.some((m) => m.value.toLowerCase().includes('kundan'))).toBe(true);
  });

  it('ignores non-user turns (legacy is pairing-based)', async () => {
    const cm = new ContextManager();
    const spy = vi.spyOn(cm, 'addToHistory');
    const adapter = new LegacyMemoryAdapter(cm);
    await adapter.observe({ actor: 'u1', session: 's', role: 'assistant', content: 'hello' });
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── Facade + LegacyAdapter in shadow (end-to-end migration harness) ──────────

describe('MemoryFacade shadow with real legacy adapter', () => {
  it('serves legacy, compares new silently, emits a report', async () => {
    const cm = new ContextManager();
    await cm.addMemory('u1', 'location', 'lives in Patna', 0.9);
    const legacy = new LegacyMemoryAdapter(cm);
    const next = backend({ recall: vi.fn(async () => [hit('lives in Bangalore')]) });
    const reports: ShadowReport[] = [];
    const f = new MemoryFacade({ mode: 'shadow', legacy, next, onShadow: (r) => reports.push(r) });

    const out = await f.recall({ actor: 'u1', query: 'where do I live' });
    expect(out.some((m) => m.content.includes('Patna'))).toBe(true); // legacy served
    expect(reports).toHaveLength(1);
    expect(reports[0]?.divergence.onlyNew).toContain('lives in bangalore');
  });
});

// ─── Rollback / mode transitions (reversible FSM) ─────────────────────────────

describe('MemoryFacade mode transitions are reversible', () => {
  it('the same backends produce mode-appropriate routing at every step (forward and back)', async () => {
    const legacy = backend({ recall: vi.fn(async () => [hit('L')]) });
    const next = backend({ recall: vi.fn(async () => [hit('N')]) });
    const mk = (mode: 'legacy' | 'dual_write' | 'shadow' | 'new') =>
      new MemoryFacade({ mode, legacy, next });

    // Forward: legacy → dual_write → shadow → new
    expect((await mk('legacy').recall({ actor: 'u', query: 'q' }))[0]?.content).toBe('L');
    expect((await mk('dual_write').recall({ actor: 'u', query: 'q' }))[0]?.content).toBe('L');
    expect((await mk('shadow').recall({ actor: 'u', query: 'q' }))[0]?.content).toBe('L');
    expect((await mk('new').recall({ actor: 'u', query: 'q' }))[0]?.content).toBe('N');

    // Rollback: new → shadow → dual_write → legacy (identical behavior each step)
    expect((await mk('shadow').recall({ actor: 'u', query: 'q' }))[0]?.content).toBe('L');
    expect((await mk('dual_write').recall({ actor: 'u', query: 'q' }))[0]?.content).toBe('L');
    expect((await mk('legacy').recall({ actor: 'u', query: 'q' }))[0]?.content).toBe('L');
  });
});

// ─── Shadow replay (Agent D) ──────────────────────────────────────────────────

function report(over: Partial<ShadowReport>): ShadowReport {
  return {
    requestId: over.requestId ?? 'r',
    mode: 'shadow',
    actorUserId: over.actorUserId ?? 'u1',
    query: 'q',
    legacy: over.legacy ?? { recalled: ['a'], latencyMs: 5 },
    next: over.next ?? { recalled: ['a'], latencyMs: 6 },
    divergence: over.divergence ?? {
      onlyLegacy: [],
      onlyNew: [],
      agreementRate: 1,
      severity: 'LOW',
    },
    at: 0,
  };
}

describe('shadow replay', () => {
  it('verifies a report is reproducible from its stored outputs', () => {
    const r = report({
      legacy: { recalled: ['lives in patna'], latencyMs: 5 },
      next: { recalled: ['lives in delhi'], latencyMs: 6 },
      divergence: {
        onlyLegacy: ['lives in patna'],
        onlyNew: ['lives in delhi'],
        agreementRate: 0,
        severity: 'CRITICAL',
      },
    });
    expect(verifyReproducible(r)).toBe(true);
  });

  it('detects a tampered (non-reproducible) report', () => {
    const r = report({
      legacy: { recalled: ['a'], latencyMs: 5 },
      next: { recalled: ['b'], latencyMs: 6 },
      divergence: { onlyLegacy: [], onlyNew: [], agreementRate: 1, severity: 'LOW' }, // wrong
    });
    expect(verifyReproducible(r)).toBe(false);
  });

  it('aggregates reports and evaluates cutover gates', () => {
    const reports: ShadowReport[] = [
      report({
        requestId: '1',
        divergence: { onlyLegacy: [], onlyNew: [], agreementRate: 1, severity: 'LOW' },
      }),
      report({
        requestId: '2',
        divergence: { onlyLegacy: ['x'], onlyNew: [], agreementRate: 0.5, severity: 'CRITICAL' },
      }),
    ];
    const agg = aggregateShadowReports(reports);
    expect(agg.total).toBe(2);
    expect(agg.severityCounts.CRITICAL).toBe(1);
    expect(agg.blockingCases).toContain('2');

    const gate = evaluateCutoverGates(agg, 5);
    expect(gate.passed).toBe(false);
    expect(gate.reasons.some((r) => r.includes('critical'))).toBe(true);
  });

  it('passes gates when agreement is perfect, latency is within budget, and no critical/infra issues', () => {
    // Equal latency (delta 0%) so only agreement/critical/infra gates apply.
    const eq = { recalled: ['a'], latencyMs: 5 };
    const reports: ShadowReport[] = [
      report({ requestId: '1', legacy: eq, next: eq }),
      report({ requestId: '2', legacy: eq, next: eq }),
    ];
    const gate = evaluateCutoverGates(aggregateShadowReports(reports), 5);
    expect(gate.passed).toBe(true);
    expect(gate.reasons).toEqual([]);
  });

  it('fails the latency gate when the new path is >10% slower', () => {
    // Default fixture: legacy 5ms, next 6ms → 20% delta.
    const reports: ShadowReport[] = [report({ requestId: '1' })];
    const gate = evaluateCutoverGates(aggregateShadowReports(reports), 5);
    expect(gate.passed).toBe(false);
    expect(gate.reasons.some((r) => r.includes('latency'))).toBe(true);
  });
});
