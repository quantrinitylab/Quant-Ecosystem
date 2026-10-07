import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutor } from '../executor/tool-executor.js';
import type { ToolExecutionContext, ToolPlan } from '../types.js';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let context: ToolExecutionContext;

  beforeEach(() => {
    executor = new ToolExecutor();
    context = {
      userId: 'user-1',
      sessionId: 'session-1',
      permissions: 3,
      dryRun: false,
    };
  });

  it('should execute a single tool with registered handler', async () => {
    executor.registerHandler('test.echo', async (params) => {
      return { echoed: params['message'] };
    });

    const result = await executor.executeSingle('test.echo', { message: 'hello' }, context);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ echoed: 'hello' });
    expect(result.toolId).toBe('test.echo');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should fail for unregistered tool', async () => {
    const result = await executor.executeSingle('nonexistent', {}, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No handler registered');
  });

  it('should handle handler errors', async () => {
    executor.registerHandler('test.fail', async () => {
      throw new Error('Intentional failure');
    });

    const result = await executor.executeSingle('test.fail', {}, context);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Intentional failure');
  });

  it('should support dry-run mode', async () => {
    executor.registerHandler('test.action', async () => {
      return { performed: true };
    });

    const dryContext: ToolExecutionContext = { ...context, dryRun: true };
    const result = await executor.executeSingle('test.action', { key: 'val' }, dryContext);
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['dryRun']).toBe(true);
  });

  it('should execute a multi-step plan sequentially', async () => {
    const order: string[] = [];

    executor.registerHandler('step.one', async () => {
      order.push('one');
      return { value: 1 };
    });
    executor.registerHandler('step.two', async () => {
      order.push('two');
      return { value: 2 };
    });

    const plan: ToolPlan = {
      id: 'plan-1',
      steps: [
        { stepId: 'step-1', toolId: 'step.one', params: {}, dependsOn: [], outputKey: 'out1' },
        {
          stepId: 'step-2',
          toolId: 'step.two',
          params: {},
          dependsOn: ['step-1'],
          outputKey: 'out2',
        },
      ],
      estimatedCost: 'free',
      requiredPermission: 0,
      description: 'test plan',
    };

    const results = await executor.execute(plan, context);
    expect(results).toHaveLength(2);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(true);
    expect(order).toEqual(['one', 'two']);
  });

  it('should stop execution on step failure', async () => {
    executor.registerHandler('step.ok', async () => ({ ok: true }));
    executor.registerHandler('step.fail', async () => {
      throw new Error('broke');
    });
    executor.registerHandler('step.after', async () => ({ after: true }));

    const plan: ToolPlan = {
      id: 'plan-2',
      steps: [
        { stepId: 's1', toolId: 'step.ok', params: {}, dependsOn: [], outputKey: 'o1' },
        { stepId: 's2', toolId: 'step.fail', params: {}, dependsOn: ['s1'], outputKey: 'o2' },
        { stepId: 's3', toolId: 'step.after', params: {}, dependsOn: ['s2'], outputKey: 'o3' },
      ],
      estimatedCost: 'free',
      requiredPermission: 0,
      description: 'fail plan',
    };

    const results = await executor.execute(plan, context);
    expect(results).toHaveLength(2); // stops after failure
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(false);
  });

  it('should pass state between steps via dependency data', async () => {
    executor.registerHandler('step.produce', async () => ({ produced: 'data' }));
    executor.registerHandler('step.consume', async (params) => {
      return { received: params['_dep_step-1'] };
    });

    const plan: ToolPlan = {
      id: 'plan-3',
      steps: [
        {
          stepId: 'step-1',
          toolId: 'step.produce',
          params: {},
          dependsOn: [],
          outputKey: 'out1',
        },
        {
          stepId: 'step-2',
          toolId: 'step.consume',
          params: {},
          dependsOn: ['step-1'],
          outputKey: 'out2',
        },
      ],
      estimatedCost: 'free',
      requiredPermission: 0,
      description: 'state pass',
    };

    const results = await executor.execute(plan, context);
    expect(results[1]!.success).toBe(true);
    const data = results[1]!.data as Record<string, unknown>;
    expect(data['received']).toEqual({ produced: 'data' });
  });

  it('should record audit entries', async () => {
    executor.registerHandler('test.audited', async () => ({ done: true }));
    await executor.executeSingle('test.audited', {}, context);

    const entries = executor.getAuditEntries();
    expect(entries.length).toBeGreaterThanOrEqual(2); // invoke + success
    expect(entries[0]!.action).toBe('invoke');
    expect(entries[1]!.action).toBe('success');
    expect(entries[0]!.userId).toBe('user-1');
  });

  it('should generate unique execution IDs', async () => {
    executor.registerHandler('test.id', async () => ({}));

    const r1 = await executor.executeSingle('test.id', {}, context);
    const r2 = await executor.executeSingle('test.id', {}, context);
    expect(r1.executionId).not.toBe(r2.executionId);
  });
});
