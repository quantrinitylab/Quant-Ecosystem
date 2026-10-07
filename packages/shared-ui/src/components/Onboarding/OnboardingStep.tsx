// ============================================================================
// Shared UI - Onboarding Step Component
// ============================================================================

import React from 'react';

export interface OnboardingStepProps {
  title: string;
  description: string;
  children: React.ReactNode;
  stepNumber?: number;
  totalSteps?: number;
}

export const OnboardingStep: React.FC<OnboardingStepProps> = ({
  title,
  description,
  children,
  stepNumber,
  totalSteps,
}) => {
  return (
    <div className="space-y-6" aria-label={`Step${stepNumber ? ` ${stepNumber}` : ''}: ${title}`}>
      {stepNumber !== undefined && totalSteps !== undefined && (
        <span className="inline-block text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
          Step {stepNumber} of {totalSteps}
        </span>
      )}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-base text-gray-500">{description}</p>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
};
