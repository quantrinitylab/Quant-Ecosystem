'use client';

// ============================================================================
// Shared UI - Full Onboarding Wizard Component
// ============================================================================

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WelcomeStep } from './WelcomeStep';
import { WorkspaceSetupStep } from './WorkspaceSetupStep';
import { ConnectAppsStep } from './ConnectAppsStep';
import { AIPreferencesStep } from './AIPreferencesStep';
import { AppTourStep } from './AppTourStep';
import type { AppToggleItem } from './ConnectAppsStep';

export interface OnboardingWizardData {
  name: string;
  workspaceName: string;
  connectedApps: string[];
  personality: string;
}

export interface FullOnboardingWizardProps {
  onComplete: (data: OnboardingWizardData) => void;
  onSkip?: () => void;
  apps?: AppToggleItem[];
  initialStep?: number;
}

const stepLabels = ['Welcome', 'Workspace', 'Connect Apps', 'AI Preferences', 'Tour'];

const springTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

export const FullOnboardingWizard: React.FC<FullOnboardingWizardProps> = ({
  onComplete,
  onSkip,
  apps,
  initialStep = 0,
}) => {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [personality, setPersonality] = useState('professional');

  const totalSteps = 5;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const handleNext = useCallback(() => {
    if (isLastStep) {
      onComplete({ name, workspaceName, connectedApps, personality });
    } else {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    }
  }, [isLastStep, onComplete, name, workspaceName, connectedApps, personality]);

  const handleBack = useCallback(() => {
    if (!isFirstStep) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }, [isFirstStep]);

  const handleSkip = useCallback(() => {
    onSkip?.();
  }, [onSkip]);

  const defaultApps: AppToggleItem[] = apps || [
    { id: 'mail', name: 'QuantMail', description: 'Email and communication', enabled: false },
    { id: 'drive', name: 'QuantDrive', description: 'File storage', enabled: false },
    { id: 'chat', name: 'QuantChat', description: 'Team messaging', enabled: false },
    { id: 'calendar', name: 'QuantCalendar', description: 'Scheduling', enabled: false },
  ];

  const handleAppToggle = useCallback((appId: string, enabled: boolean) => {
    setConnectedApps((prev) => (enabled ? [...prev, appId] : prev.filter((id) => id !== appId)));
  }, []);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep name={name} onNameChange={setName} />;
      case 1:
        return (
          <WorkspaceSetupStep
            workspaceName={workspaceName}
            onWorkspaceNameChange={setWorkspaceName}
          />
        );
      case 2:
        return (
          <ConnectAppsStep
            apps={defaultApps.map((app) => ({
              ...app,
              enabled: connectedApps.includes(app.id),
            }))}
            onToggle={handleAppToggle}
          />
        );
      case 3:
        return <AIPreferencesStep personality={personality} onPersonalityChange={setPersonality} />;
      case 4:
        return <AppTourStep />;
      default:
        return null;
    }
  };

  return (
    <div
      className="flex flex-col min-h-screen bg-[var(--quant-surface-hover,#f9fafb)]"
      role="form"
      aria-label="Onboarding wizard"
    >
      {/* Progress indicator */}
      <div className="w-full bg-white dark:bg-gray-900 border-b border-[var(--quant-border,#e5e7eb)] px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Step {currentStep + 1} of {totalSteps}: {stepLabels[currentStep]}
            </span>
            <span className="text-sm text-[var(--quant-text-secondary,#6b7280)]">
              {Math.round(progress)}%
            </span>
          </div>
          <div
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={currentStep + 1}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-label="Onboarding progress"
          >
            <motion.div
              className="h-full bg-blue-600 rounded-full"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={springTransition}
            />
          </div>
          {/* Step dots */}
          <div className="flex items-center justify-center gap-2 mt-3" aria-hidden="true">
            {stepLabels.map((label, i) => (
              <div
                key={label}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i <= currentStep ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Step content with spring animations */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              initial={{ opacity: 0, x: direction * 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -direction * 50 }}
              transition={springTransition}
            >
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-[var(--quant-border,#e5e7eb)] p-6 sm:p-8">
                {renderStep()}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="bg-white dark:bg-gray-900 border-t border-[var(--quant-border,#e5e7eb)] px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBack}
              disabled={isFirstStep}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-[var(--quant-border,#e5e7eb)] rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Previous step"
            >
              Back
            </button>
          </div>
          <div className="flex items-center gap-2">
            {onSkip && (
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-sm font-medium text-[var(--quant-text-secondary,#6b7280)] hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                aria-label="Skip onboarding"
              >
                Skip
              </button>
            )}
            <button
              onClick={handleNext}
              className={`px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isLastStep
                  ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
              }`}
              aria-label={isLastStep ? 'Complete onboarding' : 'Next step'}
            >
              {isLastStep ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
