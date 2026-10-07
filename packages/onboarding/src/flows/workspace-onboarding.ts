import type { OnboardingFlow, OnboardingStep } from '../types.js';

function createWorkspaceSteps(): OnboardingStep[] {
  return [
    {
      id: 'create-workspace',
      title: 'Create Workspace',
      description: 'Set up your team workspace with a name and settings',
      status: 'active',
      required: true,
    },
    {
      id: 'invite-members',
      title: 'Invite Members',
      description: 'Invite your team members to collaborate',
      status: 'pending',
      required: false,
    },
    {
      id: 'configure-permissions',
      title: 'Configure Permissions',
      description: 'Set up roles and access controls for your team',
      status: 'pending',
      required: false,
    },
    {
      id: 'choose-apps',
      title: 'Choose Apps',
      description: 'Select which apps to enable for your workspace',
      status: 'pending',
      required: true,
    },
  ];
}

export function createWorkspaceOnboardingFlow(): OnboardingFlow {
  return {
    id: `workspace-onboarding-${Date.now()}`,
    role: 'team-admin',
    steps: createWorkspaceSteps(),
    currentStepIndex: 0,
  };
}

export function advanceWorkspaceFlow(
  flow: OnboardingFlow,
  stepData?: Record<string, unknown>,
): OnboardingFlow {
  const currentStep = flow.steps[flow.currentStepIndex];
  if (!currentStep || currentStep.status !== 'active') {
    return flow;
  }

  const updatedSteps = [...flow.steps];
  updatedSteps[flow.currentStepIndex] = {
    ...currentStep,
    status: 'completed',
    data: stepData,
  };

  const nextIndex = flow.currentStepIndex + 1;
  if (nextIndex < updatedSteps.length) {
    updatedSteps[nextIndex] = {
      ...updatedSteps[nextIndex]!,
      status: 'active',
    };
  }

  const allCompleted = nextIndex >= updatedSteps.length;

  return {
    ...flow,
    steps: updatedSteps,
    currentStepIndex: allCompleted ? flow.currentStepIndex : nextIndex,
    completedAt: allCompleted ? new Date() : undefined,
  };
}

export function completeWorkspaceStep(
  flow: OnboardingFlow,
  stepId: string,
  data?: Record<string, unknown>,
): OnboardingFlow {
  const stepIndex = flow.steps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) {
    return flow;
  }

  const step = flow.steps[stepIndex]!;
  if (step.status === 'completed') {
    return flow;
  }

  const updatedSteps = [...flow.steps];
  updatedSteps[stepIndex] = {
    ...step,
    status: 'completed',
    data,
  };

  let newCurrentIndex = flow.currentStepIndex;
  if (stepIndex === flow.currentStepIndex) {
    const nextPending = updatedSteps.findIndex((s, i) => i > stepIndex && s.status === 'pending');
    if (nextPending !== -1) {
      updatedSteps[nextPending] = {
        ...updatedSteps[nextPending]!,
        status: 'active',
      };
      newCurrentIndex = nextPending;
    }
  }

  const allDone = updatedSteps.every((s) => s.status === 'completed' || s.status === 'skipped');

  return {
    ...flow,
    steps: updatedSteps,
    currentStepIndex: newCurrentIndex,
    completedAt: allDone ? new Date() : undefined,
  };
}

/**
 * Skips an optional step in the workspace onboarding flow.
 * Only steps with `required === false` can be skipped.
 * Returns the flow unchanged if the step is required, already completed, or already skipped.
 */
export function skipOptionalStep(flow: OnboardingFlow, stepId: string): OnboardingFlow {
  const stepIndex = flow.steps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) {
    return flow;
  }

  const step = flow.steps[stepIndex]!;

  // Cannot skip required steps, already completed, or already skipped steps
  if (step.required || step.status === 'completed' || step.status === 'skipped') {
    return flow;
  }

  const updatedSteps = [...flow.steps];
  updatedSteps[stepIndex] = {
    ...step,
    status: 'skipped',
  };

  // Advance currentStepIndex if the skipped step was the active one
  let newCurrentIndex = flow.currentStepIndex;
  if (stepIndex === flow.currentStepIndex) {
    const nextPending = updatedSteps.findIndex((s, i) => i > stepIndex && s.status === 'pending');
    if (nextPending !== -1) {
      updatedSteps[nextPending] = {
        ...updatedSteps[nextPending]!,
        status: 'active',
      };
      newCurrentIndex = nextPending;
    }
  }

  const allDone = updatedSteps.every((s) => s.status === 'completed' || s.status === 'skipped');

  return {
    ...flow,
    steps: updatedSteps,
    currentStepIndex: newCurrentIndex,
    completedAt: allDone ? new Date() : undefined,
  };
}
