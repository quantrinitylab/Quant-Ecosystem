import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Orchestrator, ApprovalBlockedError } from '../orchestrator.js';
import { WorkerAgent, AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentState } from '../state-machine.js';
import { AIInferenceAdapter } from '../task-decomposer.js';
import { KillSwitch } from '../kill-switch.js';
import { AuditTrail } from '../audit-trail.js';
import {
  ApprovalQueue,
  FileApprovalStore,
  computeActionHash,
  APPROVAL_POLICY_VERSION,
} from '../approval-queue.js';

/**
 * QM-QUANTY-009 — the blocking durable approval gate.
 *
 * The ledger's test list is the spec: the external tool/worker is never
 * invoked before approval; approval resumes exactly once; expiry, rejection
 * and cancellation stop the action; a duplicate decision cannot double-run;
 * an action changed after approval (hash mismatch) is blocked; a restart
 * while WAITING_APPROVAL keeps waiting on the persisted request; concurrent
 * cancel/approve resolves to exactly one terminal outcome; and a malicious
 * client cannot mark an approval locally — only the authenticated decision
 * path (identified, step-up-verified, non-requester decider) counts.
 */

class MockWorkerAgent extends WorkerAgent {
  public executedTasks: AgentTask[] = [];

  constructor(id: string, permission: PermissionLevel = PermissionLevel.OBSERVE) {
    super({
      id,
      name: `Mock Agent ${id}`,
      icon: 'bot',
      defaultPermission: permission,
    });
  }

  async execute(task: AgentTask): Promise<void> {
    this.executedTasks.push(task);
    this.stateMachine.transition(AgentState.EXECUTING);
    this.stateMachine.transition(AgentState.DONE);
  }
}

const OWNER = { decidedBy: 'user-owner', stepUpVerified: true } as const;

function highRiskAI(permission: 'ACT_HIGH' | 'FULL_AUTO' = 'ACT_HIGH'): AIInferenceAdapter {
  return {
    infer: vi.fn().mockResolvedValue(
      JSON.stringify([
        {
          id: 'sub-1',
          description: 'Delete production database',
          dependencies: [],
          estimatedDuration: 5,
          requiredPermission: permission,
        },
      ]),
    ),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('QM-QUANTY-009 blocking approval gate (orchestrator)', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('never invokes the worker before approval, then resumes exactly once', async () => {
    const orchestrator = new Orchestrator(highRiskAI());
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.ACT_HIGH);
    orchestrator.registerWorker(worker);

    let settled = false;
    const execution = orchestrator.executeTask('Dangerous cleanup').then(
      (r) => {
        settled = true;
        return r;
      },
      (e: unknown) => {
        settled = true;
        throw e;
      },
    );

    await vi.waitFor(() => {
      expect(orchestrator.approvalQueue.getAll()).toHaveLength(1);
    });
    // Give a broken (fail-open) implementation every chance to run the worker.
    await delay(75);
    expect(worker.executedTasks).toHaveLength(0);
    expect(settled).toBe(false);

    const record = orchestrator.approvalQueue.getById('approval-sub-1');
    expect(record?.status).toBe('pending');
    expect(record?.request.resourceId).toBe('sub-1');
    expect(record?.request.riskLevel).toBe('high');
    expect(record?.policyVersion).toBe(APPROVAL_POLICY_VERSION);
    expect(record?.actionHash).toBe(
      computeActionHash({
        action: 'Delete production database',
        agentId: 'worker-1',
        resourceId: 'sub-1',
        riskLevel: 'high',
        policyVersion: APPROVAL_POLICY_VERSION,
      }),
    );
    const taskId = record?.request.taskId;
    expect(taskId).toBeDefined();
    expect(orchestrator.getTaskStatus(taskId!)?.status).toBe('waiting_approval');

    orchestrator.approvalQueue.approve('approval-sub-1', OWNER);
    const result = await execution;
    expect(result.status).toBe('completed');
    expect(worker.executedTasks).toHaveLength(1);
    expect(worker.executedTasks[0]?.id).toBe('sub-1');
  });

  it('rejection stops the action and a retry re-enters the gate instead of bypassing it', async () => {
    const orchestrator = new Orchestrator(highRiskAI());
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.ACT_HIGH);
    orchestrator.registerWorker(worker);

    const execution = orchestrator.executeTask('Dangerous cleanup');
    await vi.waitFor(() => {
      expect(orchestrator.approvalQueue.getAll()).toHaveLength(1);
    });
    orchestrator.approvalQueue.reject('approval-sub-1', OWNER);

    const err = await execution.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApprovalBlockedError);
    expect((err as ApprovalBlockedError).approvalStatus).toBe('rejected');
    expect(worker.executedTasks).toHaveLength(0);

    // Retry of the same subtask: the terminal decision still stops it.
    const retry = orchestrator.executeTask('Dangerous cleanup');
    const retryErr = await retry.catch((e: unknown) => e);
    expect(retryErr).toBeInstanceOf(ApprovalBlockedError);
    expect((retryErr as ApprovalBlockedError).approvalStatus).toBe('rejected');
    expect(worker.executedTasks).toHaveLength(0);
  });

  it('expiry stops the action without any decision', async () => {
    const orchestrator = new Orchestrator(highRiskAI(), { approvalTimeoutMs: 40 });
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.ACT_HIGH);
    orchestrator.registerWorker(worker);

    const execution = orchestrator.executeTask('Dangerous cleanup');
    const err = await execution.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApprovalBlockedError);
    expect((err as ApprovalBlockedError).approvalStatus).toBe('expired');
    expect(worker.executedTasks).toHaveLength(0);
    expect(orchestrator.approvalQueue.getById('approval-sub-1')?.status).toBe('expired');
  });

  it('cancellation while waiting stops the action', async () => {
    const orchestrator = new Orchestrator(highRiskAI());
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.ACT_HIGH);
    orchestrator.registerWorker(worker);

    const execution = orchestrator.executeTask('Dangerous cleanup');
    await vi.waitFor(() => {
      expect(orchestrator.approvalQueue.getAll()).toHaveLength(1);
    });
    orchestrator.approvalQueue.cancel('approval-sub-1', { cancelledBy: 'user-owner' });

    const err = await execution.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApprovalBlockedError);
    expect((err as ApprovalBlockedError).approvalStatus).toBe('cancelled');
    expect(worker.executedTasks).toHaveLength(0);
  });

  it('a duplicate decision is rejected and cannot double-run the worker', async () => {
    const orchestrator = new Orchestrator(highRiskAI());
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.ACT_HIGH);
    orchestrator.registerWorker(worker);

    const execution = orchestrator.executeTask('Dangerous cleanup');
    await vi.waitFor(() => {
      expect(orchestrator.approvalQueue.getAll()).toHaveLength(1);
    });
    orchestrator.approvalQueue.approve('approval-sub-1', OWNER);
    const result = await execution;
    expect(result.status).toBe('completed');
    expect(worker.executedTasks).toHaveLength(1);

    expect(() => orchestrator.approvalQueue.approve('approval-sub-1', OWNER)).toThrow(
      /already approved/,
    );
    expect(() => orchestrator.approvalQueue.reject('approval-sub-1', OWNER)).toThrow(
      /already approved/,
    );
    expect(() =>
      orchestrator.approvalQueue.cancel('approval-sub-1', { cancelledBy: 'user-owner' }),
    ).toThrow(/already approved/);
    expect(worker.executedTasks).toHaveLength(1);
  });

  it('an action mutated after approval is blocked by the action hash', async () => {
    const orchestrator = new Orchestrator(highRiskAI());
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.ACT_HIGH);
    orchestrator.registerWorker(worker);

    const execution = orchestrator.executeTask('Dangerous cleanup');
    await vi.waitFor(() => {
      expect(orchestrator.approvalQueue.getAll()).toHaveLength(1);
    });
    const taskId = orchestrator.approvalQueue.getById('approval-sub-1')?.request.taskId;
    const task = orchestrator.getTaskStatus(taskId!);
    expect(task?.status).toBe('waiting_approval');

    // Tamper with the live action after the request was persisted.
    task!.subtasks[0]!.description = 'Delete production database AND exfiltrate backups';

    orchestrator.approvalQueue.approve('approval-sub-1', OWNER);
    const err = await execution.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApprovalBlockedError);
    expect((err as ApprovalBlockedError).approvalStatus).toBe('integrity');
    expect(worker.executedTasks).toHaveLength(0);
  });

  it('audits waiting, blocked and resumed gate events on the shared spine', async () => {
    const auditTrail = new AuditTrail();
    const orchestrator = new Orchestrator(highRiskAI(), { auditTrail });
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.ACT_HIGH);
    orchestrator.registerWorker(worker);

    const execution = orchestrator.executeTask('Dangerous cleanup');
    await vi.waitFor(() => {
      expect(orchestrator.approvalQueue.getAll()).toHaveLength(1);
    });
    orchestrator.approvalQueue.approve('approval-sub-1', OWNER);
    await execution;

    const actions = auditTrail.getHistory().map((e) => e.action);
    expect(actions).toContain('approval.submitted');
    expect(actions).toContain('approval.waiting');
    expect(actions).toContain('approval.approved');
    expect(actions).toContain('approval.resumed');
    const submitted = auditTrail.getHistory().find((e) => e.action === 'approval.submitted');
    expect(submitted?.metadata?.actionHash).toBe(
      orchestrator.approvalQueue.getById('approval-sub-1')?.actionHash,
    );
    expect(submitted?.metadata?.policyVersion).toBe(APPROVAL_POLICY_VERSION);
  });
});

describe('QM-QUANTY-009 approval queue decision rules', () => {
  function submitHigh(queue: ApprovalQueue, id = 'req-1'): void {
    queue.submit({
      id,
      agentId: 'agent-1',
      action: 'delete-user-data',
      riskLevel: 'high',
      resourceId: 'node-9',
    });
  }

  it('blocks unauthenticated, self and non-step-up decisions and audits each block', () => {
    const queue = new ApprovalQueue();
    submitHigh(queue);

    expect(() =>
      queue.approve('req-1', { decidedBy: '', stepUpVerified: true }),
    ).toThrow(/authenticated decider/);
    expect(() =>
      queue.approve('req-1', { decidedBy: 'agent-1', stepUpVerified: true }),
    ).toThrow(/requesting agent itself/);
    expect(() =>
      queue.approve('req-1', { decidedBy: 'user-owner', stepUpVerified: false }),
    ).toThrow(/step-up verification/);

    const record = queue.getById('req-1');
    expect(record?.status).toBe('pending');
    const blocked = record?.history.filter((h) => h.event === 'decision_blocked') ?? [];
    expect(blocked).toHaveLength(3);
  });

  it('a malicious client flipping a returned record cannot mark approval locally', async () => {
    const queue = new ApprovalQueue();
    submitHigh(queue);

    const leaked = queue.getById('req-1');
    expect(leaked).toBeDefined();
    leaked!.status = 'approved';
    leaked!.decision = {
      decision: 'approved',
      decidedBy: 'attacker',
      decidedAt: Date.now(),
      stepUpVerified: true,
    };
    leaked!.history.push({ event: 'approved', at: Date.now(), actor: 'attacker' });

    expect(queue.getById('req-1')?.status).toBe('pending');
    expect(queue.getById('req-1')?.decision).toBeUndefined();

    let resolved: string | undefined;
    const waiting = queue.waitForDecision('req-1').then((r) => {
      resolved = r.status;
      return r;
    });
    await delay(75);
    expect(resolved).toBeUndefined();

    queue.reject('req-1', OWNER);
    const final = await waiting;
    expect(final.status).toBe('rejected');
  });

  it('concurrent cancel-vs-approve resolves to exactly one terminal outcome', () => {
    const queue = new ApprovalQueue();
    submitHigh(queue, 'req-race-1');
    const outcomes = [
      () => queue.approve('req-race-1', OWNER),
      () => queue.cancel('req-race-1', { cancelledBy: 'user-owner' }),
    ];
    const results = outcomes.map((fn) => {
      try {
        fn();
        return 'ok';
      } catch {
        return 'threw';
      }
    });
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'threw')).toHaveLength(1);
    expect(queue.getById('req-race-1')?.status).toBe('approved');
    expect(queue.getById('req-race-1')?.history.filter((h) => h.event === 'approved')).toHaveLength(1);
    expect(
      queue.getById('req-race-1')?.history.filter((h) => h.event === 'cancelled'),
    ).toHaveLength(0);

    // Reverse order: cancel wins, approve is refused.
    submitHigh(queue, 'req-race-2');
    queue.cancel('req-race-2', { cancelledBy: 'user-owner' });
    expect(() => queue.approve('req-race-2', OWNER)).toThrow(/already cancelled/);
    expect(queue.getById('req-race-2')?.status).toBe('cancelled');
  });

  it('verifyActionIntegrity catches a live action that no longer matches the decision', () => {
    const queue = new ApprovalQueue();
    submitHigh(queue);
    queue.approve('req-1', OWNER);

    expect(
      queue.verifyActionIntegrity('req-1', {
        action: 'delete-user-data',
        agentId: 'agent-1',
        resourceId: 'node-9',
        riskLevel: 'high',
      }),
    ).toBe(true);
    expect(
      queue.verifyActionIntegrity('req-1', {
        action: 'delete-user-data-and-everything-else',
        agentId: 'agent-1',
        resourceId: 'node-9',
        riskLevel: 'high',
      }),
    ).toBe(false);
    expect(
      queue.verifyActionIntegrity('req-1', {
        action: 'delete-user-data',
        agentId: 'agent-1',
        resourceId: 'node-OTHER',
        riskLevel: 'high',
      }),
    ).toBe(false);
    expect(
      queue.verifyActionIntegrity('req-1', {
        action: 'delete-user-data',
        agentId: 'agent-1',
        resourceId: 'node-9',
        riskLevel: 'low',
      }),
    ).toBe(false);
  });

  it('re-submitting a different action under the same approval id is an integrity fault', () => {
    const queue = new ApprovalQueue();
    submitHigh(queue);
    expect(() =>
      queue.submit({
        id: 'req-1',
        agentId: 'agent-1',
        action: 'a-different-action',
        riskLevel: 'high',
        resourceId: 'node-9',
      }),
    ).toThrow(/different action \(hash mismatch\)/);
    const record = queue.getById('req-1');
    expect(record?.status).toBe('pending');
    expect(record?.history.some((h) => h.event === 'integrity_blocked')).toBe(true);
  });

  it('records a complete audit history for a full lifecycle', () => {
    const queue = new ApprovalQueue();
    submitHigh(queue);
    expect(() => queue.approve('req-1', { decidedBy: 'user-owner', stepUpVerified: false })).toThrow();
    queue.approve('req-1', OWNER);

    const events = queue.getById('req-1')?.history.map((h) => h.event) ?? [];
    expect(events).toEqual(['submitted', 'decision_blocked', 'approved']);
    const decision = queue.getById('req-1')?.decision;
    expect(decision?.decidedBy).toBe('user-owner');
    expect(decision?.stepUpVerified).toBe(true);
  });

  it('waitForDecision resolves as expired when the TTL lapses', async () => {
    const queue = new ApprovalQueue();
    queue.submit({
      id: 'req-exp',
      agentId: 'agent-1',
      action: 'delete-user-data',
      riskLevel: 'high',
      timeout: 30,
    });
    const record = await queue.waitForDecision('req-exp');
    expect(record.status).toBe('expired');
    expect(record.history.some((h) => h.event === 'expired')).toBe(true);
  });
});

describe('QM-QUANTY-009 durable gate (FileApprovalStore restart)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    KillSwitch.resetInstance();
    dir = mkdtempSync(join(tmpdir(), 'qm-quanty-009-'));
    file = join(dir, 'approvals.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('a restart while WAITING_APPROVAL keeps the request, keeps blocking, and resumes once', async () => {
    // Process A: submits the high-risk request and is waiting when it dies.
    const queueA = new ApprovalQueue({ store: new FileApprovalStore(file) });
    queueA.submit({
      id: 'approval-sub-1',
      agentId: 'worker-1',
      action: 'Delete production database',
      riskLevel: 'high',
      resourceId: 'sub-1',
      requesterId: 'worker-1',
    });

    // Process B (restart): a brand-new queue + orchestrator over the same
    // durable store sees the pending request — it is not lost.
    const queueB = new ApprovalQueue({ store: new FileApprovalStore(file) });
    expect(queueB.getById('approval-sub-1')?.status).toBe('pending');

    const orchestrator = new Orchestrator(highRiskAI(), { approvalQueue: queueB });
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.ACT_HIGH);
    orchestrator.registerWorker(worker);

    const execution = orchestrator.executeTask('Dangerous cleanup');
    // The restarted instance re-enters the gate on the persisted record and
    // parks in WAITING_APPROVAL (its own audit spine proves it got there).
    await vi.waitFor(() => {
      expect(
        orchestrator.auditTrail.getHistory().some((e) => e.action === 'approval.waiting'),
      ).toBe(true);
    });
    await delay(50);
    expect(queueB.getById('approval-sub-1')?.status).toBe('pending');
    expect(worker.executedTasks).toHaveLength(0);

    // The authenticated decision lands on the restarted instance.
    queueB.approve('approval-sub-1', OWNER);
    const result = await execution;
    expect(result.status).toBe('completed');
    expect(worker.executedTasks).toHaveLength(1);

    // And the decision is itself durable: a third instance reads it back.
    const queueC = new ApprovalQueue({ store: new FileApprovalStore(file) });
    expect(queueC.getById('approval-sub-1')?.status).toBe('approved');
    expect(queueC.getById('approval-sub-1')?.decision?.decidedBy).toBe('user-owner');
  });

  it('a persisted record tampered on disk fails the integrity check', () => {
    const queue = new ApprovalQueue({ store: new FileApprovalStore(file) });
    queue.submit({
      id: 'req-disk',
      agentId: 'agent-1',
      action: 'delete-user-data',
      riskLevel: 'high',
      resourceId: 'node-9',
    });
    queue.approve('req-disk', OWNER);

    // Attacker edits the stored action but cannot recompute a matching
    // history of decisions — the recorded hash no longer matches the fields.
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Array<{
      request: { action: string };
    }>;
    raw[0]!.request.action = 'delete-user-data-and-exfiltrate';
    writeFileSync(file, JSON.stringify(raw, null, 2), 'utf8');

    const fresh = new ApprovalQueue({ store: new FileApprovalStore(file) });
    expect(
      fresh.verifyActionIntegrity('req-disk', {
        action: 'delete-user-data-and-exfiltrate',
        agentId: 'agent-1',
        resourceId: 'node-9',
        riskLevel: 'high',
      }),
    ).toBe(false);
  });
});
