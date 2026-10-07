// ============================================================================
// QuantAds - CampaignWizard Component
// Wizard step component with spring transitions and brand theming
// ============================================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  isOptional?: boolean;
}

interface ValidationRule {
  field: string;
  validate: (value: unknown) => boolean;
  message: string;
}

interface CampaignWizardProps {
  steps: WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onComplete: () => void;
  validationRules?: Record<number, ValidationRule[]>;
  stepData?: Record<string, unknown>;
  isSubmitting?: boolean;
  allowSkipOptional?: boolean;
}

interface StepValidationState {
  isValid: boolean;
  errors: string[];
  touched: boolean;
}

const CampaignWizard: React.FC<CampaignWizardProps> = ({
  steps,
  currentStep,
  onStepChange,
  onComplete,
  validationRules = {},
  stepData = {},
  isSubmitting = false,
  allowSkipOptional = false,
}) => {
  const [validationStates, setValidationStates] = useState<Record<number, StepValidationState>>({});
  const [showErrors, setShowErrors] = useState<boolean>(false);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [direction, setDirection] = useState<1 | -1>(1);

  const validateStep = useCallback(
    (stepIndex: number): StepValidationState => {
      const rules = validationRules[stepIndex] || [];
      const errors: string[] = [];
      for (const rule of rules) {
        const value = stepData[rule.field];
        if (!rule.validate(value)) {
          errors.push(rule.message);
        }
      }
      return { isValid: errors.length === 0, errors, touched: true };
    },
    [validationRules, stepData],
  );

  useEffect(() => {
    const state = validateStep(currentStep);
    setValidationStates((prev) => ({ ...prev, [currentStep]: state }));
  }, [currentStep, stepData, validateStep]);

  const handleNext = useCallback(() => {
    const state = validateStep(currentStep);
    setValidationStates((prev) => ({ ...prev, [currentStep]: state }));

    if (!state.isValid) {
      setShowErrors(true);
      return;
    }

    setShowErrors(false);
    setCompletedSteps((prev) => new Set([...prev, currentStep]));

    if (currentStep === steps.length - 1) {
      onComplete();
    } else {
      setDirection(1);
      onStepChange(currentStep + 1);
    }
  }, [currentStep, steps.length, validateStep, onStepChange, onComplete]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setShowErrors(false);
      setDirection(-1);
      onStepChange(currentStep - 1);
    }
  }, [currentStep, onStepChange]);

  const handleStepClick = useCallback(
    (stepIndex: number) => {
      if (
        stepIndex < currentStep ||
        completedSteps.has(stepIndex) ||
        stepIndex === currentStep + 1
      ) {
        setDirection(stepIndex > currentStep ? 1 : -1);
        onStepChange(stepIndex);
      }
    },
    [currentStep, completedSteps, onStepChange],
  );

  const getStepStatus = (index: number): 'completed' | 'current' | 'upcoming' | 'error' => {
    if (completedSteps.has(index) && index !== currentStep) return 'completed';
    if (index === currentStep) return 'current';
    if (validationStates[index]?.touched && !validationStates[index]?.isValid) return 'error';
    return 'upcoming';
  };

  const progressPercentage = ((currentStep + 1) / steps.length) * 100;
  const currentStepData = steps[currentStep];
  const currentValidation = validationStates[currentStep];

  return (
    <div className="w-full">
      <div className="mb-8">
        <div className="h-2 bg-[var(--quant-muted)] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(to right, var(--brand-app-color), var(--brand-primary))',
            }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ type: 'spring', ...spring.snappy }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            {Math.round(progressPercentage)}% complete
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 mb-8 overflow-x-auto py-2">
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => handleStepClick(index)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${
                  status === 'completed'
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 cursor-pointer'
                    : status === 'current'
                      ? 'bg-[var(--brand-app-color)]/10 text-[var(--brand-app-color)] ring-2 ring-[var(--brand-app-color)]/30'
                      : status === 'error'
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                        : 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)]'
                } ${index > currentStep + 1 && !completedSteps.has(index) ? 'cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'}`}
                disabled={index > currentStep + 1 && !completedSteps.has(index)}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    status === 'completed'
                      ? 'bg-green-500'
                      : status === 'current'
                        ? 'bg-[var(--brand-app-color)]'
                        : status === 'error'
                          ? 'bg-red-500'
                          : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  {status === 'completed' ? '\u2713' : status === 'error' ? '!' : index + 1}
                </div>
                <div className="hidden md:block">
                  <div className="text-xs font-medium">{step.title}</div>
                  {step.isOptional && <span className="text-xs opacity-60">Optional</span>}
                </div>
              </button>
              {index < steps.length - 1 && (
                <div
                  className={`w-6 h-0.5 mx-1 ${completedSteps.has(index) ? 'bg-green-400' : 'bg-[var(--quant-border)]'}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          initial={{ opacity: 0, x: direction * 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -30 }}
          transition={{ type: 'spring', ...spring.snappy }}
        >
          <div className="text-center mb-6">
            <span className="text-3xl">{currentStepData?.icon}</span>
            <h2 className="text-xl font-semibold text-[var(--quant-foreground)] mt-2">
              {currentStepData?.title}
            </h2>
            <p className="text-sm text-[var(--quant-muted-foreground)] mt-1">
              {currentStepData?.description}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>

      {showErrors && currentValidation && !currentValidation.isValid && (
        <motion.div
          className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ type: 'spring', ...spring.snappy }}
        >
          <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
            Please fix the following:
          </h4>
          <ul className="list-disc list-inside space-y-1">
            {currentValidation.errors.map((err, i) => (
              <li key={i} className="text-sm text-red-600 dark:text-red-400">
                {err}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      <div className="flex items-center justify-between mt-8 pt-4 border-t border-[var(--quant-border)]">
        <button
          onClick={handlePrev}
          disabled={currentStep === 0}
          className={`px-5 py-2 rounded-lg font-medium transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${
            currentStep === 0
              ? 'text-[var(--quant-muted-foreground)] cursor-not-allowed'
              : 'text-[var(--quant-foreground)] hover:bg-[var(--quant-muted)]'
          }`}
        >
          Previous
        </button>

        <div className="flex gap-2">
          {currentStepData?.isOptional && allowSkipOptional && (
            <button
              onClick={() => {
                setCompletedSteps((prev) => new Set([...prev, currentStep]));
                onStepChange(currentStep + 1);
              }}
              className="px-4 py-2 text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)] rounded-lg text-sm min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
            >
              Skip
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={isSubmitting}
            className={`px-6 py-2 rounded-lg font-medium text-white transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] focus-visible:ring-offset-2 ${
              currentStep === steps.length - 1
                ? 'bg-[var(--quant-success)] hover:bg-[var(--quant-success)]/90'
                : 'bg-[var(--brand-app-color)] hover:bg-[var(--brand-app-color)]/90'
            } disabled:opacity-50`}
          >
            {isSubmitting
              ? 'Submitting...'
              : currentStep === steps.length - 1
                ? 'Complete'
                : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CampaignWizard;
