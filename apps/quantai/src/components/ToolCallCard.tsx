'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { ToolCall } from '../types/tool-calls';
import { TOOL_ICONS } from '../types/tool-calls';

interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
}

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] || TOOL_ICONS.default;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallCard({ toolCall, className = '' }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`border border-[var(--quant-border)] rounded-lg shadow-sm overflow-hidden ${className}`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2.5 p-2.5 text-left hover:bg-[var(--quant-surface-hover)] transition-colors"
      >
        <span className="text-base">{getToolIcon(toolCall.name)}</span>
        <span className="flex-1 text-sm font-medium truncate">{toolCall.name}</span>
        <StatusBadge status={toolCall.status} />
        {toolCall.duration != null && (
          <span className="text-xs text-[var(--quant-text-secondary)]">
            {formatDuration(toolCall.duration)}
          </span>
        )}
        <svg
          className={`w-3.5 h-3.5 transition-transform text-[var(--quant-text-secondary)] ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="border-t border-[var(--quant-border)] p-2.5"
        >
          <div className="space-y-2">
            <div>
              <span className="text-xs font-medium text-[var(--quant-text-secondary)]">
                Arguments
              </span>
              <pre className="text-xs mt-1 p-2 rounded bg-[var(--quant-surface-hover)] overflow-x-auto">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
            {toolCall.result !== undefined && (
              <div>
                <span className="text-xs font-medium text-[var(--quant-text-secondary)]">
                  Result
                </span>
                <pre className="text-xs mt-1 p-2 rounded bg-[var(--quant-surface-hover)] overflow-x-auto">
                  {typeof toolCall.result === 'string'
                    ? toolCall.result
                    : JSON.stringify(toolCall.result, null, 2)}
                </pre>
              </div>
            )}
            {toolCall.error && (
              <div>
                <span className="text-xs font-medium text-red-500">Error</span>
                <p className="text-xs mt-1 text-red-400">{toolCall.error}</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ToolCall['status'] }) {
  const config = {
    pending: {
      label: 'Pending',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
    running: {
      label: 'Running',
      className: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    },
    completed: {
      label: 'Done',
      className: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    },
    failed: {
      label: 'Failed',
      className: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.className}`}
    >
      {status === 'running' && (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="inline-block w-2.5 h-2.5"
        >
          ⟳
        </motion.span>
      )}
      {status === 'completed' && <span>✓</span>}
      {status === 'failed' && <span>✕</span>}
      {status === 'pending' && (
        <motion.span
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="inline-block w-1.5 h-1.5 rounded-full bg-current"
        />
      )}
      {config.label}
    </span>
  );
}

export default ToolCallCard;
