import { describe, it, expect } from 'vitest';
import { NLAutomationBuilder } from '../builder/nl-builder.js';
import { TriggerSystem } from '../triggers/trigger-system.js';
import { DurableExecutor } from '../execution/durable-executor.js';
import type { Automation } from '../types.js';

describe('Phase 71 Integration: NL-to-Durable-Automation E2E', () => {
  it('NL to automation to scheduled trigger', () => {
    const builder = new NLAutomationBuilder();
    const triggerSystem = new TriggerSystem();

    // Step 1: Parse natural language to automation
    const automation = builder.parse('every day at 9am, post a reel');
    expect(automation).not.toBeNull();
    expect(automation!.name).toContain('Daily');
    expect(automation!.triggers).toBeDefined();
    expect(automation!.triggers!.length).toBeGreaterThan(0);

    // Step 2: Verify trigger has correct cron expression
    const trigger = automation!.triggers![0]!;
    expect(trigger.type).toBe('schedule');
    expect(trigger.config.type).toBe('schedule');
    if (trigger.config.type === 'schedule') {
      expect(trigger.config.cron).toBe('0 9 * * *');
    }

    // Step 3: Verify action has correct toolId
    expect(automation!.actions).toBeDefined();
    expect(automation!.actions!.length).toBeGreaterThan(0);
    expect(automation!.actions![0]!.toolId).toBe('neon.post');

    // Step 4: Register trigger and evaluate at 9:00 - should match
    triggerSystem.registerTrigger(automation!.id!, trigger);
    const nineAm = new Date('2024-01-15T09:00:00');
    expect(triggerSystem.evaluateCron('0 9 * * *', nineAm)).toBe(true);

    // Step 5: Evaluate at 10:00 - should not match
    const tenAm = new Date('2024-01-15T10:00:00');
    expect(triggerSystem.evaluateCron('0 9 * * *', tenAm)).toBe(false);
  });

  it('durable execution with checkpoint and resume', () => {
    const executor = new DurableExecutor();

    // Create a full automation object
    const automation: Automation = {
      id: 'auto_test_durable_1',
      name: 'Test Durable Automation',
      description: 'An automation to test durable execution',
      triggers: [
        {
          id: 'trigger_1',
          type: 'schedule',
          config: { type: 'schedule', cron: '0 9 * * *' },
          enabled: true,
        },
      ],
      actions: [
        {
          id: 'action_1',
          toolId: 'neon.post',
          params: { type: 'reel' },
          retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
          timeoutMs: 30000,
          order: 1,
        },
        {
          id: 'action_2',
          toolId: 'drive.sync-files',
          params: { recursive: true },
          retryPolicy: { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 },
          timeoutMs: 60000,
          order: 2,
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

    // Step 1: Start durable execution
    const state = executor.start(automation, {});
    expect(state.automationId).toBe('auto_test_durable_1');
    expect(state.currentStep).toBe(0);
    expect(state.resumable).toBe(true);
    expect(state.checkpoints).toHaveLength(0);
    expect(state.startedAt).toBeGreaterThan(0);

    // Step 2: Checkpoint at step 1
    executor.checkpoint('auto_test_durable_1', 1, { progress: '50%' }, { result: 'ok' });
    const updatedState = executor.getState('auto_test_durable_1');
    expect(updatedState).not.toBeNull();
    expect(updatedState!.currentStep).toBe(1);
    expect(updatedState!.checkpoints).toHaveLength(1);
    expect(updatedState!.checkpoints[0]!.stepIndex).toBe(1);
    expect(updatedState!.checkpoints[0]!.state).toEqual({ progress: '50%' });

    // Step 3: Resume - verify state is restored
    const resumed = executor.resume('auto_test_durable_1');
    expect(resumed).not.toBeNull();
    expect(resumed!.currentStep).toBe(1);
    expect(resumed!.checkpoints).toHaveLength(1);
    expect(resumed!.resumable).toBe(true);
  });

  it('automation resumes after interrupt mid-run', () => {
    const executor = new DurableExecutor();

    const automation: Automation = {
      id: 'auto_test_interrupt_1',
      name: 'Interrupt Test Automation',
      description: 'Tests resume after interrupt',
      triggers: [
        {
          id: 'trigger_1',
          type: 'manual',
          config: { type: 'manual' },
          enabled: true,
        },
      ],
      actions: [
        {
          id: 'action_1',
          toolId: 'neon.post',
          params: {},
          retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
          timeoutMs: 30000,
          order: 1,
        },
        {
          id: 'action_2',
          toolId: 'drive.sync-files',
          params: {},
          retryPolicy: { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 },
          timeoutMs: 60000,
          order: 2,
        },
        {
          id: 'action_3',
          toolId: 'quantmail.send',
          params: {},
          retryPolicy: { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 },
          timeoutMs: 15000,
          order: 3,
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

    // Start execution
    executor.start(automation, {});

    // Checkpoint at step 2 (simulating progress through steps 0 and 1)
    executor.checkpoint('auto_test_interrupt_1', 2, { step: 'action_3' }, { partial: true });

    // Verify resumable
    expect(executor.isResumable('auto_test_interrupt_1')).toBe(true);

    // Resume after interrupt
    const resumed = executor.resume('auto_test_interrupt_1');
    expect(resumed).not.toBeNull();
    expect(resumed!.currentStep).toBe(2);
    expect(resumed!.resumable).toBe(true);

    // Checkpoint again at step 3 - verify checkpoints array grows
    executor.checkpoint('auto_test_interrupt_1', 3, { step: 'complete' }, { done: true });
    const finalState = executor.getState('auto_test_interrupt_1');
    expect(finalState).not.toBeNull();
    expect(finalState!.checkpoints).toHaveLength(2);
    expect(finalState!.currentStep).toBe(3);
    expect(finalState!.checkpoints[0]!.stepIndex).toBe(2);
    expect(finalState!.checkpoints[1]!.stepIndex).toBe(3);
  });
});
