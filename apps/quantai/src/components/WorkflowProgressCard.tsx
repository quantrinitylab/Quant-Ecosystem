'use client';

import React from 'react';
import { motion } from 'framer-motion';

export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowStep {
  stepId: string;
  toolId: string;
  status: WorkflowStepStatus;
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
}

interface WorkflowProgressCardProps {
  steps: WorkflowStep[];
  planDescription?: string;
  className?: string;
}

function formatElapsed(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return '';
  const end = completedAt ?? Date.now();
  const ms = end - startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepStatusIcon({ status }: { status: WorkflowStepStatus }) {
  switch (status) {
    case 'pending':
      return (
        <motion.span
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="inline-block w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"
        />
      );
    case 'running':
      return (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="inline-block text-blue-500 text-sm"
        >
          ⟳
        </motion.span>
      );
    case 'completed':
      return <span className="text-green-500 text-sm">✓</span>;
    case 'failed':
      return <span className="text-red-500 text-sm">✕</span>;
  }
}

export function WorkflowProgressCard({
  steps,
  planDescription,
  className = '',
}: WorkflowProgressCardProps) {
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const totalCount = steps.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`border border-[var(--quant-border)] rounded-lg overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between p-3 border-b border-[var(--quant-border)]">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔄</span>
          <span className="text-sm font-medium">{planDescription ?? 'Multi-step Workflow'}</span>
        </div>
        <span className="text-xs text-[var(--quant-text-secondary)]">
          {completedCount}/{totalCount} steps
        </span>
      </div>

      <div className="p-3 space-y-2">
        {steps.map((step, index) => (
          <motion.div
            key={step.stepId}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05, type: 'spring', stiffness: 300, damping: 30 }}
            className="flex items-center gap-2.5"
          >
            <StepStatusIcon status={step.status} />
            <span
              className={`text-sm flex-1 truncate ${
                step.status === 'pending' ? 'text-[var(--quant-text-secondary)]' : ''
              }`}
            >
              {step.toolId}
            </span>
            {step.startedAt && (
              <span className="text-xs text-[var(--quant-text-secondary)]">
                {formatElapsed(step.startedAt, step.completedAt)}
              </span>
            )}
            {step.error && (
              <span className="text-xs text-red-400 truncate max-w-[120px]">{step.error}</span>
            )}
          </motion.div>
        ))}
      </div>

      {completedCount === totalCount && totalCount > 0 && (
        <div className="px-3 pb-3">
          <div className="text-xs text-green-600 dark:text-green-400 font-medium">
            All steps completed successfully
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default WorkflowProgressCard;
