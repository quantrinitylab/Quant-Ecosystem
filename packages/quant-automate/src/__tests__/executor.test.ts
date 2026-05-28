import { describe, it, expect, vi } from 'vitest';
import { StepExecutor } from '../executor.js';
import type { AutomationStep, ToolExecutor } from '../types.js';

function createMockToolExecutor(overrides: Partial<ToolExecutor> = {}): ToolExecutor {
  return {
    execute: vi.fn().mockResolvedValue({ success: true, data: { result: 'done' } }),
    ...overrides,
  };
}

describe('StepExecutor', () => {
  it('should execute a simple step successfully', async () => {
    const executor = createMockToolExecutor();
    const stepExecutor = new StepExecutor(executor);

    const steps: AutomationStep[] = [{ id: 'step1', toolId: 'mail.send', name: 'Send Email' }];

    const results = await stepExecutor.executeSteps(steps);

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('completed');
    expect(results[0]!.stepId).toBe('step1');
    expect(executor.execute).toHaveBeenCalledWith('mail.send', {});
  });

  it('should resolve input mapping with template syntax', async () => {
    const executeFn = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: { fileId: 'abc123', name: 'report.pdf' } })
      .mockResolvedValueOnce({ success: true, data: { sent: true } });

    const executor: ToolExecutor = { execute: executeFn };
    const stepExecutor = new StepExecutor(executor);

    const steps: AutomationStep[] = [
      { id: 'step1', toolId: 'drive.upload', name: 'Upload File' },
      {
        id: 'step2',
        toolId: 'mail.send',
        name: 'Send Link',
        inputMapping: {
          attachmentId: '{{step1.output.fileId}}',
          fileName: '{{step1.output.name}}',
        },
      },
    ];

    const results = await stepExecutor.executeSteps(steps);

    expect(results).toHaveLength(2);
    expect(results[1]!.status).toBe('completed');
    expect(executeFn).toHaveBeenNthCalledWith(2, 'mail.send', {
      attachmentId: 'abc123',
      fileName: 'report.pdf',
    });
  });

  it('should skip step when condition evaluates to false', async () => {
    const executeFn = vi.fn().mockResolvedValueOnce({ success: true, data: { count: 3 } });

    const executor: ToolExecutor = { execute: executeFn };
    const stepExecutor = new StepExecutor(executor);

    const steps: AutomationStep[] = [
      { id: 'step1', toolId: 'data.count', name: 'Count Items' },
      {
        id: 'step2',
        toolId: 'mail.send',
        name: 'Alert',
        condition: {
          field: 'step1.output.count',
          operator: 'gt',
          value: 10,
        },
      },
    ];

    const results = await stepExecutor.executeSteps(steps);

    expect(results).toHaveLength(2);
    expect(results[1]!.status).toBe('skipped');
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure with exponential backoff', async () => {
    const executeFn = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'timeout' })
      .mockResolvedValueOnce({ success: false, error: 'timeout' })
      .mockResolvedValueOnce({ success: true, data: { ok: true } });

    const executor: ToolExecutor = { execute: executeFn };
    const stepExecutor = new StepExecutor(executor);

    const steps: AutomationStep[] = [
      {
        id: 'step1',
        toolId: 'api.call',
        name: 'API Call',
        retryPolicy: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 },
      },
    ];

    const results = await stepExecutor.executeSteps(steps);

    expect(results[0]!.status).toBe('completed');
    expect(results[0]!.retryCount).toBe(2);
    expect(executeFn).toHaveBeenCalledTimes(3);
  });

  it('should fail after max retries exceeded', async () => {
    const executeFn = vi.fn().mockResolvedValue({ success: false, error: 'service unavailable' });

    const executor: ToolExecutor = { execute: executeFn };
    const stepExecutor = new StepExecutor(executor);

    const steps: AutomationStep[] = [
      {
        id: 'step1',
        toolId: 'api.call',
        name: 'API Call',
        retryPolicy: { maxRetries: 2, baseDelayMs: 1 },
      },
    ];

    const results = await stepExecutor.executeSteps(steps);

    expect(results[0]!.status).toBe('failed');
    expect(results[0]!.error).toBe('service unavailable');
    expect(results[0]!.retryCount).toBe(2);
    expect(executeFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('should execute multi-step automation sequentially', async () => {
    const callOrder: string[] = [];
    const executeFn = vi.fn().mockImplementation(async (toolId: string) => {
      callOrder.push(toolId);
      return { success: true, data: { tool: toolId } };
    });

    const executor: ToolExecutor = { execute: executeFn };
    const stepExecutor = new StepExecutor(executor);

    const steps: AutomationStep[] = [
      { id: 'step1', toolId: 'tool.a', name: 'Step A' },
      { id: 'step2', toolId: 'tool.b', name: 'Step B' },
      { id: 'step3', toolId: 'tool.c', name: 'Step C' },
    ];

    const results = await stepExecutor.executeSteps(steps);

    expect(results).toHaveLength(3);
    expect(callOrder).toEqual(['tool.a', 'tool.b', 'tool.c']);
    expect(results.every((r) => r.status === 'completed')).toBe(true);
  });

  it('should stop execution on failure with onError fail mode (default)', async () => {
    const executeFn = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: {} })
      .mockResolvedValueOnce({ success: false, error: 'failed step' })
      .mockResolvedValueOnce({ success: true, data: {} });

    const executor: ToolExecutor = { execute: executeFn };
    const stepExecutor = new StepExecutor(executor);

    const steps: AutomationStep[] = [
      { id: 'step1', toolId: 'tool.a', name: 'Step A' },
      { id: 'step2', toolId: 'tool.b', name: 'Step B' },
      { id: 'step3', toolId: 'tool.c', name: 'Step C' },
    ];

    const results = await stepExecutor.executeSteps(steps);

    expect(results).toHaveLength(2); // step3 never executes
    expect(results[1]!.status).toBe('failed');
  });

  it('should continue execution on failure with onError skip mode', async () => {
    const executeFn = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: {} })
      .mockResolvedValueOnce({ success: false, error: 'non-critical' })
      .mockResolvedValueOnce({ success: true, data: {} });

    const executor: ToolExecutor = { execute: executeFn };
    const stepExecutor = new StepExecutor(executor);

    const steps: AutomationStep[] = [
      { id: 'step1', toolId: 'tool.a', name: 'Step A' },
      { id: 'step2', toolId: 'tool.b', name: 'Step B', onError: 'skip' },
      { id: 'step3', toolId: 'tool.c', name: 'Step C' },
    ];

    const results = await stepExecutor.executeSteps(steps);

    expect(results).toHaveLength(3);
    expect(results[1]!.status).toBe('skipped');
    expect(results[2]!.status).toBe('completed');
  });

  it('should handle thrown errors during execution', async () => {
    const executeFn = vi.fn().mockRejectedValue(new Error('Network error'));

    const executor: ToolExecutor = { execute: executeFn };
    const stepExecutor = new StepExecutor(executor);

    const steps: AutomationStep[] = [{ id: 'step1', toolId: 'tool.a', name: 'Step A' }];

    const results = await stepExecutor.executeSteps(steps);

    expect(results[0]!.status).toBe('failed');
    expect(results[0]!.error).toBe('Network error');
  });
});
