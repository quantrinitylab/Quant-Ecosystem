import { describe, expect, it } from 'vitest';
import {
  advanceWorkspaceFlow,
  completeWorkspaceStep,
  createWorkspaceOnboardingFlow,
  skipOptionalStep,
} from '../flows/workspace-onboarding.js';

describe('Workspace Onboarding Flow', () => {
  it('creates a flow with 4 steps', () => {
    const flow = createWorkspaceOnboardingFlow();
    expect(flow.steps).toHaveLength(4);
    expect(flow.currentStepIndex).toBe(0);
    expect(flow.completedAt).toBeUndefined();
  });

  it('starts with create-workspace as active', () => {
    const flow = createWorkspaceOnboardingFlow();
    expect(flow.steps[0]!.id).toBe('create-workspace');
    expect(flow.steps[0]!.status).toBe('active');
  });

  it('has correct step sequence', () => {
    const flow = createWorkspaceOnboardingFlow();
    const stepIds = flow.steps.map((s) => s.id);
    expect(stepIds).toEqual([
      'create-workspace',
      'invite-members',
      'configure-permissions',
      'choose-apps',
    ]);
  });

  it('advances through steps correctly', () => {
    let flow = createWorkspaceOnboardingFlow();
    flow = advanceWorkspaceFlow(flow, { name: 'My Workspace' });

    expect(flow.steps[0]!.status).toBe('completed');
    expect(flow.steps[1]!.status).toBe('active');
    expect(flow.currentStepIndex).toBe(1);
  });

  it('completes the flow after all steps are done', () => {
    let flow = createWorkspaceOnboardingFlow();
    flow = advanceWorkspaceFlow(flow, { name: 'My Workspace' });
    flow = advanceWorkspaceFlow(flow, { members: ['alice', 'bob'] });
    flow = advanceWorkspaceFlow(flow, { roles: ['admin', 'member'] });
    flow = advanceWorkspaceFlow(flow, { apps: ['email', 'docs'] });

    expect(flow.completedAt).toBeDefined();
    expect(flow.steps.every((s) => s.status === 'completed')).toBe(true);
  });

  it('completes a specific step and activates the next', () => {
    const flow = createWorkspaceOnboardingFlow();
    const updated = completeWorkspaceStep(flow, 'create-workspace', {
      name: 'Test Workspace',
    });

    expect(updated.steps[0]!.status).toBe('completed');
    expect(updated.steps[1]!.status).toBe('active');
    expect(updated.currentStepIndex).toBe(1);
  });

  it('marks invite-members and configure-permissions as optional', () => {
    const flow = createWorkspaceOnboardingFlow();
    expect(flow.steps[1]!.required).toBe(false);
    expect(flow.steps[2]!.required).toBe(false);
  });

  it('marks create-workspace and choose-apps as required', () => {
    const flow = createWorkspaceOnboardingFlow();
    expect(flow.steps[0]!.required).toBe(true);
    expect(flow.steps[3]!.required).toBe(true);
  });
});

describe('skipOptionalStep', () => {
  it('can skip an optional step', () => {
    let flow = createWorkspaceOnboardingFlow();
    // Advance past first step so invite-members becomes active
    flow = advanceWorkspaceFlow(flow);
    expect(flow.steps[1]!.status).toBe('active');

    const skipped = skipOptionalStep(flow, 'invite-members');
    expect(skipped.steps[1]!.status).toBe('skipped');
  });

  it('cannot skip a required step', () => {
    const flow = createWorkspaceOnboardingFlow();
    const result = skipOptionalStep(flow, 'create-workspace');
    // Flow unchanged - required steps cannot be skipped
    expect(result.steps[0]!.status).toBe('active');
    expect(result).toEqual(flow);
  });

  it('skipping advances the flow to the next pending step', () => {
    let flow = createWorkspaceOnboardingFlow();
    // Complete the first step
    flow = advanceWorkspaceFlow(flow);
    // Now invite-members is active (index 1)
    expect(flow.currentStepIndex).toBe(1);

    const skipped = skipOptionalStep(flow, 'invite-members');
    // Should advance to configure-permissions (index 2)
    expect(skipped.currentStepIndex).toBe(2);
    expect(skipped.steps[2]!.status).toBe('active');
  });

  it('flow with all required steps completed and optional steps skipped reaches completedAt', () => {
    let flow = createWorkspaceOnboardingFlow();
    // Complete first required step (create-workspace)
    flow = advanceWorkspaceFlow(flow);
    // Skip optional step (invite-members)
    flow = skipOptionalStep(flow, 'invite-members');
    // Skip optional step (configure-permissions)
    flow = skipOptionalStep(flow, 'configure-permissions');
    // Complete last required step (choose-apps)
    flow = advanceWorkspaceFlow(flow);

    expect(flow.completedAt).toBeDefined();
    expect(flow.steps[0]!.status).toBe('completed');
    expect(flow.steps[1]!.status).toBe('skipped');
    expect(flow.steps[2]!.status).toBe('skipped');
    expect(flow.steps[3]!.status).toBe('completed');
  });

  it('returns flow unchanged if step is already completed', () => {
    let flow = createWorkspaceOnboardingFlow();
    flow = advanceWorkspaceFlow(flow); // completes create-workspace
    const result = skipOptionalStep(flow, 'create-workspace');
    expect(result).toEqual(flow);
  });

  it('returns flow unchanged if step is already skipped', () => {
    let flow = createWorkspaceOnboardingFlow();
    flow = advanceWorkspaceFlow(flow);
    flow = skipOptionalStep(flow, 'invite-members');
    const result = skipOptionalStep(flow, 'invite-members');
    expect(result).toEqual(flow);
  });

  it('returns flow unchanged if step id does not exist', () => {
    const flow = createWorkspaceOnboardingFlow();
    const result = skipOptionalStep(flow, 'nonexistent-step');
    expect(result).toEqual(flow);
  });
});
