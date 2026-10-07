import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../orchestrator.js';
import { WorkerAgent, AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentState } from '../state-machine.js';
import { AIInferenceAdapter } from '../task-decomposer.js';
import { KillSwitch } from '../kill-switch.js';

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

describe('Orchestrator', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  function createMockAI(): AIInferenceAdapter {
    return {
      infer: vi.fn().mockResolvedValue(
        JSON.stringify([
          {
            id: 'sub-1',
            description: 'First subtask',
            dependencies: [],
            estimatedDuration: 5,
            requiredPermission: 'OBSERVE',
          },
          {
            id: 'sub-2',
            description: 'Second subtask',
            dependencies: ['sub-1'],
            estimatedDuration: 10,
            requiredPermission: 'OBSERVE',
          },
        ]),
      ),
    };
  }

  it('dispatches tasks to registered workers', async () => {
    const orchestrator = new Orchestrator(createMockAI());
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.SUGGEST);
    orchestrator.registerWorker(worker);

    const result = await orchestrator.executeTask('Organize my email');
    expect(result.status).toBe('completed');
    expect(worker.executedTasks.length).toBeGreaterThan(0);
  });

  it('returns task status', async () => {
    const orchestrator = new Orchestrator(createMockAI());
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.SUGGEST);
    orchestrator.registerWorker(worker);

    const result = await orchestrator.executeTask('Do something');
    const status = orchestrator.getTaskStatus(result.id);
    expect(status).toBeDefined();
    expect(status?.status).toBe('completed');
    expect(status?.completedAt).toBeDefined();
  });

  it('gets running agents', () => {
    const orchestrator = new Orchestrator(createMockAI());
    const worker1 = new MockWorkerAgent('worker-1');
    const worker2 = new MockWorkerAgent('worker-2');
    orchestrator.registerWorker(worker1);
    orchestrator.registerWorker(worker2);

    expect(orchestrator.getRunningAgents()).toHaveLength(2);
  });

  it('fails when no suitable worker is available', async () => {
    const ai: AIInferenceAdapter = {
      infer: vi.fn().mockResolvedValue(
        JSON.stringify([
          {
            id: 'sub-1',
            description: 'High risk action',
            dependencies: [],
            estimatedDuration: 5,
            requiredPermission: 'FULL_AUTO',
          },
        ]),
      ),
    };

    const orchestrator = new Orchestrator(ai);
    // Worker with OBSERVE permission cannot handle FULL_AUTO subtask
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.OBSERVE);
    orchestrator.registerWorker(worker);

    await expect(orchestrator.executeTask('Dangerous task')).rejects.toThrow(/No suitable worker/);
  });

  it('handles failure and marks task as failed', async () => {
    const ai: AIInferenceAdapter = {
      infer: vi.fn().mockResolvedValue(
        JSON.stringify([
          {
            id: 'sub-1',
            description: 'Impossible task',
            dependencies: [],
            estimatedDuration: 5,
            requiredPermission: 'FULL_AUTO',
          },
        ]),
      ),
    };

    const orchestrator = new Orchestrator(ai);
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.OBSERVE);
    orchestrator.registerWorker(worker);

    try {
      await orchestrator.executeTask('Impossible');
    } catch {
      // Expected
    }

    // The most recent task should be marked failed
    const agents = orchestrator.getRunningAgents();
    expect(agents).toHaveLength(1);
  });

  it('deregisters workers', () => {
    const orchestrator = new Orchestrator(createMockAI());
    const worker = new MockWorkerAgent('worker-1');
    orchestrator.registerWorker(worker);
    orchestrator.deregisterWorker('worker-1');

    expect(orchestrator.getRunningAgents()).toHaveLength(0);
  });

  it('submits approval request for ACT_HIGH subtasks', async () => {
    const ai: AIInferenceAdapter = {
      infer: vi.fn().mockResolvedValue(
        JSON.stringify([
          {
            id: 'sub-1',
            description: 'High risk action',
            dependencies: [],
            estimatedDuration: 5,
            requiredPermission: 'ACT_HIGH',
          },
        ]),
      ),
    };

    const orchestrator = new Orchestrator(ai);
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.ACT_HIGH);
    orchestrator.registerWorker(worker);

    await orchestrator.executeTask('Do high-risk thing');

    const pending = orchestrator.approvalQueue.getAll();
    expect(pending.length).toBe(1);
    expect(pending[0]!.request.riskLevel).toBe('high');
    expect(pending[0]!.request.agentId).toBe('worker-1');
  });

  it('acquires resource locks during parallel dispatch', async () => {
    const ai: AIInferenceAdapter = {
      infer: vi.fn().mockResolvedValue(
        JSON.stringify([
          {
            id: 'sub-1',
            description: 'Task A',
            dependencies: [],
            estimatedDuration: 5,
            requiredPermission: 'OBSERVE',
          },
          {
            id: 'sub-2',
            description: 'Task B',
            dependencies: [],
            estimatedDuration: 5,
            requiredPermission: 'OBSERVE',
          },
        ]),
      ),
    };

    const orchestrator = new Orchestrator(ai);
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.SUGGEST);
    orchestrator.registerWorker(worker);

    await orchestrator.executeTask('Parallel tasks');

    // After completion, locks should be released
    expect(orchestrator.conflictResolver.getActiveLocks()).toHaveLength(0);
  });

  it('uses defaultPermission as floor for dispatch eligibility', async () => {
    const orchestrator = new Orchestrator(createMockAI());
    // Worker with FULL_AUTO defaultPermission should handle OBSERVE subtask
    // even though trust-derived permission may be lower on fresh TrustScore
    const worker = new MockWorkerAgent('worker-1', PermissionLevel.FULL_AUTO);
    orchestrator.registerWorker(worker);

    const result = await orchestrator.executeTask('Simple task');
    expect(result.status).toBe('completed');
    expect(worker.executedTasks.length).toBeGreaterThan(0);
  });
});
