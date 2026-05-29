'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ToolCall } from '../types/tool-calls';
import { ToolCallCard } from './ToolCallCard';

interface AgenticMessageProps {
  content: string;
  toolCalls: ToolCall[];
  reasoning?: string;
  className?: string;
}

export function AgenticMessage({
  content,
  toolCalls,
  reasoning,
  className = '',
}: AgenticMessageProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <motion.div layout className={`space-y-3 ${className}`}>
      {reasoning && (
        <div className="border border-[var(--quant-border)] rounded-lg overflow-hidden">
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-[var(--quant-surface-hover)] transition-colors"
          >
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-sm"
            >
              💭
            </motion.span>
            <span className="text-xs font-medium text-[var(--quant-text-secondary)]">
              Thinking...
            </span>
            <svg
              className={`w-3 h-3 ml-auto transition-transform text-[var(--quant-text-secondary)] ${showReasoning ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <AnimatePresence>
            {showReasoning && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-[var(--quant-border)]"
              >
                <p className="p-3 text-xs text-[var(--quant-text-secondary)] whitespace-pre-wrap">
                  {reasoning}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {toolCalls.length > 0 && (
        <div className="space-y-2">
          {toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {content && <div className="text-sm whitespace-pre-wrap">{content}</div>}
    </motion.div>
  );
}

export default AgenticMessage;
