import { describe, it, expect } from 'vitest';
import {
  DefaultMemoryAcceptancePolicy,
  effectiveWeight,
  type AcceptanceCandidate,
  type AcceptanceExisting,
} from '../core/memory-acceptance-policy';

const policy = new DefaultMemoryAcceptancePolicy();
const cand = (over: Partial<AcceptanceCandidate> = {}): AcceptanceCandidate => ({
  confidence: over.confidence ?? 1,
  trust: over.trust ?? 1,
  provenance: over.provenance ?? 'rule',
  ...(over.fingerprint ? { fingerprint: over.fingerprint } : {}),
});
const existing = (over: Partial<AcceptanceExisting>): AcceptanceExisting => ({
  id: over.id ?? 'e1',
  state: over.state ?? 'active',
  effectiveWeight: over.effectiveWeight ?? 1,
  verdict: over.verdict ?? 'supersedes',
  ...(over.fingerprint ? { fingerprint: over.fingerprint } : {}),
});

describe('effectiveWeight', () => {
  it('is the min of confidence and trust', () => {
    expect(effectiveWeight(0.98, 0.2)).toBe(0.2); // confident but untrusted source
    expect(effectiveWeight(0.55, 1.0)).toBe(0.55); // user typed it
  });
});

describe('DefaultMemoryAcceptancePolicy', () => {
  it('stores active with no conflict and high weight', () => {
    const d = policy.decide(cand(), []);
    expect(d.action).toBe('store_active');
    expect(d.effectiveWeight).toBe(1);
    expect(d.policyVersion).toBe('v1');
  });

  it('holds pending when weight is between thresholds', () => {
    const d = policy.decide(cand({ confidence: 0.5, provenance: 'llm.gpt' }), []);
    expect(d.action).toBe('store_pending');
    expect(d.reason).toBe('low_confidence');
  });

  it('drops below the pending threshold', () => {
    expect(policy.decide(cand({ confidence: 0.2 }), []).action).toBe('drop');
  });

  it('skips a duplicate by verdict', () => {
    const d = policy.decide(cand(), [existing({ verdict: 'duplicate' })]);
    expect(d.action).toBe('duplicate_skip');
  });

  it('skips on an idempotent fingerprint', () => {
    const d = policy.decide(cand({ fingerprint: 'fp1' }), [
      existing({ verdict: 'supersedes', fingerprint: 'fp1' }),
    ]);
    expect(d.action).toBe('duplicate_skip');
    expect(d.reason).toBe('idempotent_fingerprint');
  });

  it('supersedes when the candidate outweighs the existing', () => {
    const d = policy.decide(cand({ confidence: 1, trust: 1 }), [
      existing({ id: 'old', verdict: 'supersedes', effectiveWeight: 1 }),
    ]);
    expect(d.action).toBe('supersede');
    expect(d.supersedeIds).toEqual(['old']);
  });

  it('holds pending when a weaker candidate would overwrite a stronger memory', () => {
    const d = policy.decide(cand({ confidence: 0.5, trust: 0.5, provenance: 'llm.gpt' }), [
      existing({ verdict: 'supersedes', effectiveWeight: 0.95 }),
    ]);
    expect(d.action).toBe('store_pending');
    expect(d.reason).toBe('weaker_than_existing');
  });

  it('never lets an unverified LLM candidate overwrite a Verified memory', () => {
    const d = policy.decide(cand({ confidence: 0.99, trust: 0.8, provenance: 'llm.gpt' }), [
      existing({ state: 'verified', verdict: 'supersedes', effectiveWeight: 1 }),
    ]);
    expect(d.action).toBe('store_pending');
    expect(d.reason).toBe('verified_conflict');
  });

  it('lets a user candidate override a Verified memory', () => {
    const d = policy.decide(cand({ confidence: 1, trust: 1, provenance: 'user.explicit' }), [
      existing({ state: 'verified', verdict: 'supersedes', effectiveWeight: 1 }),
    ]);
    expect(d.action).toBe('supersede');
  });
});
