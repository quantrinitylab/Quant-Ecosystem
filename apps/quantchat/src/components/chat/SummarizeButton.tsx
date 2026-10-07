'use client';

import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AIGeneratedBadge } from './AIGeneratedBadge';

// ============================================================================
// Task 12.2 (Requirement 11.2): "Summarize" button for the chat header.
//
// Triggers a conversation summary of the most recent messages (the caller
// passes ≤ 50 messages) and renders the AI-generated summary + key topics in a
// popover. The summary is AI content, so it carries the AI-generated badge.
// ============================================================================

export interface SummaryResponse {
  success: boolean;
  data?: {
    summary: string;
    keyTopics: string[];
    messageCount: number;
    isAIGenerated: boolean;
  };
}

export interface SummarizeButtonProps {
  conversationId: string;
  /** Recent messages (caller should pass at most the last 50). */
  messages: Array<{ sender: string; content: string }>;
  /** Fetcher override (defaults to POST /api/ai/summarize). */
  fetchSummary?: (args: {
    conversationId: string;
    messages: Array<{ sender: string; content: string }>;
  }) => Promise<SummaryResponse['data'] | null>;
  className?: string;
}

async function defaultFetchSummary(args: {
  conversationId: string;
  messages: Array<{ sender: string; content: string }>;
}): Promise<SummaryResponse['data'] | null> {
  const res = await fetch('/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: args.conversationId,
      messages: args.messages.slice(-50),
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as SummaryResponse;
  return json.success ? (json.data ?? null) : null;
}

export function SummarizeButton({
  conversationId,
  messages,
  fetchSummary = defaultFetchSummary,
  className = '',
}: SummarizeButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryResponse['data'] | null>(null);

  const handleClick = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    try {
      const result = await fetchSummary({ conversationId, messages });
      setSummary(result);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId, messages, fetchSummary]);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Summarize conversation"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-gray-800 transition-colors"
      >
        <span aria-hidden="true">{'\uD83D\uDCDC'}</span>
        Summarize
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Conversation Summary
              </span>
              <button
                type="button"
                aria-label="Close summary"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                {'\u2715'}
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Summarizing\u2026</p>
            ) : summary ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-800 dark:text-gray-200">{summary.summary}</p>
                {summary.keyTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {summary.keyTopics.map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300"
                      >
                        #{topic}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-400">
                    {summary.messageCount} message{summary.messageCount === 1 ? '' : 's'}
                  </span>
                  <AIGeneratedBadge size="sm" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Couldn&apos;t generate a summary right now.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SummarizeButton;
