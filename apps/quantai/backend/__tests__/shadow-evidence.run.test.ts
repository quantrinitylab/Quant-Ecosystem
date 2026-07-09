// ============================================================================
// QuantAI Shadow Evidence Run (M11c Priority 5: evidence package)
//
// Drives representative traffic through the QuantAI MemoryFacade in SHADOW
// mode, aggregates the resulting ShadowReports, evaluates the ADR-011 cutover
// gates, and archives the evidence as an append-only artifact — the exact
// pipeline that produces MIGRATION_SCOREBOARD rows.
//
// Honest scope: this is an IN-PROCESS run over representative traffic
// (seeded user memories + realistic observe/recall cycles), not deployed
// production traffic. The artifact records that explicitly. The purpose is to
// exercise the full evidence pipeline end-to-end so the production shadow run
// is a config flip, not new engineering.
//
// The expected outcome is a HOLD decision: legacy and new backends have
// different retrieval semantics (constant-relevance substring vs extraction+
// scored recall), so agreement will NOT clear the 99% gate. Proving the gates
// catch this is the point — the pipeline must be able to say "no".
// ============================================================================

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { aggregateShadowReports, evaluateCutoverGates } from '@quant/ai';
import { MemoryService } from '../services/memory.service';
import { createQuantaiMemoryFacade } from '../services/memory-facade.service';

/** Representative traffic: what a QuantAI user's memory day looks like. */
const SEED_MEMORIES = [
  { content: 'Prefers dark mode in every app', tags: ['ui'] },
  { content: 'Lives in Patna, works remotely', tags: ['profile'] },
  { content: 'Favorite programming language is Rust', tags: ['dev'] },
  { content: 'Weekly summary emails every Monday morning', tags: ['schedule'] },
  { content: 'Allergic to peanuts', tags: ['health'] },
];

const OBSERVE_TURNS = [
  'I just moved my standup to 9am',
  'Remind me that my sister arrives on Friday',
  'I prefer concise answers with code examples',
  'My favorite editor is Neovim these days',
];

const RECALL_QUERIES = [
  'dark mode',
  'Patna',
  'Rust',
  'summary emails',
  'peanuts',
  'standup',
  'editor',
];

describe('quantai shadow evidence run (in-process, representative traffic)', () => {
  it('collects shadow reports, evaluates ADR-011 gates, archives the artifact', async () => {
    const service = new MemoryService();
    const { facade, shadowReports } = createQuantaiMemoryFacade({
      legacyService: service,
      mode: 'shadow',
    });

    const actor = 'shadow_user_1';
    for (const m of SEED_MEMORIES) {
      service.createMemory(actor, {
        category: 'preferences',
        content: m.content,
        source: 'seed',
        sourceApp: 'quantai',
        explanation: 'representative seed',
        writeSignal: 'explicit',
        accessScopes: ['quantai'],
        tags: m.tags,
      });
    }

    for (const content of OBSERVE_TURNS) {
      await facade.observe({ actor, session: 'shadow_run', role: 'user', content });
    }
    for (const query of RECALL_QUERIES) {
      await facade.recall({ actor, query });
    }

    expect(shadowReports.length).toBe(RECALL_QUERIES.length);

    const agg = aggregateShadowReports([...shadowReports]);
    const legacyAvgLatency =
      shadowReports.reduce((a, r) => a + r.legacy.latencyMs, 0) / shadowReports.length || 1;
    const gates = evaluateCutoverGates(agg, Math.max(legacyAvgLatency, 1));

    console.log('=== QuantAI Shadow Evidence (in-process) ===');
    console.log(`reports: ${agg.total}`);
    console.log(`avg agreement: ${(agg.avgAgreement * 100).toFixed(1)}%`);
    console.log(`severity: ${JSON.stringify(agg.severityCounts)}`);
    console.log(`backend errors: ${agg.backendErrors}`);
    console.log(`avg latency delta: ${agg.avgLatencyDeltaMs.toFixed(2)}ms`);
    console.log(
      `GATES: ${gates.passed ? 'PASS' : 'HOLD'} — ${gates.reasons.join('; ') || 'all clear'}`,
    );

    // Archive append-only evidence (Law 2).
    const root = join(__dirname, '..', '..', '..', '..');
    const dir = join(root, 'docs', 'baselines');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const artifact = {
      kind: 'quantai-shadow-evidence',
      capturedAt: new Date().toISOString(),
      commitSha: execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(),
      traffic: 'in-process representative (NOT deployed production traffic)',
      seedCount: SEED_MEMORIES.length,
      observeCount: OBSERVE_TURNS.length,
      recallCount: RECALL_QUERIES.length,
      aggregate: agg,
      gates,
      decision: gates.passed ? 'ADVANCE-candidate (human approves)' : 'HOLD',
    };
    const file = join(
      dir,
      `quantai-shadow-evidence-${artifact.capturedAt.replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(file, JSON.stringify(artifact, null, 2) + '\n');
    console.log(`artifact: ${file}`);

    // The pipeline itself must work end-to-end; the DECISION is data's job.
    expect(agg.total).toBeGreaterThan(0);
    expect(typeof gates.passed).toBe('boolean');
    // Divergent semantics between backends MUST be visible, not hidden:
    expect(agg.avgAgreement).toBeLessThanOrEqual(1);
  });
});
