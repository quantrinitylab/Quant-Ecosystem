import { describe, it, expect } from 'vitest';
import { TriggerEvaluator } from '../triggers.js';
import type { AutomationTrigger, TriggerContext } from '../types.js';

function createContext(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    currentTime: Date.now(),
    ...overrides,
  };
}

describe('TriggerEvaluator', () => {
  const evaluator = new TriggerEvaluator();

  it('should fire schedule trigger when cron matches current time', () => {
    // Set time to a known date: 2024-06-15 at 09:30 (Saturday, dow=6)
    const date = new Date(2024, 5, 15, 9, 30, 0);
    const trigger: AutomationTrigger = {
      type: 'schedule',
      cron: { expression: '30 9 * * *' }, // every day at 9:30
    };
    const context = createContext({ currentTime: date.getTime() });

    expect(evaluator.shouldFire(trigger, context)).toBe(true);
  });

  it('should not fire schedule trigger when cron does not match', () => {
    const date = new Date(2024, 5, 15, 10, 0, 0); // 10:00
    const trigger: AutomationTrigger = {
      type: 'schedule',
      cron: { expression: '30 9 * * *' }, // 9:30 only
    };
    const context = createContext({ currentTime: date.getTime() });

    expect(evaluator.shouldFire(trigger, context)).toBe(false);
  });

  it('should fire event trigger when event name and filters match', () => {
    const trigger: AutomationTrigger = {
      type: 'event',
      eventName: 'email.received',
      filters: { from: 'boss@company.com' },
    };
    const context = createContext({
      event: {
        name: 'email.received',
        payload: { from: 'boss@company.com', subject: 'Hello' },
      },
    });

    expect(evaluator.shouldFire(trigger, context)).toBe(true);
  });

  it('should not fire event trigger when filters do not match', () => {
    const trigger: AutomationTrigger = {
      type: 'event',
      eventName: 'email.received',
      filters: { from: 'boss@company.com' },
    };
    const context = createContext({
      event: {
        name: 'email.received',
        payload: { from: 'spam@evil.com', subject: 'Hello' },
      },
    });

    expect(evaluator.shouldFire(trigger, context)).toBe(false);
  });

  it('should fire webhook trigger when path matches', () => {
    const trigger: AutomationTrigger = {
      type: 'webhook',
      path: '/hooks/deploy',
      method: 'POST',
    };
    const context = createContext({
      webhook: { path: '/hooks/deploy', method: 'POST', headers: {} },
    });

    expect(evaluator.shouldFire(trigger, context)).toBe(true);
  });

  it('should not fire webhook trigger when path does not match', () => {
    const trigger: AutomationTrigger = {
      type: 'webhook',
      path: '/hooks/deploy',
    };
    const context = createContext({
      webhook: { path: '/hooks/other', method: 'POST', headers: {} },
    });

    expect(evaluator.shouldFire(trigger, context)).toBe(false);
  });

  it('should always fire manual trigger', () => {
    const trigger: AutomationTrigger = { type: 'manual' };
    const context = createContext();

    expect(evaluator.shouldFire(trigger, context)).toBe(true);
  });

  it('should fire AI condition trigger when evaluation is positive with high confidence', () => {
    const trigger: AutomationTrigger = {
      type: 'ai_condition',
      condition: 'inbox has urgent emails',
    };
    const context = createContext({
      aiEvaluation: { result: true, confidence: 0.9 },
    });

    expect(evaluator.shouldFire(trigger, context)).toBe(true);
  });

  it('should not fire AI condition trigger with low confidence', () => {
    const trigger: AutomationTrigger = {
      type: 'ai_condition',
      condition: 'inbox has urgent emails',
    };
    const context = createContext({
      aiEvaluation: { result: true, confidence: 0.3 },
    });

    expect(evaluator.shouldFire(trigger, context)).toBe(false);
  });

  it('should not fire schedule trigger for invalid cron expression', () => {
    const trigger: AutomationTrigger = {
      type: 'schedule',
      cron: { expression: 'invalid cron' },
    };
    const context = createContext();

    expect(evaluator.shouldFire(trigger, context)).toBe(false);
  });

  it('should handle schedule trigger with day-of-week matching', () => {
    // Monday is dow=1, 2024-06-17 is a Monday
    const date = new Date(2024, 5, 17, 9, 0, 0);
    const trigger: AutomationTrigger = {
      type: 'schedule',
      cron: { expression: '0 9 * * 1' }, // Every Monday at 9:00
    };
    const context = createContext({ currentTime: date.getTime() });

    expect(evaluator.shouldFire(trigger, context)).toBe(true);
  });
});
