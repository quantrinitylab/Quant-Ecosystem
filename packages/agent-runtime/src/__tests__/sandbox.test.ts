import { describe, it, expect } from 'vitest';
import { AgentSandbox } from '../sandbox.js';

describe('AgentSandbox', () => {
  it('starts in sandbox mode', () => {
    const sandbox = new AgentSandbox();
    expect(sandbox.isInSandbox()).toBe(true);
  });

  it('logs actions without executing in sandbox mode', () => {
    const sandbox = new AgentSandbox(true);
    const result = sandbox.execute('agent-1', 'delete-file', { path: '/tmp/test.txt' });

    expect(result.wouldHaveExecuted).toBe(true);
    expect(result.agentId).toBe('agent-1');
    expect(result.action).toBe('delete-file');
    expect(result.params).toEqual({ path: '/tmp/test.txt' });
    expect(sandbox.getLog()).toHaveLength(1);
  });

  it('records multiple actions', () => {
    const sandbox = new AgentSandbox();
    sandbox.execute('agent-1', 'action-1', {});
    sandbox.execute('agent-1', 'action-2', {});
    sandbox.execute('agent-2', 'action-3', {});

    expect(sandbox.getLog()).toHaveLength(3);
  });

  it('promotes from sandbox to live mode', () => {
    const sandbox = new AgentSandbox();
    expect(sandbox.isInSandbox()).toBe(true);

    sandbox.promote();
    expect(sandbox.isInSandbox()).toBe(false);
  });

  it('marks actions differently after promotion', () => {
    const sandbox = new AgentSandbox();
    sandbox.promote();

    const result = sandbox.execute('agent-1', 'action', {});
    expect(result.wouldHaveExecuted).toBe(false);
  });

  it('resets sandbox state', () => {
    const sandbox = new AgentSandbox();
    sandbox.promote();
    sandbox.execute('agent-1', 'action', {});

    sandbox.reset();
    expect(sandbox.isInSandbox()).toBe(true);
    expect(sandbox.getLog()).toHaveLength(0);
  });

  it('can be initialized in live mode', () => {
    const sandbox = new AgentSandbox(false);
    expect(sandbox.isInSandbox()).toBe(false);
  });
});
