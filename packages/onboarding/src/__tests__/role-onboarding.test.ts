import { describe, expect, it } from 'vitest';
import { createRoleOnboardingFlow } from '../flows/role-onboarding.js';
import type { OnboardingRole } from '../types.js';

describe('Role Onboarding Flow', () => {
  const roles: OnboardingRole[] = ['personal', 'team-admin', 'creator', 'advertiser', 'developer'];

  it.each(roles)('creates a flow for role: %s', (role) => {
    const flow = createRoleOnboardingFlow(role);
    expect(flow.role).toBe(role);
    expect(flow.steps.length).toBeGreaterThan(0);
    expect(flow.currentStepIndex).toBe(0);
    expect(flow.completedAt).toBeUndefined();
  });

  it('returns different steps for each role', () => {
    const flows = roles.map((r) => createRoleOnboardingFlow(r));
    const stepIdSets = flows.map((f) => f.steps.map((s) => s.id).join(','));
    const uniqueSets = new Set(stepIdSets);
    expect(uniqueSets.size).toBe(roles.length);
  });

  it('personal role has correct steps', () => {
    const flow = createRoleOnboardingFlow('personal');
    const ids = flow.steps.map((s) => s.id);
    expect(ids).toEqual(['connect-email', 'upload-file', 'create-doc', 'setup-ai']);
  });

  it('team-admin role has correct steps', () => {
    const flow = createRoleOnboardingFlow('team-admin');
    const ids = flow.steps.map((s) => s.id);
    expect(ids).toEqual(['create-workspace', 'invite-team', 'setup-permissions', 'choose-tools']);
  });

  it('creator role has correct steps', () => {
    const flow = createRoleOnboardingFlow('creator');
    const ids = flow.steps.map((s) => s.id);
    expect(ids).toEqual([
      'setup-profile',
      'upload-content',
      'configure-publishing',
      'connect-monetization',
    ]);
  });

  it('advertiser role has correct steps', () => {
    const flow = createRoleOnboardingFlow('advertiser');
    const ids = flow.steps.map((s) => s.id);
    expect(ids).toEqual(['setup-business', 'create-campaign', 'define-audience', 'set-budget']);
  });

  it('developer role has correct steps', () => {
    const flow = createRoleOnboardingFlow('developer');
    const ids = flow.steps.map((s) => s.id);
    expect(ids).toEqual(['connect-repo', 'setup-ci', 'configure-apis', 'create-agent']);
  });

  it('each flow has 4 steps', () => {
    for (const role of roles) {
      const flow = createRoleOnboardingFlow(role);
      expect(flow.steps).toHaveLength(4);
    }
  });

  it('first step of each flow is active', () => {
    for (const role of roles) {
      const flow = createRoleOnboardingFlow(role);
      expect(flow.steps[0]!.status).toBe('active');
    }
  });
});
