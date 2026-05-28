import { describe, it, expect, vi } from 'vitest';
import { AutomationEngineImpl } from '../engine.js';
import type { Automation, ToolExecutor } from '../types.js';

function createMockToolExecutor(overrides: Partial<ToolExecutor> = {}): ToolExecutor {
  return {
    execute: vi.fn().mockResolvedValue({ success: true, data: { result: 'ok' } }),
    ...overrides,
  };
}

function createTestAutomation(
  overrides: Partial<Omit<Automation, 'id' | 'createdAt' | 'updatedAt'>> = {},
) {
  return {
    name: 'Test Automation',
    status: 'active' as const,
    trigger: { type: 'manual' as const },
    steps: [{ id: 'step1', toolId: 'test.tool', name: 'Test Step' }],
    createdBy: 'user_001',
    ...overrides,
  };
}

describe('AutomationEngineImpl', () => {
  it('should create an automation with generated id and timestamps', () => {
    const engine = new AutomationEngineImpl(createMockToolExecutor());
    const automation = engine.create(createTestAutomation());

    expect(automation.id).toMatch(/^auto_/);
    expect(automation.createdAt).toBeGreaterThan(0);
    expect(automation.updatedAt).toBeGreaterThan(0);
    expect(automation.name).toBe('Test Automation');
  });

  it('should execute a simple automation successfully', async () => {
    const executor = createMockToolExecutor();
    const engine = new AutomationEngineImpl(executor);
    const automation = engine.create(createTestAutomation());

    const result = await engine.execute(automation.id);

    expect(result.status).toBe('completed');
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]!.status).toBe('completed');
    expect(result.automationId).toBe(automation.id);
  });

  it('should execute a multi-step automation', async () => {
    const executor = createMockToolExecutor();
    const engine = new AutomationEngineImpl(executor);
    const automation = engine.create(
      createTestAutomation({
        steps: [
          { id: 'step1', toolId: 'mail.send', name: 'Send Email' },
          { id: 'step2', toolId: 'chat.notify', name: 'Notify Team' },
          { id: 'step3', toolId: 'docs.create', name: 'Create Doc' },
        ],
      }),
    );

    const result = await engine.execute(automation.id);

    expect(result.status).toBe('completed');
    expect(result.stepResults).toHaveLength(3);
    expect(result.stepResults.every((r) => r.status === 'completed')).toBe(true);
  });

  it('should pause and resume an automation', () => {
    const engine = new AutomationEngineImpl(createMockToolExecutor());
    const automation = engine.create(createTestAutomation());

    engine.pause(automation.id);
    expect(engine.get(automation.id)?.status).toBe('paused');

    engine.resume(automation.id);
    expect(engine.get(automation.id)?.status).toBe('active');
  });

  it('should not execute a paused automation', async () => {
    const engine = new AutomationEngineImpl(createMockToolExecutor());
    const automation = engine.create(createTestAutomation());

    engine.pause(automation.id);
    const result = await engine.execute(automation.id);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('paused');
  });

  it('should return error for nonexistent automation', async () => {
    const engine = new AutomationEngineImpl(createMockToolExecutor());
    const result = await engine.execute('nonexistent_id');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('not found');
  });

  it('should track execution history', async () => {
    const engine = new AutomationEngineImpl(createMockToolExecutor());
    const automation = engine.create(createTestAutomation());

    await engine.execute(automation.id);
    await engine.execute(automation.id);
    await engine.execute(automation.id);

    const history = engine.getHistory(automation.id);
    expect(history).toHaveLength(3);
    expect(history.every((r) => r.status === 'completed')).toBe(true);
  });

  it('should handle step failure and mark run as failed', async () => {
    const executor: ToolExecutor = {
      execute: vi.fn().mockResolvedValue({ success: false, error: 'Connection timeout' }),
    };
    const engine = new AutomationEngineImpl(executor);
    const automation = engine.create(createTestAutomation());

    const result = await engine.execute(automation.id);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Connection timeout');
  });

  it('should execute automation with conditions that cause step to be skipped', async () => {
    const executor: ToolExecutor = {
      execute: vi.fn().mockResolvedValue({ success: true, data: { count: 5 } }),
    };
    const engine = new AutomationEngineImpl(executor);
    const automation = engine.create(
      createTestAutomation({
        steps: [
          { id: 'step1', toolId: 'data.fetch', name: 'Fetch Data' },
          {
            id: 'step2',
            toolId: 'mail.send',
            name: 'Send Alert',
            condition: {
              field: 'step1.output.count',
              operator: 'gt',
              value: 100,
            },
          },
        ],
      }),
    );

    const result = await engine.execute(automation.id);

    expect(result.status).toBe('completed');
    expect(result.stepResults[1]!.status).toBe('skipped');
  });

  it('should transition automation status correctly through lifecycle', () => {
    const engine = new AutomationEngineImpl(createMockToolExecutor());
    const automation = engine.create(createTestAutomation({ status: 'active' }));

    expect(engine.get(automation.id)?.status).toBe('active');

    engine.pause(automation.id);
    expect(engine.get(automation.id)?.status).toBe('paused');

    engine.resume(automation.id);
    expect(engine.get(automation.id)?.status).toBe('active');
  });

  it('should list all automations', () => {
    const engine = new AutomationEngineImpl(createMockToolExecutor());
    engine.create(createTestAutomation({ name: 'Auto 1' }));
    engine.create(createTestAutomation({ name: 'Auto 2' }));

    expect(engine.list()).toHaveLength(2);
  });
});
