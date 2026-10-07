// ============================================================================
// quantmail-superhub · Task 22.1 — human-approval gating + AgentActionAudit
// (Requirements 14.1, 14.2, 14.3, 23.1, 23.3)
// ============================================================================
//
// Covers the approval-gate contract:
//   * a sensitive action stays PENDING and is NOT executed without approval
//                                                          — Req 14.1, 14.2
//   * `approvedByHuman` is true ONLY after a human approves — Req 14.3, 23.3
//   * the execution guard refuses to run a sensitive action without a
//     corresponding APPROVED + approvedByHuman audit (fails closed)
//   * a rejected action never executes; only-pending actions are decidable
//   * every sensitive action is recorded in the audit trail   — Req 23.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentApprovalGate } from '../modules/agent/services/approval-gating.service';

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

const MERGE_ACTION = {
  tenantId: 'tenant-ceo',
  actionType: 'MERGE' as const,
  targetRef: 'pr-123',
  orgId: 'org-1',
  actorWorkerId: 'coder-1',
};

describe('AgentApprovalGate.requestApproval (Req 14.1, 14.2, 23.1)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('records a sensitive action as PENDING and never executes it (approvedByHuman=false)', async () => {
    const gate = new AgentApprovalGate(prisma as never);

    const audit = await gate.requestApproval(MERGE_ACTION);

    // Recorded in the audit trail (Req 23.1).
    expect(prisma.agentActionAudit.create).toHaveBeenCalledTimes(1);
    expect(audit.status).toBe('PENDING');
    // Not yet human approved (Req 14.3) and not executed.
    expect(audit.approvedByHuman).toBe(false);
    expect(audit.approvedByUserId).toBeNull();
    expect(audit.executedAt).toBeNull();
    expect(audit.decidedAt).toBeNull();
    expect(audit.actionType).toBe('MERGE');
    expect(audit.targetRef).toBe('pr-123');
    expect(audit.orgId).toBe('org-1');
    expect(audit.actorWorkerId).toBe('coder-1');
  });

  it('defaults org-less / worker-less fields to null and merges metadata', async () => {
    const gate = new AgentApprovalGate(prisma as never);

    const audit = await gate.requestApproval({
      tenantId: 'tenant-ceo',
      actionType: 'EXTERNAL_SEND',
      targetRef: 'someone@example.com',
      metadata: { subject: 'hello' },
    });

    expect(audit.orgId).toBeNull();
    expect(audit.actorWorkerId).toBeNull();
    expect(audit.metadata).toEqual({ subject: 'hello' });
    expect(audit.status).toBe('PENDING');
  });

  it('rejects with 400 when tenantId or targetRef is missing', async () => {
    const gate = new AgentApprovalGate(prisma as never);

    await expect(
      gate.requestApproval({ ...MERGE_ACTION, tenantId: '   ' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'TENANT_REQUIRED' });

    await expect(
      gate.requestApproval({ ...MERGE_ACTION, targetRef: '' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'TARGET_REQUIRED' });

    expect(prisma.agentActionAudit.create).not.toHaveBeenCalled();
  });
});

describe('AgentApprovalGate execution guard fails closed without approval (Req 14.1, 14.2)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('ensureApproved refuses a PENDING action with 403 APPROVAL_REQUIRED', async () => {
    const gate = new AgentApprovalGate(prisma as never);
    const audit = await gate.requestApproval(MERGE_ACTION);

    await expect(gate.ensureApproved(audit.id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'APPROVAL_REQUIRED',
    });
  });

  it('execute() never invokes the effect for an unapproved action (fails closed)', async () => {
    const gate = new AgentApprovalGate(prisma as never);
    const audit = await gate.requestApproval(MERGE_ACTION);

    const effect = vi.fn(async () => 'merged');

    await expect(gate.execute(audit.id, effect)).rejects.toMatchObject({
      code: 'APPROVAL_REQUIRED',
    });
    expect(effect).not.toHaveBeenCalled();

    // The action is still PENDING and not executed.
    const after = prisma._store.get(audit.id)!;
    expect(after['status']).toBe('PENDING');
    expect(after['executedAt']).toBeNull();
  });

  it('ensureApproved returns 404 for an unknown audit', async () => {
    const gate = new AgentApprovalGate(prisma as never);
    await expect(gate.ensureApproved('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'AUDIT_NOT_FOUND',
    });
  });
});

describe('AgentApprovalGate.approve sets approvedByHuman ONLY after a human approves (Req 14.3, 23.3)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('approve flips status to APPROVED with approvedByHuman=true and records the approver', async () => {
    const gate = new AgentApprovalGate(prisma as never);
    const pending = await gate.requestApproval(MERGE_ACTION);
    expect(pending.approvedByHuman).toBe(false);

    const approved = await gate.approve(pending.id, 'ceo-user');

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedByHuman).toBe(true);
    expect(approved.approvedByUserId).toBe('ceo-user');
    expect(approved.decidedAt).toBeInstanceOf(Date);
  });

  it('execute() runs the effect and marks EXECUTED only after human approval', async () => {
    const gate = new AgentApprovalGate(prisma as never);
    const pending = await gate.requestApproval(MERGE_ACTION);
    await gate.approve(pending.id, 'ceo-user');

    const effect = vi.fn(async () => 'merged');
    const result = await gate.execute(pending.id, effect);

    expect(result).toBe('merged');
    expect(effect).toHaveBeenCalledTimes(1);

    const after = prisma._store.get(pending.id)!;
    expect(after['status']).toBe('EXECUTED');
    expect(after['executedAt']).toBeInstanceOf(Date);
    // Human approval flag is preserved through execution.
    expect(after['approvedByHuman']).toBe(true);
  });

  it('rejects re-executing an already executed action with 409', async () => {
    const gate = new AgentApprovalGate(prisma as never);
    const pending = await gate.requestApproval(MERGE_ACTION);
    await gate.approve(pending.id, 'ceo-user');
    await gate.execute(pending.id, async () => 'merged');

    await expect(gate.execute(pending.id, async () => 'again')).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALREADY_EXECUTED',
    });
  });

  it('requires a non-empty approving userId', async () => {
    const gate = new AgentApprovalGate(prisma as never);
    const pending = await gate.requestApproval(MERGE_ACTION);

    await expect(gate.approve(pending.id, '  ')).rejects.toMatchObject({
      statusCode: 400,
      code: 'USER_REQUIRED',
    });
    // Still PENDING / not approved.
    expect(prisma._store.get(pending.id)!['approvedByHuman']).toBe(false);
  });
});

describe('AgentApprovalGate.reject keeps the action unexecutable (Req 14.1)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('reject sets REJECTED and leaves approvedByHuman false; the guard still refuses', async () => {
    const gate = new AgentApprovalGate(prisma as never);
    const pending = await gate.requestApproval(MERGE_ACTION);

    const rejected = await gate.reject(pending.id, 'ceo-user');
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.approvedByHuman).toBe(false);
    expect(rejected.approvedByUserId).toBe('ceo-user');

    await expect(gate.ensureApproved(pending.id)).rejects.toMatchObject({
      code: 'APPROVAL_REQUIRED',
    });
  });

  it('cannot approve an already-rejected action (409 NOT_PENDING)', async () => {
    const gate = new AgentApprovalGate(prisma as never);
    const pending = await gate.requestApproval(MERGE_ACTION);
    await gate.reject(pending.id, 'ceo-user');

    await expect(gate.approve(pending.id, 'ceo-user')).rejects.toMatchObject({
      statusCode: 409,
      code: 'NOT_PENDING',
    });
  });
});
