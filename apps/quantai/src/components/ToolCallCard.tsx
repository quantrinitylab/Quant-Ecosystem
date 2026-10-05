'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import type { ToolCall } from '../types/tool-calls';
import { TOOL_ICONS } from '../types/tool-calls';

interface ToolCallCardProps {
  toolCall: ToolCall;
  onConfirm?: (id: string) => void;
  onCancel?: (id: string) => void;
  className?: string;
}

const DESTRUCTIVE_TOOLS = new Set(['email_send', 'file_write', 'api_call', 'database_query']);

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] || TOOL_ICONS.default;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatJSON(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function ToolCallCard({ toolCall, onConfirm, onCancel, className = '' }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isDestructive = DESTRUCTIVE_TOOLS.has(toolCall.name);
  const needsConfirmation = isDestructive && toolCall.status === 'pending';

  const handleConfirm = useCallback(() => {
    onConfirm?.(toolCall.id);
  }, [onConfirm, toolCall.id]);

  const handleCancel = useCallback(() => {
    onCancel?.(toolCall.id);
  }, [onCancel, toolCall.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.snappy }}
      className={`border border-[var(--quant-border)] rounded-[20px] shadow-sm overflow-hidden bg-[var(--quant-surface)] ${className}`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-[var(--quant-surface-hover)] transition-colors min-h-[44px]"
        aria-expanded={isExpanded}
        aria-label={`Tool call: ${toolCall.name} - ${toolCall.status}`}
      >
        <span className="text-base flex-shrink-0">{getToolIcon(toolCall.name)}</span>
        <span className="flex-1 text-sm font-medium truncate text-[var(--foreground)]">
          {toolCall.name.replace(/_/g, ' ')}
        </span>
        <StatusBadge status={toolCall.status} />
        {toolCall.duration != null && toolCall.status === 'completed' && (
          <span className="text-xs text-[var(--quant-text-secondary)] whitespace-nowrap">
            Completed in {formatDuration(toolCall.duration)}
          </span>
        )}
        <svg
          className={`w-3.5 h-3.5 transition-transform text-[var(--quant-text-secondary)] flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Progress bar for running state */}
      {toolCall.status === 'running' && (
        <div className="h-0.5 bg-[var(--quant-border)]">
          <motion.div
            className="h-full bg-[var(--quant-accent)]"
            initial={{ width: '0%' }}
            animate={{ width: ['0%', '60%', '80%', '95%'] }}
            transition={{ duration: 8, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* Confirmation buttons for destructive actions */}
      <AnimatePresence>
        {needsConfirmation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-[var(--quant-border)] px-3 py-2.5 bg-amber-50 dark:bg-amber-900/10"
          >
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
              This action requires confirmation before executing.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                className="flex-1 px-3 py-2 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors min-h-[36px]"
              >
                Confirm
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 px-3 py-2 text-xs font-medium rounded-md border border-[var(--quant-border)] text-[var(--foreground)] hover:bg-[var(--quant-surface-hover)] transition-colors min-h-[36px]"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', ...spring.snappy }}
            className="border-t border-[var(--quant-border)] overflow-hidden"
          >
            <div className="p-3 space-y-3">
              {/* Input parameters */}
              <div>
                <span className="text-xs font-medium text-[var(--quant-text-secondary)] uppercase tracking-wide">
                  Input Parameters
                </span>
                <pre className="text-xs mt-1.5 p-2.5 rounded-md bg-[var(--quant-code-bg)] text-[var(--quant-code-fg)] overflow-x-auto font-mono leading-relaxed">
                  {formatJSON(toolCall.arguments)}
                </pre>
              </div>

              {/* Output result */}
              {toolCall.result !== undefined && (
                <div>
                  <span className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">
                    Output Result
                  </span>
                  <pre className="text-xs mt-1.5 p-2.5 rounded-md bg-[var(--quant-code-bg)] text-[var(--quant-code-fg)] overflow-x-auto font-mono leading-relaxed">
                    {typeof toolCall.result === 'string'
                      ? toolCall.result
                      : formatJSON(toolCall.result)}
                  </pre>
                </div>
              )}

              {/* Error */}
              {toolCall.error && (
                <div>
                  <span className="text-xs font-medium text-red-500 uppercase tracking-wide">
                    Error
                  </span>
                  <p className="text-xs mt-1.5 p-2.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                    {toolCall.error}
                  </p>
                </div>
              )}

              {/* Duration footer */}
              {toolCall.duration != null && (
                <div className="pt-2 border-t border-[var(--quant-border)] flex items-center gap-2">
                  <svg
                    className="w-3 h-3 text-[var(--quant-text-secondary)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="text-xs text-[var(--quant-text-secondary)]">
                    Execution time: {formatDuration(toolCall.duration)}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: ToolCall['status'] }) {
  const config = {
    pending: {
      label: 'Pending',
      className: 'bg-white/5 text-[var(--quant-muted-foreground)]',
      icon: (
        <motion.span
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="inline-block w-1.5 h-1.5 rounded-full bg-current"
        />
      ),
    },
    running: {
      label: 'Running',
      className: 'bg-blue-500/10 text-blue-400',
      icon: (
        <motion.svg
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </motion.svg>
      ),
    },
    completed: {
      label: 'Done',
      className: 'bg-emerald-500/10 text-emerald-400',
      icon: (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    failed: {
      label: 'Failed',
      className: 'bg-red-500/10 text-red-400',
      icon: (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      ),
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

export default ToolCallCard;
