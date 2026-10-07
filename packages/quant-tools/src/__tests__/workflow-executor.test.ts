import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowExecutor } from '../executor/workflow-executor.js';
import type { WorkflowEvent } from '../executor/workflow-executor.js';
import { ToolExecutor } from '../executor/tool-executor.js';
import type { ToolDefinition, ToolPlan } from '../types.js';

describe('WorkflowExecutor', () => {
  let executor: ToolExecutor;
  let tools: ToolDefinition[];

  beforeEach(() => {
    executor = new ToolExecutor();
    tools = [];
  });

  function makePlan(
    steps: Array<{ stepId: string; toolId: string; dependsOn?: string[] }>,
  ): ToolPlan {
    return {
      id: 'test-plan',
      steps: steps.map((s) => ({
        stepId: s.stepId,
        toolId: s.toolId,
        params: {},
        dependsOn: s.dependsOn ?? [],
        outputKey: `out_${s.stepId}`,
      })),
      estimatedCost: 'free',
      requiredPermission: 0,
      description: 'test',
    };
  }

  function makeOptions(overrides: Record<string, unknown> = {}) {
    return {
      userId: 'user-1',
      sessionId: 'session-1',
      permissions: 3 as const,
      dryRun: false,
      ...overrides,
    };
  }

  it('should execute a single step successfully', async () => {
    executor.registerHandler('step.one', async () => ({ value: 42 }));
    const wf = new WorkflowExecutor(executor, tools);
    const plan = makePlan([{ stepId: 's1', toolId: 'step.one' }]);
    const result = await wf.execute(plan, makeOptions());
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.success).toBe(true);
    expect(result.results[0]!.data).toEqual({ value: 42 });
  });

  it('should execute multi-step with data passing between dependent steps', async () => {
    executor.registerHandler('step.produce', async () => ({ key: 'produced-data' }));
    executor.registerHandler('step.consume', async (params) => ({
      received: params['_dep_s1'],
    }));

    const wf = new WorkflowExecutor(executor, tools);
    const plan = makePlan([
      { stepId: 's1', toolId: 'step.produce' },
      { stepId: 's2', toolId: 'step.consume', dependsOn: ['s1'] },
    ]);
    const result = await wf.execute(plan, makeOptions());
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[1]!.data).toEqual({ received: { key: 'produced-data' } });
  });

  it('should rollback on failure when enableRollback is true', async () => {
    const undoCalled: string[] = [];

    executor.registerHandler('step.ok', async () => ({ done: true }));
    executor.registerHandler('step.fail', async () => {
      throw new Error('step failed');
    });
    executor.registerHandler('step.ok.undo', async () => {
      undoCalled.push('undone');
      return { undone: true };
    });

    const toolWithUndo: ToolDefinition = {
      id: 'step.ok',
      appId: 'test',
      name: 'OK Step',
      description: 'A step that succeeds',
      inputSchema: {},
      outputSchema: { type: 'object', description: 'result' },
      permissionTier: 0,
      costEstimate: 'free',
      undoRecipe: {
        toolId: 'step.ok.undo',
        params: {},
        description: 'Undo ok step',
        ttlMs: 60000,
      },
      tags: [],
    };

    tools = [toolWithUndo];
    const wf = new WorkflowExecutor(executor, tools);
    const plan = makePlan([
      { stepId: 's1', toolId: 'step.ok' },
      { stepId: 's2', toolId: 'step.fail', dependsOn: ['s1'] },
    ]);

    const result = await wf.execute(plan, makeOptions({ enableRollback: true }));
    expect(result.success).toBe(false);
    expect(result.rollbackResults).toBeDefined();
    expect(result.rollbackResults!.length).toBe(1);
    expect(undoCalled).toEqual(['undone']);
  });

  it('should execute independent steps in parallel', async () => {
    const executionOrder: string[] = [];

    executor.registerHandler('step.a', async () => {
      executionOrder.push('a-start');
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push('a-end');
      return { a: true };
    });
    executor.registerHandler('step.b', async () => {
      executionOrder.push('b-start');
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push('b-end');
      return { b: true };
    });

    const wf = new WorkflowExecutor(executor, tools);
    const plan = makePlan([
      { stepId: 's1', toolId: 'step.a' },
      { stepId: 's2', toolId: 'step.b' },
    ]);

    const result = await wf.execute(plan, makeOptions());
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    // Both started before either ended (parallel)
    expect(executionOrder[0]).toBe('a-start');
    expect(executionOrder[1]).toBe('b-start');
  });

  it('should confirm step execution when confirmationCallback returns true', async () => {
    executor.registerHandler('step.high', async () => ({ done: true }));

    const highTierTool: ToolDefinition = {
      id: 'step.high',
      appId: 'test',
      name: 'High Tier',
      description: 'Needs confirmation',
      inputSchema: {},
      outputSchema: { type: 'object', description: 'result' },
      permissionTier: 2,
      costEstimate: 'free',
      undoRecipe: null,
      tags: [],
    };

    tools = [highTierTool];
    const wf = new WorkflowExecutor(executor, tools);
    const plan = makePlan([{ stepId: 's1', toolId: 'step.high' }]);

    const confirmationCallback = vi.fn().mockResolvedValue(true);
    const result = await wf.execute(plan, makeOptions({ confirmationCallback }));
    expect(confirmationCallback).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('should stop execution when confirmationCallback returns false', async () => {
    executor.registerHandler('step.high', async () => ({ done: true }));

    const highTierTool: ToolDefinition = {
      id: 'step.high',
      appId: 'test',
      name: 'High Tier',
      description: 'Needs confirmation',
      inputSchema: {},
      outputSchema: { type: 'object', description: 'result' },
      permissionTier: 2,
      costEstimate: 'free',
      undoRecipe: null,
      tags: [],
    };

    tools = [highTierTool];
    const wf = new WorkflowExecutor(executor, tools);
    const plan = makePlan([{ stepId: 's1', toolId: 'step.high' }]);

    const confirmationCallback = vi.fn().mockResolvedValue(false);
    const result = await wf.execute(plan, makeOptions({ confirmationCallback }));
    expect(confirmationCallback).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(0);
  });

  it('should timeout a step that takes too long', async () => {
    executor.registerHandler('step.slow', async () => {
      await new Promise((r) => setTimeout(r, 200));
      return { done: true };
    });

    const wf = new WorkflowExecutor(executor, tools);
    const plan = makePlan([{ stepId: 's1', toolId: 'step.slow' }]);
    const result = await wf.execute(plan, makeOptions({ stepTimeoutMs: 50 }));
    expect(result.success).toBe(false);
    expect(result.results[0]!.error).toContain('timed out');
  });

  it('should retry on failure with maxRetries', async () => {
    let attempt = 0;
    executor.registerHandler('step.flaky', async () => {
      attempt++;
      if (attempt < 2) {
        throw new Error('transient');
      }
      return { ok: true };
    });

    const wf = new WorkflowExecutor(executor, tools);
    const plan = makePlan([{ stepId: 's1', toolId: 'step.flaky' }]);
    const result = await wf.execute(plan, makeOptions({ maxRetries: 1 }));
    expect(result.success).toBe(true);
    expect(attempt).toBe(2);
  });

  it('should not call undo handlers when enableRollback is false', async () => {
    const undoCalled: string[] = [];
    executor.registerHandler('step.ok', async () => ({ done: true }));
    executor.registerHandler('step.fail', async () => {
      throw new Error('broke');
    });
    executor.registerHandler('step.ok.undo', async () => {
      undoCalled.push('undone');
      return {};
    });

    const toolWithUndo: ToolDefinition = {
      id: 'step.ok',
      appId: 'test',
      name: 'OK',
      description: 'ok',
      inputSchema: {},
      outputSchema: { type: 'object', description: '' },
      permissionTier: 0,
      costEstimate: 'free',
      undoRecipe: {
        toolId: 'step.ok.undo',
        params: {},
        description: 'undo',
        ttlMs: 60000,
      },
      tags: [],
    };

    tools = [toolWithUndo];
    const wf = new WorkflowExecutor(executor, tools);
    const plan = makePlan([
      { stepId: 's1', toolId: 'step.ok' },
      { stepId: 's2', toolId: 'step.fail', dependsOn: ['s1'] },
    ]);

    const result = await wf.execute(plan, makeOptions({ enableRollback: false }));
    expect(result.success).toBe(false);
    expect(undoCalled).toHaveLength(0);
    expect(result.rollbackResults).toBeUndefined();
  });

  it('should report totalLatencyMs and correct results array', async () => {
    executor.registerHandler('step.one', async () => ({ v: 1 }));
    executor.registerHandler('step.two', async () => ({ v: 2 }));

    const wf = new WorkflowExecutor(executor, tools);
    const plan = makePlan([
      { stepId: 's1', toolId: 'step.one' },
      { stepId: 's2', toolId: 'step.two', dependsOn: ['s1'] },
    ]);

    const result = await wf.execute(plan, makeOptions());
    expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.toolId).toBe('step.one');
    expect(result.results[1]!.toolId).toBe('step.two');
  });

  it('should emit workflow events for step lifecycle', async () => {
    executor.registerHandler('step.one', async () => ({ done: true }));

    const wf = new WorkflowExecutor(executor, tools);
    const events: WorkflowEvent[] = [];
    wf.on((e) => events.push(e));

    const plan = makePlan([{ stepId: 's1', toolId: 'step.one' }]);
    await wf.execute(plan, makeOptions());

    const types = events.map((e) => e.type);
    expect(types).toContain('step_start');
    expect(types).toContain('step_complete');
    expect(types).toContain('execution_complete');
  });
});
