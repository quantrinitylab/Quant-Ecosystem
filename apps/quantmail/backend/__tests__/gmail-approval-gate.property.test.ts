// @vitest-environment node
// ============================================================================
// Task 22.3 — Property test: above-threshold autonomous Gmail action requires approval
// quantmail-superhub · Phase 6 — Agent Company OS (Pillar 6)
// ============================================================================
//
// Feature: quantmail-superhub, Property 8: above-threshold autonomous Gmail action requires approval
//
// **Property P8 (approval gate)** — for ANY proposed inbox action whose
// classified sensitivity EXCEEDS the `InboxAutomationPolicy` threshold (and, in
// particular, any EXTERNAL send-like action above threshold), execution
// requires `approvedByHuman = true`. The action is NEVER auto-executed: the
// `GmailHandler` routes it to PENDING_APPROVAL, records a PENDING audit row with
// `approvedByHuman = false`, the `InMemoryGmailActionExecutor` carries nothing
// out, and the agent module's execution guard (`AgentApprovalGate.ensureApproved`)
// REFUSES the action with `APPROVAL_REQUIRED` until a human approves it — after
// which the same guard lets it through. Conversely, NO above-threshold action is
// ever AUTO_EXECUTED.
//
// **Validates: Requirements 14.3, 15.3, 15.4**
//
// HARNESS: drives the REAL `GmailHandler` (Task 22.2, consumed through the
// company module barrel `modules/company`) against the REAL `AgentApprovalGate`
// (Task 22.1, `modules/agent/services/approval-gating.service`) backed by an
// in-memory prisma double for `agentActionAudit` — exactly the double + harness
// pattern from `gmail-handler.service.test.ts`. The sensitivity classifier is a
// stub whose returned level is generated, and the executor is the real
// `InMemoryGmailActionExecutor`. No live `@quant/ai`, no network, no real DB.
// Library: fast-check, >= 100 runs (the ecosystem's JS property-testing tool).

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { AgentApprovalGate } from '../modules/agent/services/approval-gating.service';
import {
  GmailHandler,
  InMemoryGmailActionExecutor,
  isSendLike,
  type SensitivityLevel,
  type GmailActionKind,
  type InboxAutomationPolicy,
  type ProposedGmailAction,
  type SensitivityClassifierPort,
} from '../modules/company';

// ---------------------------------------------------------------------------
// In-memory prisma double for `agentActionAudit` (real state transitions),
// mirroring `gmail-handler.service.test.ts`.
// ---------------------------------------------------------------------------

function createMockPrisma() {
  const store = new Map<string, Record<string, unknown>>();
  let seq = 0;
  return {
    _store: store,
    agentActionAudit: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `audit-${++seq}`;
        const row = {
          id,
          requestedAt: new Date('2024-01-01T00:00:00Z'),
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
          ...data,
        };
        store.set(id, row);
        return { ...row };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = store.get(where.id);
        return row ? { ...row } : null;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = store.get(where.id);
          if (!row) throw new Error('row not found');
          const updated = { ...row, ...data, updatedAt: new Date() };
          store.set(where.id, updated);
          return { ...updated };
        },
      ),
    },
  };
}

/** A classifier that always returns the generated sensitivity (Req 15.1 seam). */
function fixedClassifier(level: SensitivityLevel): SensitivityClassifierPort {
  return { classify: vi.fn(async () => level) };
}

function buildHarness(level: SensitivityLevel) {
  const prisma = createMockPrisma();
  const gate = new AgentApprovalGate(prisma as never);
  const executor = new InMemoryGmailActionExecutor();
  const handler = new GmailHandler({ classifier: fixedClassifier(level), executor, gate });
  return { prisma, gate, executor, handler };
}

// ---------------------------------------------------------------------------
// Domain constants + a local mirror of the handler's sensitivity ordering, so
// the test computes "above threshold" independently of the implementation.
// ---------------------------------------------------------------------------

const ALL_SENSITIVITIES: SensitivityLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SENSITIVITY_RANK: Record<SensitivityLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const ALL_KINDS: GmailActionKind[] = [
  'label',
  'archive',
  'draft',
  'reply',
  'send',
  'schedule_send',
  'followup',
];

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const scenarioArb = fc.record({
  threshold: fc.constantFrom(...ALL_SENSITIVITIES),
  sensitivity: fc.constantFrom(...ALL_SENSITIVITIES),
  kind: fc.constantFrom(...ALL_KINDS),
  external: fc.boolean(),
  // A random set of auto-permitted action kinds (possibly empty, possibly all).
  allowedActions: fc.subarray(ALL_KINDS),
  undoSendWindowSeconds: fc.integer({ min: 0, max: 120 }),
});

type Scenario = {
  threshold: SensitivityLevel;
  sensitivity: SensitivityLevel;
  kind: GmailActionKind;
  external: boolean;
  allowedActions: GmailActionKind[];
  undoSendWindowSeconds: number;
};

function makePolicy(s: Scenario): InboxAutomationPolicy {
  return {
    userId: 'ceo-user',
    enabled: true,
    approvalThreshold: s.threshold,
    undoSendWindowSeconds: s.undoSendWindowSeconds,
    allowedActions: s.allowedActions,
  };
}

function makeAction(s: Scenario): ProposedGmailAction {
  return {
    kind: s.kind,
    targetRef: isSendLike(s.kind) ? 'client@example.com' : 'email-1',
    recipient: 'client@example.com',
    external: s.external,
    subject: 'subject',
    body: 'body',
  };
}

// ===========================================================================

describe('Feature: quantmail-superhub, Property 8: above-threshold autonomous Gmail action requires approval', () => {
  // P8 core: any action whose sensitivity exceeds the policy threshold (incl.
  // any external send-like action above threshold) is held PENDING, never
  // auto-executed, and the execution guard refuses it until a human approves.
  it('above-threshold actions are PENDING, never auto-executed, and gated by human approval (Req 14.3, 15.3, 15.4)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const { handler, executor, gate } = buildHarness(s.sensitivity);
        const policy = makePolicy(s);
        const action = makeAction(s);

        const aboveThreshold =
          SENSITIVITY_RANK[s.sensitivity] > SENSITIVITY_RANK[s.threshold];
        const isExternalSendAboveThreshold =
          isSendLike(s.kind) && s.external && aboveThreshold;

        const decision = await handler.handle(policy, action);

        // ---- INVARIANT: above-threshold (or external-send-above-threshold) ----
        if (aboveThreshold || isExternalSendAboveThreshold) {
          // It is routed to approval, NOT auto-executed.
          expect(decision.outcome).toBe('PENDING_APPROVAL');
          // The executor carried NOTHING out for this action.
          expect(executor.executed).toHaveLength(0);
          // The audit row is PENDING and was NOT human-approved.
          expect(decision.audit).toBeDefined();
          expect(decision.audit?.status).toBe('PENDING');
          expect(decision.audit?.approvedByHuman).toBe(false);

          // An external send above threshold is recorded as EXTERNAL_SEND (Req 15.4).
          if (isExternalSendAboveThreshold) {
            expect(decision.audit?.actionType).toBe('EXTERNAL_SEND');
          }

          // The execution guard REFUSES the action until a human approves it.
          await expect(gate.ensureApproved(decision.audit!.id)).rejects.toMatchObject({
            code: 'APPROVAL_REQUIRED',
          });

          // After a human approves, the SAME guard lets it through and the row
          // now carries approvedByHuman = true (the only path that sets it).
          const approved = await gate.approve(decision.audit!.id, 'ceo-user');
          expect(approved.approvedByHuman).toBe(true);
          const guarded = await gate.ensureApproved(decision.audit!.id);
          expect(guarded.approvedByHuman).toBe(true);
          expect(guarded.status).toBe('APPROVED');
        }

        // ---- CONVERSE: no above-threshold action is EVER auto-executed --------
        if (decision.outcome === 'AUTO_EXECUTED') {
          expect(aboveThreshold).toBe(false);
          // An auto-execution must have a permitted kind and an EXECUTED, not
          // human-approved audit row.
          expect(policy.allowedActions.includes(s.kind)).toBe(true);
          expect(executor.executed).toHaveLength(1);
          expect(decision.audit?.status).toBe('EXECUTED');
          expect(decision.audit?.approvedByHuman).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Focused slice: GUARANTEE the generator exercises the external-send-above-
  // threshold case (Req 15.4) on every run, so the EXTERNAL_SEND audit + the
  // never-auto-executed guarantee are always covered, not just incidentally.
  it('every external send-like action above threshold is PENDING as EXTERNAL_SEND and never executes (Req 15.4)', async () => {
    const sendLikeKinds = ALL_KINDS.filter((k) => isSendLike(k));
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kind: fc.constantFrom(...sendLikeKinds),
          // threshold strictly below sensitivity so "above threshold" always holds.
          threshold: fc.constantFrom<SensitivityLevel[]>('LOW', 'MEDIUM', 'HIGH'),
          sensitivity: fc.constantFrom<SensitivityLevel[]>('MEDIUM', 'HIGH', 'CRITICAL'),
          // allow the kind so the ONLY reason for approval is the threshold.
          undoSendWindowSeconds: fc.integer({ min: 0, max: 120 }),
        }),
        async (g) => {
          // Skip combos where sensitivity is not strictly above the threshold.
          fc.pre(SENSITIVITY_RANK[g.sensitivity] > SENSITIVITY_RANK[g.threshold]);

          const { handler, executor, gate } = buildHarness(g.sensitivity);
          const policy: InboxAutomationPolicy = {
            userId: 'ceo-user',
            enabled: true,
            approvalThreshold: g.threshold,
            undoSendWindowSeconds: g.undoSendWindowSeconds,
            allowedActions: [...ALL_KINDS], // permit everything: only threshold gates
          };
          const action: ProposedGmailAction = {
            kind: g.kind,
            targetRef: 'client@example.com',
            recipient: 'client@example.com',
            external: true,
            subject: 's',
            body: 'b',
          };

          const decision = await handler.handle(policy, action);

          expect(decision.outcome).toBe('PENDING_APPROVAL');
          expect(executor.executed).toHaveLength(0);
          expect(decision.audit?.status).toBe('PENDING');
          expect(decision.audit?.approvedByHuman).toBe(false);
          expect(decision.audit?.actionType).toBe('EXTERNAL_SEND');

          await expect(gate.ensureApproved(decision.audit!.id)).rejects.toMatchObject({
            code: 'APPROVAL_REQUIRED',
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
