import { describe, expect, it } from 'vitest';
import {
  advanceAccountFlow,
  completeAccountStep,
  createAccountOnboardingFlow,
} from '../flows/account-onboarding.js';

describe('Account Onboarding Flow', () => {
  it('creates a flow with 4 steps', () => {
    const flow = createAccountOnboardingFlow();
    expect(flow.steps).toHaveLength(4);
    expect(flow.currentStepIndex).toBe(0);
    expect(flow.completedAt).toBeUndefined();
  });

  it('starts with email-verification as active', () => {
    const flow = createAccountOnboardingFlow();
    expect(flow.steps[0]!.id).toBe('email-verification');
    expect(flow.steps[0]!.status).toBe('active');
  });

  it('has remaining steps as pending', () => {
    const flow = createAccountOnboardingFlow();
    expect(flow.steps[1]!.status).toBe('pending');
    expect(flow.steps[2]!.status).toBe('pending');
    expect(flow.steps[3]!.status).toBe('pending');
  });

  it('advances to the next step', () => {
    const flow = createAccountOnboardingFlow();
    const advanced = advanceAccountFlow(flow, { email: 'test@example.com' });

    expect(advanced.steps[0]!.status).toBe('completed');
    expect(advanced.steps[0]!.data).toEqual({ email: 'test@example.com' });
    expect(advanced.steps[1]!.status).toBe('active');
    expect(advanced.currentStepIndex).toBe(1);
  });

  it('advances through all steps to completion', () => {
    let flow = createAccountOnboardingFlow();
    flow = advanceAccountFlow(flow, { email: 'test@example.com' });
    flow = advanceAccountFlow(flow, { password: 'secure123' });
    flow = advanceAccountFlow(flow, { name: 'Test User' });
    flow = advanceAccountFlow(flow, { role: 'personal' });

    expect(flow.completedAt).toBeDefined();
    expect(flow.steps.every((s) => s.status === 'completed')).toBe(true);
  });

  it('does not advance if current step is not active', () => {
    let flow = createAccountOnboardingFlow();
    // Complete all steps to reach the end
    flow = advanceAccountFlow(flow);
    flow = advanceAccountFlow(flow);
    flow = advanceAccountFlow(flow);
    flow = advanceAccountFlow(flow);
    // Flow is now complete, trying to advance further should not change it
    const afterCompletion = advanceAccountFlow(flow);
    expect(afterCompletion.currentStepIndex).toBe(flow.currentStepIndex);
    expect(afterCompletion.completedAt).toBeDefined();
  });

  it('completes a specific step by id', () => {
    const flow = createAccountOnboardingFlow();
    const updated = completeAccountStep(flow, 'email-verification', {
      verified: true,
    });

    expect(updated.steps[0]!.status).toBe('completed');
    expect(updated.steps[1]!.status).toBe('active');
    expect(updated.currentStepIndex).toBe(1);
  });

  it('does not re-complete an already completed step', () => {
    const flow = createAccountOnboardingFlow();
    const updated = completeAccountStep(flow, 'email-verification');
    const again = completeAccountStep(updated, 'email-verification');

    expect(again).toEqual(updated);
  });

  it('returns the same flow if step id is not found', () => {
    const flow = createAccountOnboardingFlow();
    const result = completeAccountStep(flow, 'nonexistent-step');
    expect(result).toEqual(flow);
  });

  it('maintains correct step order', () => {
    const flow = createAccountOnboardingFlow();
    const stepIds = flow.steps.map((s) => s.id);
    expect(stepIds).toEqual([
      'email-verification',
      'password-setup',
      'profile-basics',
      'role-selection',
    ]);
  });
});
