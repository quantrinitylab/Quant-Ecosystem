import type { OnboardingFlow, OnboardingStep } from '../types.js';

function createAccountSteps(): OnboardingStep[] {
  return [
    {
      id: 'email-verification',
      title: 'Verify Email',
      description: 'Confirm your email address to secure your account',
      status: 'active',
      required: true,
    },
    {
      id: 'password-setup',
      title: 'Set Password',
      description: 'Create a strong password for your account',
      status: 'pending',
      required: true,
    },
    {
      id: 'profile-basics',
      title: 'Profile Basics',
      description: 'Add your name and avatar to personalize your profile',
      status: 'pending',
      required: true,
    },
    {
      id: 'role-selection',
      title: 'Select Role',
      description: 'Choose how you plan to use the platform',
      status: 'pending',
      required: true,
    },
  ];
}

export function createAccountOnboardingFlow(): OnboardingFlow {
  return {
    id: `account-onboarding-${Date.now()}`,
    role: 'personal',
    steps: createAccountSteps(),
    currentStepIndex: 0,
  };
}

export function advanceAccountFlow(
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

export function completeAccountStep(
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

  // Activate the next pending step if this was the current active step
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
 * Skips an optional step in the onboarding flow.
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
