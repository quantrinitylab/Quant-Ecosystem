import { describe, it, expect, beforeEach } from 'vitest';
import { WorkerAgent, AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentState } from '../state-machine.js';
import { KillSwitch } from '../kill-switch.js';

class TestWorkerAgent extends WorkerAgent {
  public executeCalled = false;
  public lastTask: AgentTask | null = null;

  async execute(task: AgentTask): Promise<void> {
    this.executeCalled = true;
    this.lastTask = task;
    this.stateMachine.transition(AgentState.EXECUTING);
    this.logAction(task.description, 'success');
    this.trustScore.recordSuccess();
    this.stateMachine.transition(AgentState.DONE);
  }
}

describe('WorkerAgent', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('initializes with correct properties', () => {
    const agent = new TestWorkerAgent({
      id: 'test-agent',
      name: 'Test Agent',
      icon: 'robot',
      defaultPermission: PermissionLevel.SUGGEST,
    });

    expect(agent.id).toBe('test-agent');
    expect(agent.name).toBe('Test Agent');
    expect(agent.icon).toBe('robot');
    expect(agent.defaultPermission).toBe(PermissionLevel.SUGGEST);
  });

  it('starts in idle state', () => {
    const agent = new TestWorkerAgent({
      id: 'test-agent',
      name: 'Test',
      icon: 'bot',
      defaultPermission: PermissionLevel.SUGGEST,
    });
    expect(agent.stateMachine.getState()).toBe(AgentState.IDLE);
  });

  it('transitions to planning on start', () => {
    const agent = new TestWorkerAgent({
      id: 'test-agent',
      name: 'Test',
      icon: 'bot',
      defaultPermission: PermissionLevel.SUGGEST,
    });
    agent.start();
    expect(agent.stateMachine.getState()).toBe(AgentState.PLANNING);
  });

  it('registers with kill switch on start', () => {
    const ks = KillSwitch.getInstance();
    const agent = new TestWorkerAgent({
      id: 'test-agent',
      name: 'Test',
      icon: 'bot',
      defaultPermission: PermissionLevel.SUGGEST,
    });
    agent.start();
    expect(ks.getRegisteredAgentCount()).toBe(1);
  });

  it('deregisters from kill switch on stop', async () => {
    const ks = KillSwitch.getInstance();
    const agent = new TestWorkerAgent({
      id: 'test-agent',
      name: 'Test',
      icon: 'bot',
      defaultPermission: PermissionLevel.SUGGEST,
    });
    agent.start();
    await agent.run({ id: '1', description: 'test' });
    // After run, state is DONE. stop() only handles certain states.
    // Reset to allow stop:
    agent.stateMachine.transition(AgentState.IDLE);
    agent.start();
    // Now in PLANNING, stop should move to FAILED then IDLE
    await agent.stop();
    expect(ks.getRegisteredAgentCount()).toBe(0);
  });

  it('pauses executing agent', () => {
    const agent = new TestWorkerAgent({
      id: 'test-agent',
      name: 'Test',
      icon: 'bot',
      defaultPermission: PermissionLevel.SUGGEST,
    });
    agent.start();
    agent.stateMachine.transition(AgentState.EXECUTING);
    agent.pause();
    expect(agent.stateMachine.getState()).toBe(AgentState.WAITING_APPROVAL);
  });

  it('runs a task', async () => {
    const agent = new TestWorkerAgent({
      id: 'test-agent',
      name: 'Test',
      icon: 'bot',
      defaultPermission: PermissionLevel.SUGGEST,
    });
    agent.start();
    await agent.run({ id: 'task-1', description: 'Do something' });
    expect(agent.executeCalled).toBe(true);
    expect(agent.lastTask?.id).toBe('task-1');
  });

  it('getStatus returns correct info', () => {
    const agent = new TestWorkerAgent({
      id: 'test-agent',
      name: 'Test Agent',
      icon: 'bot',
      defaultPermission: PermissionLevel.SUGGEST,
    });

    const status = agent.getStatus();
    expect(status.id).toBe('test-agent');
    expect(status.name).toBe('Test Agent');
    expect(status.state).toBe(AgentState.IDLE);
    expect(status.trustScore).toBe(21);
    expect(status.permissionLevel).toBe(PermissionLevel.SUGGEST);
  });

  it('kill switch halts the agent', async () => {
    const ks = KillSwitch.getInstance();
    const agent = new TestWorkerAgent({
      id: 'test-agent',
      name: 'Test',
      icon: 'bot',
      defaultPermission: PermissionLevel.SUGGEST,
    });
    agent.start();
    agent.stateMachine.transition(AgentState.EXECUTING);

    await ks.activate();
    // After kill switch, agent should be in IDLE state
    expect(agent.stateMachine.getState()).toBe(AgentState.IDLE);
  });

  it('routes sandboxed agents through sandbox instead of execute', async () => {
    const agent = new TestWorkerAgent({
      id: 'sandboxed-agent',
      name: 'Sandboxed',
      icon: 'box',
      defaultPermission: PermissionLevel.ACT_LOW,
      sandboxed: true,
    });
    agent.start();
    await agent.run({ id: 'task-1', description: 'Do something risky' });

    // execute should NOT have been called
    expect(agent.executeCalled).toBe(false);
    // Sandbox log should have an entry
    expect(agent.getSandboxLog()).toHaveLength(1);
  });

  it('non-sandboxed agents route through execute', async () => {
    const agent = new TestWorkerAgent({
      id: 'normal-agent',
      name: 'Normal',
      icon: 'bot',
      defaultPermission: PermissionLevel.ACT_LOW,
      sandboxed: false,
    });
    agent.start();
    await agent.run({ id: 'task-1', description: 'Do something' });

    expect(agent.executeCalled).toBe(true);
    expect(agent.getSandboxLog()).toHaveLength(0);
  });

  it('promoteFromSandbox allows execute after promotion', async () => {
    const agent = new TestWorkerAgent({
      id: 'promoted-agent',
      name: 'Promoted',
      icon: 'star',
      defaultPermission: PermissionLevel.ACT_LOW,
      sandboxed: true,
    });

    agent.start();
    await agent.run({ id: 'task-1', description: 'Before promotion' });
    expect(agent.executeCalled).toBe(false);

    agent.promoteFromSandbox();
    agent.stateMachine.reset();
    agent.start();
    await agent.run({ id: 'task-2', description: 'After promotion' });
    expect(agent.executeCalled).toBe(true);
  });
});
