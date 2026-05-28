import { describe, it, expect } from 'vitest';
import { CronParser } from '../triggers/cron-parser.js';
import { TriggerSystem } from '../triggers/trigger-system.js';
import { ActionExecutor } from '../execution/action-executor.js';
import { FlowController } from '../execution/flow-controller.js';
import { DurableExecutor } from '../execution/durable-executor.js';
import { NLAutomationBuilder } from '../builder/nl-builder.js';
import type { Automation, AutomationAction, Trigger } from '../types.js';

describe('CronParser', () => {
  it('should parse a valid cron expression', () => {
    const parser = new CronParser();
    const schedule = parser.parse('0 9 * * *');
    expect(schedule).not.toBeNull();
    expect(schedule!.minute).toBe('0');
    expect(schedule!.hour).toBe('9');
    expect(schedule!.dayOfMonth).toBe('*');
    expect(schedule!.month).toBe('*');
    expect(schedule!.dayOfWeek).toBe('*');
  });

  it('should reject an invalid cron expression', () => {
    const parser = new CronParser();
    expect(parser.parse('invalid')).toBeNull();
    expect(parser.parse('60 9 * * *')).toBeNull();
    expect(parser.parse('0 25 * * *')).toBeNull();
    expect(parser.isValid('* * * *')).toBe(false);
  });

  it('should calculate next run time', () => {
    const parser = new CronParser();
    const after = new Date('2024-01-15T08:00:00Z');
    const next = parser.getNextRun('0 9 * * *', after);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(9);
    expect(next!.getMinutes()).toBe(0);
  });

  it('should describe a cron expression in human-readable form', () => {
    const parser = new CronParser();
    const desc = parser.describe('0 9 * * *');
    expect(desc).toContain('9');
    expect(desc).toContain('AM');
  });

  it('should match a date against a cron expression', () => {
    const parser = new CronParser();
    const date = new Date('2024-01-15T09:00:00');
    // minute=0, hour=9
    expect(parser.matches('0 9 * * *', date)).toBe(true);
    expect(parser.matches('30 9 * * *', date)).toBe(false);
  });
});

describe('TriggerSystem', () => {
  it('should evaluate cron triggers against current time', () => {
    const system = new TriggerSystem();
    const date = new Date('2024-01-15T09:00:00');
    expect(system.evaluateCron('0 9 * * *', date)).toBe(true);
    expect(system.evaluateCron('0 10 * * *', date)).toBe(false);
  });

  it('should match event triggers', () => {
    const system = new TriggerSystem();
    const trigger: Trigger = {
      id: 'trigger_1',
      type: 'event',
      config: { type: 'event', eventName: 'quantmail.received', appId: 'quantmail' },
      enabled: true,
    };
    system.registerTrigger('auto_1', trigger);

    const matched = system.handleEvent('quantmail.received', 'quantmail', {});
    expect(matched).toContain('auto_1');
  });

  it('should match webhook triggers', () => {
    const system = new TriggerSystem();
    const trigger: Trigger = {
      id: 'trigger_1',
      type: 'webhook',
      config: { type: 'webhook', path: '/hooks/notify', method: 'POST' },
      enabled: true,
    };
    system.registerTrigger('auto_1', trigger);

    const matched = system.handleWebhook('/hooks/notify', 'POST');
    expect(matched).toContain('auto_1');
    expect(system.handleWebhook('/hooks/other', 'GET')).toHaveLength(0);
  });

  it('should remove triggers', () => {
    const system = new TriggerSystem();
    const trigger: Trigger = {
      id: 'trigger_1',
      type: 'event',
      config: { type: 'event', eventName: 'test.event', appId: 'test' },
      enabled: true,
    };
    system.registerTrigger('auto_1', trigger);
    expect(system.removeTrigger('auto_1', 'trigger_1')).toBe(true);
    expect(system.getTriggersForAutomation('auto_1')).toHaveLength(0);
  });
});

describe('ActionExecutor', () => {
  it('should execute an action successfully', async () => {
    const executor = new ActionExecutor();
    const action: AutomationAction = {
      id: 'action_1',
      toolId: 'neon.post',
      params: { type: 'reel' },
      retryPolicy: { maxRetries: 0, backoffMs: 100, backoffMultiplier: 2 },
      timeoutMs: 5000,
      order: 1,
    };

    const result = await executor.execute(action, {});
    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toBe(1);
  });

  it('should handle action failure', async () => {
    const executor = new ActionExecutor();
    const action: AutomationAction = {
      id: 'action_2',
      toolId: 'failing.tool',
      params: {},
      retryPolicy: { maxRetries: 0, backoffMs: 100, backoffMultiplier: 2 },
      timeoutMs: 5000,
      order: 1,
    };

    const result = await executor.execute(action, { __force_failure: true });
    expect(result.success).toBe(false);
    expect(result.error).not.toBeNull();
  });

  it('should retry on failure with backoff', async () => {
    const executor = new ActionExecutor();
    const action: AutomationAction = {
      id: 'action_3',
      toolId: 'flaky.tool',
      params: {},
      retryPolicy: { maxRetries: 2, backoffMs: 10, backoffMultiplier: 2 },
      timeoutMs: 5000,
      order: 1,
    };

    // Success case (no force failure)
    const result = await executor.executeWithRetry(action, {});
    expect(result.success).toBe(true);
  });
});

describe('FlowController', () => {
  it('should evaluate condition with eq operator', () => {
    const controller = new FlowController();
    const config = {
      type: 'condition' as const,
      field: 'status',
      operator: 'eq' as const,
      value: 'active',
      trueActionId: 'action_1',
      falseActionId: 'action_2',
    };

    expect(controller.evaluateCondition(config, { status: 'active' })).toBe(true);
    expect(controller.evaluateCondition(config, { status: 'paused' })).toBe(false);
  });

  it('should execute loop with max iterations', async () => {
    const controller = new FlowController();
    const actions: AutomationAction[] = [
      {
        id: 'loop_action',
        toolId: 'test.action',
        params: {},
        retryPolicy: { maxRetries: 0, backoffMs: 0, backoffMultiplier: 1 },
        timeoutMs: 1000,
        order: 1,
      },
    ];
    const config = { type: 'loop' as const, maxIterations: 3 };
    const results = await controller.executeLoop(actions, config, {});
    expect(results).toHaveLength(3);
  });

  it('should select correct branch based on context', () => {
    const controller = new FlowController();
    const config = {
      type: 'branch' as const,
      branches: [
        { condition: 'priority == high', actionId: 'action_urgent' },
        { condition: 'priority == low', actionId: 'action_normal' },
      ],
    };

    expect(controller.executeBranch(config, { priority: 'high' })).toBe('action_urgent');
    expect(controller.executeBranch(config, { priority: 'low' })).toBe('action_normal');
    expect(controller.executeBranch(config, { priority: 'medium' })).toBeNull();
  });
});

describe('DurableExecutor', () => {
  function createTestAutomation(): Automation {
    return {
      id: 'auto_test_1',
      name: 'Test Automation',
      description: 'Test',
      triggers: [],
      actions: [
        {
          id: 'a1',
          toolId: 'test.tool',
          params: {},
          retryPolicy: { maxRetries: 0, backoffMs: 0, backoffMultiplier: 1 },
          timeoutMs: 1000,
          order: 1,
        },
      ],
      flowControls: [],
      status: 'active',
      durableState: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastRunAt: null,
      runCount: 0,
    };
  }

  it('should start execution and create durable state', () => {
    const executor = new DurableExecutor();
    const automation = createTestAutomation();
    const state = executor.start(automation, {});
    expect(state.automationId).toBe('auto_test_1');
    expect(state.currentStep).toBe(0);
    expect(state.resumable).toBe(true);
  });

  it('should checkpoint execution state', () => {
    const executor = new DurableExecutor();
    const automation = createTestAutomation();
    executor.start(automation, {});
    executor.checkpoint('auto_test_1', 1, { processed: true }, 'step_1_output');
    const state = executor.getState('auto_test_1');
    expect(state).not.toBeNull();
    expect(state!.currentStep).toBe(1);
    expect(state!.checkpoints).toHaveLength(1);
    expect(state!.checkpoints[0]!.output).toBe('step_1_output');
  });

  it('should resume from last checkpoint', () => {
    const executor = new DurableExecutor();
    const automation = createTestAutomation();
    executor.start(automation, {});
    executor.checkpoint('auto_test_1', 2, { step: 2 }, 'output_2');
    const resumed = executor.resume('auto_test_1');
    expect(resumed).not.toBeNull();
    expect(resumed!.currentStep).toBe(2);
    expect(resumed!.checkpoints).toHaveLength(1);
  });

  it('should clear state', () => {
    const executor = new DurableExecutor();
    const automation = createTestAutomation();
    executor.start(automation, {});
    expect(executor.clear('auto_test_1')).toBe(true);
    expect(executor.getState('auto_test_1')).toBeNull();
  });
});

describe('NLAutomationBuilder', () => {
  it('should parse "every day at 9am" pattern', () => {
    const builder = new NLAutomationBuilder();
    const result = builder.parse('every day at 9am, post a reel');
    expect(result).not.toBeNull();
    expect(result!.triggers).toHaveLength(1);
    expect(result!.triggers![0]!.type).toBe('schedule');
    expect(result!.actions).toHaveLength(1);
    expect(result!.actions![0]!.toolId).toBe('neon.post');
  });

  it('should parse "every Monday" pattern', () => {
    const builder = new NLAutomationBuilder();
    const result = builder.parse('every Monday, backup my files');
    expect(result).not.toBeNull();
    expect(result!.triggers).toHaveLength(1);
    const trigger = result!.triggers![0]!;
    expect(trigger.config.type).toBe('schedule');
  });

  it('should parse email forwarding pattern', () => {
    const builder = new NLAutomationBuilder();
    const result = builder.parse(
      'when I get an email from boss@work.com, forward to team@chat.com',
    );
    expect(result).not.toBeNull();
    expect(result!.triggers).toHaveLength(1);
    expect(result!.triggers![0]!.type).toBe('event');
    expect(result!.actions).toHaveLength(1);
    expect(result!.actions![0]!.toolId).toBe('quantmail.send');
  });

  it('should return null for unrecognized input', () => {
    const builder = new NLAutomationBuilder();
    expect(builder.parse('')).toBeNull();
    expect(builder.parse('hello world')).toBeNull();
  });

  it('should provide suggestions', () => {
    const builder = new NLAutomationBuilder();
    const suggestions = builder.suggest('every');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should create automation from template', () => {
    const builder = new NLAutomationBuilder();
    const automation = builder.fromTemplate('daily-reel');
    expect(automation).not.toBeNull();
    expect(automation!.name).toBe('Daily Reel Post');
    expect(automation!.triggers).toHaveLength(1);
    expect(automation!.actions).toHaveLength(1);
  });
});
