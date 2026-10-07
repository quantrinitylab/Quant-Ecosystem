import { describe, it, expect } from 'vitest';
import { IntentRouter } from '../planner/intent-router.js';
import { MultiStepPlanner } from '../planner/multi-step-planner.js';
import { allTools } from '../tools/index.js';
import type { ToolPlan, ToolPlanStep } from '../types.js';

describe('IntentRouter', () => {
  const router = new IntentRouter(allTools);

  it('should route email-related intents to mail tools', () => {
    const matches = router.route('send an email to someone');
    expect(matches.length).toBeGreaterThan(0);
    const mailMatch = matches.find((m) => m.appId === 'quantmail');
    expect(mailMatch).toBeDefined();
  });

  it('should route calendar intents to calendar tools', () => {
    const matches = router.route('create a new event on my calendar');
    const calMatch = matches.find((m) => m.appId === 'quantcalendar');
    expect(calMatch).toBeDefined();
  });

  it('should extract email parameters from input', () => {
    const matches = router.route('send email to user@example.com');
    const mailMatch = matches.find((m) => m.appId === 'quantmail');
    expect(mailMatch).toBeDefined();
    expect(mailMatch!.extractedParams).toBeDefined();
  });

  it('should return results sorted by confidence', () => {
    const matches = router.route('search files in drive');
    expect(matches.length).toBeGreaterThan(1);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1]!.confidence).toBeGreaterThanOrEqual(matches[i]!.confidence);
    }
  });

  it('should return empty for unrelated input', () => {
    const matches = router.route('xyz zzz qqq');
    expect(matches).toHaveLength(0);
  });

  it('should match by tag keywords', () => {
    const matches = router.route('social post');
    const neonMatch = matches.find((m) => m.appId === 'quantneon');
    expect(neonMatch).toBeDefined();
  });
});

describe('MultiStepPlanner', () => {
  const planner = new MultiStepPlanner();

  it('should create a plan with relevant tools', () => {
    const plan = planner.plan('send email', allTools);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.id).toBeTruthy();
    expect(plan.description).toContain('send email');
  });

  it('should create steps with proper dependencies', () => {
    const plan = planner.plan('search email and send', allTools);
    if (plan.steps.length > 1) {
      expect(plan.steps[1]!.dependsOn.length).toBeGreaterThan(0);
    }
    expect(plan.steps[0]!.dependsOn).toHaveLength(0);
  });

  it('should estimate cost based on tools', () => {
    const plan = planner.plan('upload video and render', allTools);
    expect(['free', 'low', 'medium', 'high']).toContain(plan.estimatedCost);
  });

  it('should validate a valid plan', () => {
    const plan = planner.plan('send email', allTools);
    const result = planner.validatePlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject an empty plan', () => {
    const emptyPlan: ToolPlan = {
      id: 'test',
      steps: [],
      estimatedCost: 'free',
      requiredPermission: 0,
      description: 'empty',
    };
    const result = planner.validatePlan(emptyPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Plan has no steps');
  });

  it('should detect invalid dependencies', () => {
    const badPlan: ToolPlan = {
      id: 'test',
      steps: [
        {
          stepId: 'step-1',
          toolId: 'test.tool',
          params: {},
          dependsOn: ['step-99'],
          outputKey: 'out1',
        },
      ],
      estimatedCost: 'free',
      requiredPermission: 0,
      description: 'bad deps',
    };
    const result = planner.validatePlan(badPlan);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('non-existent step');
  });

  it('should return max permission tier required', () => {
    const plan = planner.plan('send payment refund', allTools);
    expect(plan.requiredPermission).toBeGreaterThanOrEqual(0);
    expect(plan.requiredPermission).toBeLessThanOrEqual(3);
  });

  it('should detect circular dependencies', () => {
    const cyclicPlan: ToolPlan = {
      id: 'test',
      steps: [
        {
          stepId: 'a',
          toolId: 't1',
          params: {},
          dependsOn: ['b'],
          outputKey: 'o1',
        } as ToolPlanStep,
        {
          stepId: 'b',
          toolId: 't2',
          params: {},
          dependsOn: ['a'],
          outputKey: 'o2',
        } as ToolPlanStep,
      ],
      estimatedCost: 'free',
      requiredPermission: 0,
      description: 'cyclic',
    };
    const result = planner.validatePlan(cyclicPlan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Plan has circular dependencies');
  });
});
