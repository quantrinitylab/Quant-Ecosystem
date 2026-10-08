/**
 * QM-QUANTY-002 — unit tests for quanty-inline-context.ts.
 *
 * Proves: evidence validation, context-budget enforcement, preview
 * requirement matrix, cost quoting, provenance completeness.
 */
import { describe, it, expect } from 'vitest';
import {
  QuantyContextError,
  createEvidenceRef,
  isEvidenceRef,
  recordProvenance,
  quantyContextBudgetFor,
  assertQuantyContextBudget,
  quoteCost,
  requiresPreview,
  buildMutationPreview,
  buildOutputEnvelope,
  EVIDENCE_QUOTE_MAX_CHARS,
  QUANTY_INLINE_CONTEXT_BUDGET_BYTES,
  type Capability,
} from '../quanty-inline-context';
import { createResourceRef } from '../resource-ref';

function mailMessageRef(id: string) {
  return createResourceRef({
    appId: 'quantmail',
    resourceType: 'mail.message',
    resourceId: id,
  });
}

function fakeCapability(overrides: Partial<Capability> = {}): Capability {
  return {
    capabilityId: 'mail.thread.archive',
    version: 1,
    appId: 'quantmail',
    domain: 'mailbox',
    kind: 'command',
    owner: { appId: 'quantmail', sourceOfTruth: 'mailbox/thread/message domain' },
    resourceTypes: ['mail.thread'],
    inputSchema: 'mail.thread.archive/v1/input',
    outputSchema: 'mail.thread.archive/v1/output',
    requiredScopes: ['mail:write'],
    riskTier: 2,
    idempotency: { required: true, keyStrategy: 'client-supplied' },
    approval: { required: false },
    verification: { required: true, successEvents: ['mail.thread.archived.v1'], timeoutState: 'unknown' },
    emits: ['mail.thread.archived.v1'],
    degradedMode: { mode: 'fail_closed', userState: 'Mail unavailable.' },
    status: 'active',
    ...overrides,
  };
}

describe('createEvidenceRef', () => {
  it('builds a valid ref from a typed resource ref', () => {
    const ref = createEvidenceRef(mailMessageRef('m-1'), 'Re: launch');
    expect(ref.label).toBe('Re: launch');
    expect(ref.resourceRef.resourceId).toBe('m-1');
    expect(isEvidenceRef(ref)).toBe(true);
  });

  it('fails closed on an untyped/fabricated source', () => {
    expect(() =>
      createEvidenceRef({ not: 'a-ref' } as never, 'x'),
    ).toThrowError(QuantyContextError);
    try {
      createEvidenceRef({ not: 'a-ref' } as never, 'x');
    } catch (e) {
      expect((e as QuantyContextError).code).toBe('EVIDENCE_REF_INVALID');
    }
  });

  it('fails closed on an empty label', () => {
    expect(() => createEvidenceRef(mailMessageRef('m-1'), '   ')).toThrowError(
      QuantyContextError,
    );
  });

  it('truncates long quotes and records the truncation', () => {
    const long = 'q'.repeat(EVIDENCE_QUOTE_MAX_CHARS + 100);
    const ref = createEvidenceRef(mailMessageRef('m-1'), 'Subject', long);
    expect(ref.quote!.length).toBeLessThanOrEqual(EVIDENCE_QUOTE_MAX_CHARS);
    expect(ref.quoteTruncated).toBe(true);
  });

  it('keeps short quotes intact without a truncation flag', () => {
    const ref = createEvidenceRef(mailMessageRef('m-1'), 'Subject', 'short quote');
    expect(ref.quote).toBe('short quote');
    expect(ref.quoteTruncated).toBeUndefined();
  });
});

describe('assertQuantyContextBudget', () => {
  it('returns the measured bytes when under budget', () => {
    const bytes = assertQuantyContextBudget({ text: 'hello' }, 1024);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(1024);
  });

  it('fails closed with CONTEXT_OVER_BUDGET when over budget', () => {
    const big = { text: 'x'.repeat(QUANTY_INLINE_CONTEXT_BUDGET_BYTES + 1) };
    try {
      assertQuantyContextBudget(big);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as QuantyContextError).code).toBe('CONTEXT_OVER_BUDGET');
    }
  });

  it('uses the default governed budget when none is given', () => {
    expect(QUANTY_INLINE_CONTEXT_BUDGET_BYTES).toBe(32 * 1024);
  });

  it('grants higher tiers a larger budget', () => {
    expect(quantyContextBudgetFor(0)).toBe(QUANTY_INLINE_CONTEXT_BUDGET_BYTES);
    expect(quantyContextBudgetFor(3)).toBeGreaterThan(quantyContextBudgetFor(1));
  });
});

describe('requiresPreview', () => {
  it('requires preview for tier-2+ commands', () => {
    expect(requiresPreview(fakeCapability({ kind: 'command', riskTier: 2 }))).toBe(true);
    expect(requiresPreview(fakeCapability({ kind: 'command', riskTier: 3 }))).toBe(true);
    expect(requiresPreview(fakeCapability({ kind: 'command', riskTier: 4 }))).toBe(true);
  });

  it('does not require preview for reads or tier-1 drafts', () => {
    expect(requiresPreview(fakeCapability({ kind: 'query', riskTier: 0 }))).toBe(false);
    expect(requiresPreview(fakeCapability({ kind: 'command', riskTier: 1 }))).toBe(false);
  });
});

describe('quoteCost', () => {
  it('quotes estimated credits from the declared meter', () => {
    const q = quoteCost({ capabilityId: 'mail.ai.reply.suggest', cost: { meter: 'ai.tokens', quoteRequired: false } });
    expect(q.meter).toBe('ai.tokens');
    expect(q.credits).toBeGreaterThan(0);
    expect(q.estimated).toBe(true);
    expect(q.quoteRequired).toBe(false);
  });

  it('returns a live-quote placeholder when the capability requires a quote', () => {
    const q = quoteCost({ capabilityId: 'x', cost: { meter: 'ai.tokens', quoteRequired: true } });
    expect(q.credits).toBe(0);
    expect(q.quoteRequired).toBe(true);
  });

  it('accepts a live quote when provided', () => {
    const q = quoteCost(
      { capabilityId: 'x', cost: { meter: 'ai.tokens', quoteRequired: true } },
      { liveQuoteCredits: 12 },
    );
    expect(q.credits).toBe(12);
    expect(q.estimated).toBe(false);
  });

  it('fails closed when the capability declares no meter', () => {
    try {
      quoteCost({ capabilityId: 'mail.thread.get' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as QuantyContextError).code).toBe('COST_QUOTE_UNAVAILABLE');
    }
  });
});

describe('buildMutationPreview', () => {
  it('builds a complete preview for a tier-2 command', () => {
    const cap = fakeCapability({
      capabilityId: 'mail.thread.archive',
      approval: { required: false },
      cost: { meter: 'ai.tokens', quoteRequired: false },
    });
    const preview = buildMutationPreview({
      capability: cap,
      summary: 'Archive 1 thread',
      changes: [{ description: 'Move thread t-1 to Archive' }],
      reversibility: {
        reversible: true,
        undoCapabilityId: 'mail.thread.restore',
        note: 'Restore from Archive within 30 days.',
      },
      randomSource: () => 'fixed-key',
    });
    expect(preview.capabilityId).toBe('mail.thread.archive');
    expect(preview.requiresApproval).toBe(false);
    expect(preview.cost.credits).toBeGreaterThan(0);
    expect(preview.reversibility.reversible).toBe(true);
    expect(preview.reversibility.undoCapabilityId).toBe('mail.thread.restore');
    expect(preview.idempotencyKey).toBe('fixed-key');
  });

  it('marks tier-3 commands as requiring approval', () => {
    const cap = fakeCapability({
      capabilityId: 'mail.send.execute',
      riskTier: 3,
      approval: { required: true, reason: 'Sending mail is an external side effect.' },
      cost: { meter: 'ai.tokens', quoteRequired: false },
    });
    const preview = buildMutationPreview({
      capability: cap,
      summary: 'Send email',
      changes: [{ description: 'Send to a@example.com' }],
      reversibility: { reversible: true, note: 'Undo send within 30 seconds.' },
      randomSource: () => 'k',
    });
    expect(preview.requiresApproval).toBe(true);
    expect(preview.approvalReason).toContain('external side effect');
  });

  it('refuses to fabricate a preview for a capability that does not need one', () => {
    const cap = fakeCapability({ kind: 'query', riskTier: 0 });
    try {
      buildMutationPreview({
        capability: cap,
        summary: 'Read',
        changes: [{ description: 'x' }],
        reversibility: { reversible: true, note: 'n/a' },
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as QuantyContextError).code).toBe('PREVIEW_REQUIRED');
    }
  });

  it('refuses an empty change list — a preview must show what changes', () => {
    const cap = fakeCapability({ kind: 'command', riskTier: 2 });
    expect(() =>
      buildMutationPreview({
        capability: cap,
        summary: 'Do thing',
        changes: [],
        reversibility: { reversible: true, note: 'n/a' },
      }),
    ).toThrowError(QuantyContextError);
  });
});

describe('recordProvenance', () => {
  it('records a complete provenance record', () => {
    const p = recordProvenance({
      producedBy: 'quanty-model',
      capability: { capabilityId: 'mail.ai.reply.suggest', version: 1 },
      modelId: 'quant-1',
      contextBytes: 4096,
      contextTruncated: false,
      sourceCount: 3,
      at: '2026-10-08T00:00:00.000Z',
    });
    expect(p.producedBy).toBe('quanty-model');
    expect(p.modelId).toBe('quant-1');
    expect(p.capabilityId).toBe('mail.ai.reply.suggest');
    expect(p.contextBytes).toBe(4096);
    expect(p.contextTruncated).toBe(false);
    expect(p.sourceCount).toBe(3);
    expect(p.at).toBe('2026-10-08T00:00:00.000Z');
  });

  it('fails closed on a non-finite context measurement', () => {
    expect(() =>
      recordProvenance({
        producedBy: 'quanty-model',
        capability: { capabilityId: 'x', version: 1 },
        contextBytes: Number.NaN,
        contextTruncated: false,
        sourceCount: 0,
      }),
    ).toThrowError(QuantyContextError);
  });
});

describe('buildOutputEnvelope', () => {
  it('wraps output with evidence, provenance and cost', () => {
    const evidence = [createEvidenceRef(mailMessageRef('m-1'), 'Re: launch', 'see you at 3')];
    const provenance = recordProvenance({
      producedBy: 'quanty-model',
      capability: { capabilityId: 'mail.ai.reply.suggest', version: 1 },
      contextBytes: 100,
      contextTruncated: false,
      sourceCount: 1,
    });
    const env = buildOutputEnvelope({
      output: { suggestions: ['Sounds good!'] },
      evidence,
      provenance,
      cost: quoteCost({ capabilityId: 'mail.ai.reply.suggest', cost: { meter: 'ai.tokens', quoteRequired: false } }),
    });
    expect(env.output.suggestions).toEqual(['Sounds good!']);
    expect(env.evidence).toHaveLength(1);
    expect(env.provenance.capabilityId).toBe('mail.ai.reply.suggest');
    expect(env.cost!.credits).toBeGreaterThan(0);
  });
});
