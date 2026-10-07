// ============================================================================
// quantmail-superhub · Task 22.2 — policy-guarded autonomous Gmail handler
// (Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6)
// ============================================================================
//
// Covers the handler contract end-to-end against the REAL `AgentApprovalGate`
// (backed by an in-memory prisma double):
//   * policy disabled                       ⇒ NO_ACTION, nothing audited   Req 15.6
//   * at/below threshold + permitted         ⇒ AUTO_EXECUTED w/ undo window  Req 15.2
//   * above threshold                        ⇒ PENDING_APPROVAL (not exec)   Req 15.3
//   * external send above threshold          ⇒ PENDING_APPROVAL (EXTERNAL)   Req 15.4
//   * not-auto-permitted kind                ⇒ PENDING_APPROVAL
//   * EVERY action (auto or approval) audited                               Req 15.5
//   * sensitivity classified via the AI email service seam                  Req 15.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentApprovalGate } from '../modules/agent/services/approval-gating.service';
import {
  GmailHandler,
  InMemoryGmailActionExecutor,
  createTriageSensitivityClassifier,
  sensitivityFromUrgency,
  type SensitivityLevel,
  type InboxAutomationPolicy,
  type ProposedGmailAction,
  type SensitivityClassifierPort,
} from '../modules/company/services/gmail-handler.service';

// ---------------------------------------------------------------------------
// In-memory prisma double for `agentActionAudit` (real state transitions)
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

/** A classifier that always returns a fixed sensitivity (Req 15.1 seam). */
function fixedClassifier(level: SensitivityLevel): SensitivityClassifierPort {
  return { classify: vi.fn(async () => level) };
}

function buildHarness(level: SensitivityLevel) {
  const prisma = createMockPrisma();
  const gate = new AgentApprovalGate(prisma as never);
  const executor = new InMemoryGmailActionExecutor();
  const classifier = fixedClassifier(level);
  const handler = new GmailHandler({ classifier, executor, gate });
  return { prisma, gate, executor, classifier, handler };
}

const ENABLED_POLICY: InboxAutomationPolicy = {
  userId: 'ceo-user',
  enabled: true,
  approvalThreshold: 'MEDIUM',
  undoSendWindowSeconds: 30,
  allowedActions: ['label', 'archive', 'reply', 'send', 'schedule_send', 'followup'],
};

const LABEL_ACTION: ProposedGmailAction = { kind: 'label', targetRef: 'email-1' };
const INTERNAL_SEND: ProposedGmailAction = {
  kind: 'send',
  targetRef: 'teammate@quant.dev',
  recipient: 'teammate@quant.dev',
  external: false,
  subject: 'status',
  body: 'all good',
};
const EXTERNAL_SEND: ProposedGmailAction = {
  kind: 'send',
  targetRef: 'client@example.com',
  recipient: 'client@example.com',
  external: true,
  subject: 'proposal',
  body: 'see attached',
};

// ---------------------------------------------------------------------------
// Req 15.6 — policy disabled ⇒ NO autonomous action
// ---------------------------------------------------------------------------

describe('GmailHandler — policy disabled takes no action (Req 15.6)', () => {
  it('returns NO_ACTION and neither executes nor audits when the policy is disabled', async () => {
    const { handler, executor, prisma } = buildHarness('LOW');

    const decision = await handler.handle(
      { ...ENABLED_POLICY, enabled: false },
      INTERNAL_SEND,
    );

    expect(decision.outcome).toBe('NO_ACTION');
    expect(decision.audit).toBeUndefined();
    expect(executor.executed).toHaveLength(0);
    expect(prisma.agentActionAudit.create).not.toHaveBeenCalled();
  });

  it('treats a missing `enabled` flag as disabled', async () => {
    const { handler, executor } = buildHarness('LOW');
    const decision = await handler.handle(
      { ...ENABLED_POLICY, enabled: undefined as never },
      LABEL_ACTION,
    );
    expect(decision.outcome).toBe('NO_ACTION');
    expect(executor.executed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Req 15.2 — at/below threshold + permitted ⇒ auto-execute (undo window)
// ---------------------------------------------------------------------------

describe('GmailHandler — below-threshold permitted actions auto-execute (Req 15.2, 15.5)', () => {
  it('auto-executes a low-sensitivity send and schedules it with the undo-send window', async () => {
    const { handler, executor } = buildHarness('LOW');

    const decision = await handler.handle(ENABLED_POLICY, INTERNAL_SEND);

    expect(decision.outcome).toBe('AUTO_EXECUTED');
    expect(executor.executed).toHaveLength(1);
    // Undo-send window is respected for the send (scheduled, not instant).
    expect(decision.result?.scheduledWithUndoWindow).toBe(true);
    expect(decision.result?.undoSendWindowSeconds).toBe(30);
    // Audited as EXECUTED, without human approval (it did not need it).
    expect(decision.audit?.status).toBe('EXECUTED');
    expect(decision.audit?.approvedByHuman).toBe(false);
    expect(decision.audit?.executedAt).toBeInstanceOf(Date);
    expect(decision.audit?.actionType).toBe('GMAIL_SEND');
  });

  it('auto-executes a non-send action with no undo window and audits it (Req 15.5)', async () => {
    const { handler, executor } = buildHarness('LOW');

    const decision = await handler.handle(ENABLED_POLICY, LABEL_ACTION);

    expect(decision.outcome).toBe('AUTO_EXECUTED');
    expect(decision.result?.scheduledWithUndoWindow).toBe(false);
    expect(decision.result?.undoSendWindowSeconds).toBe(0);
    expect(executor.executed[0].options.undoSendWindowSeconds).toBe(0);
    expect(decision.audit?.status).toBe('EXECUTED');
    expect(decision.audit?.actionType).toBe('GMAIL_LABEL');
  });

  it('auto-executes an action exactly AT the threshold (boundary is inclusive)', async () => {
    const { handler } = buildHarness('MEDIUM'); // threshold is MEDIUM
    const decision = await handler.handle(ENABLED_POLICY, INTERNAL_SEND);
    expect(decision.outcome).toBe('AUTO_EXECUTED');
  });
});

// ---------------------------------------------------------------------------
// Req 15.3 — above threshold ⇒ human approval (not executed)
// ---------------------------------------------------------------------------

describe('GmailHandler — above-threshold actions require approval (Req 15.3)', () => {
  it('routes a high-sensitivity action to PENDING approval and never executes it', async () => {
    const { handler, executor, gate } = buildHarness('HIGH'); // > MEDIUM

    const decision = await handler.handle(ENABLED_POLICY, INTERNAL_SEND);

    expect(decision.outcome).toBe('PENDING_APPROVAL');
    expect(executor.executed).toHaveLength(0); // NOT executed
    expect(decision.audit?.status).toBe('PENDING');
    expect(decision.audit?.approvedByHuman).toBe(false);

    // The audit fails the execution guard until a human approves it.
    await expect(gate.ensureApproved(decision.audit!.id)).rejects.toMatchObject({
      code: 'APPROVAL_REQUIRED',
    });
  });
});

// ---------------------------------------------------------------------------
// Req 15.4 — external send above threshold ⇒ approval (EXTERNAL_SEND)
// ---------------------------------------------------------------------------

describe('GmailHandler — external send above threshold requires approval (Req 15.4)', () => {
  it('records an EXTERNAL_SEND audit kept PENDING for an external send above threshold', async () => {
    const { handler, executor } = buildHarness('CRITICAL'); // > MEDIUM

    const decision = await handler.handle(ENABLED_POLICY, EXTERNAL_SEND);

    expect(decision.outcome).toBe('PENDING_APPROVAL');
    expect(executor.executed).toHaveLength(0);
    expect(decision.audit?.status).toBe('PENDING');
    expect(decision.audit?.actionType).toBe('EXTERNAL_SEND');
  });

  it('still auto-executes an external send that is AT/below threshold', async () => {
    const { handler, executor } = buildHarness('LOW');
    const decision = await handler.handle(ENABLED_POLICY, EXTERNAL_SEND);
    expect(decision.outcome).toBe('AUTO_EXECUTED');
    expect(executor.executed).toHaveLength(1);
    expect(decision.result?.scheduledWithUndoWindow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Action kind not authorized to auto-execute ⇒ approval
// ---------------------------------------------------------------------------

describe('GmailHandler — non-permitted action kinds require approval', () => {
  it('routes a below-threshold but non-permitted action to PENDING approval', async () => {
    const { handler, executor } = buildHarness('LOW');
    const policy: InboxAutomationPolicy = { ...ENABLED_POLICY, allowedActions: ['label'] };

    const decision = await handler.handle(policy, INTERNAL_SEND); // 'send' not allowed

    expect(decision.outcome).toBe('PENDING_APPROVAL');
    expect(executor.executed).toHaveLength(0);
    expect(decision.audit?.status).toBe('PENDING');
  });
});

// ---------------------------------------------------------------------------
// Req 15.5 — every action is audited; validation
// ---------------------------------------------------------------------------

describe('GmailHandler — audit + validation (Req 15.5)', () => {
  it('audits every action across a mixed batch (one audit row per acted action)', async () => {
    const { handler, prisma } = buildHarness('LOW');

    const decisions = await handler.handleAll(ENABLED_POLICY, [
      LABEL_ACTION,
      INTERNAL_SEND,
      { ...EXTERNAL_SEND },
    ]);

    expect(decisions).toHaveLength(3);
    expect(decisions.every((d) => d.outcome === 'AUTO_EXECUTED')).toBe(true);
    // Every acted action produced an audit row (Req 15.5).
    expect(decisions.every((d) => typeof d.audit?.id === 'string')).toBe(true);
    expect(prisma.agentActionAudit.create).toHaveBeenCalledTimes(3);
  });

  it('rejects an action with an empty targetRef (400 TARGET_REQUIRED)', async () => {
    const { handler } = buildHarness('LOW');
    await expect(
      handler.handle(ENABLED_POLICY, { kind: 'label', targetRef: '   ' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'TARGET_REQUIRED' });
  });

  it('uses an explicit policy.tenantId as the audit ownership boundary', async () => {
    const { handler } = buildHarness('LOW');
    const decision = await handler.handle(
      { ...ENABLED_POLICY, tenantId: 'tenant-xyz' },
      LABEL_ACTION,
    );
    expect(decision.audit?.tenantId).toBe('tenant-xyz');
  });
});

// ---------------------------------------------------------------------------
// Req 15.1 — sensitivity classified via the AI email service seam
// ---------------------------------------------------------------------------

describe('GmailHandler — sensitivity classification seam (Req 15.1)', () => {
  it('invokes the injected classifier for each proposed action', async () => {
    const { handler, classifier } = buildHarness('LOW');
    await handler.handle(ENABLED_POLICY, LABEL_ACTION);
    expect(classifier.classify).toHaveBeenCalledTimes(1);
  });

  it('triage-backed classifier maps urgency to sensitivity (reuses ai-triage)', async () => {
    const triage = {
      triage: vi.fn(async () => ({ urgency: 0.9, category: 'act_now' })),
    };
    const classifier = createTriageSensitivityClassifier(triage);
    const level = await classifier.classify(EXTERNAL_SEND, { userId: 'ceo-user' });
    expect(level).toBe('CRITICAL');
    expect(triage.triage).toHaveBeenCalledTimes(1);
  });

  it('sensitivityFromUrgency maps the 0..1 band to discrete levels', () => {
    expect(sensitivityFromUrgency(0)).toBe('LOW');
    expect(sensitivityFromUrgency(0.3)).toBe('MEDIUM');
    expect(sensitivityFromUrgency(0.6)).toBe('HIGH');
    expect(sensitivityFromUrgency(0.95)).toBe('CRITICAL');
    expect(sensitivityFromUrgency(Number.NaN)).toBe('LOW');
  });
});
