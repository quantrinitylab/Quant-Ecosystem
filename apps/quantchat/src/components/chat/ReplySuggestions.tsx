'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// Task 12.3 (Requirement 11.3): Reply suggestions.
//
// Displays a horizontal row of up to 3 contextual reply chips directly above
// the keyboard / message input. Suggestions refresh as the draft changes
// (debounced). The backend ALWAYS returns ≤ 3 suggestions (Property 31); this
// component additionally hard-caps the rendered chips at 3 as a UI safety net.
// ============================================================================

const MAX_SUGGESTIONS = 3;

export interface ReplySuggestionsResponse {
  success: boolean;
  data?: { suggestions: string[]; isAIGenerated: boolean };
}

export interface ReplySuggestionsProps {
  conversationId: string;
  /** Recent messages for context (oldest → newest). */
  messages?: Array<{ sender: string; content: string; isSelf?: boolean }>;
  /** Current draft text — suggestions update as this changes. */
  draft?: string;
  /** Called when the user taps a suggestion chip. */
  onSelect: (suggestion: string) => void;
  /**
   * Fetcher override (defaults to POST /api/ai/suggestions). Injectable for
   * tests / storybook.
   */
  fetchSuggestions?: (args: {
    conversationId: string;
    messages: Array<{ sender: string; content: string; isSelf?: boolean }>;
    draft?: string;
    signal: AbortSignal;
  }) => Promise<string[]>;
  className?: string;
}

async function defaultFetchSuggestions(args: {
  conversationId: string;
  messages: Array<{ sender: string; content: string; isSelf?: boolean }>;
  draft?: string;
  signal: AbortSignal;
}): Promise<string[]> {
  const res = await fetch('/api/ai/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: args.conversationId,
      messages: args.messages,
      draft: args.draft,
    }),
    signal: args.signal,
  });
  if (!res.ok) return [];
  const json = (await res.json()) as ReplySuggestionsResponse;
  return json.success && json.data ? json.data.suggestions : [];
}

export function ReplySuggestions({
  conversationId,
  messages = [],
  draft,
  onSelect,
  fetchSuggestions = defaultFetchSuggestions,
  className = '',
}: ReplySuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (messages.length === 0 && !draft) {
      setSuggestions([]);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    fetchSuggestions({ conversationId, messages, draft, signal: controller.signal })
      .then((result) => {
        // UI safety net: never render more than 3 chips (Property 31).
        setSuggestions(result.slice(0, MAX_SUGGESTIONS));
      })
      .catch(() => {
        /* aborted or network error — keep prior suggestions */
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [conversationId, messages, draft, fetchSuggestions]);

  // Debounce refreshes as the user types / context changes.
  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => {
      clearTimeout(timeout);
      abortRef.current?.abort();
    };
  }, [refresh]);

  const visible = suggestions.slice(0, MAX_SUGGESTIONS);

  return (
    <div
      className={`flex items-center gap-2 overflow-x-auto px-3 py-2 ${className}`}
      role="listbox"
      aria-label="AI reply suggestions"
      data-loading={loading}
    >
      <AnimatePresence initial={false}>
        {visible.map((suggestion, index) => (
          <motion.button
            key={`${suggestion}-${index}`}
            type="button"
            role="option"
            aria-selected="false"
            onClick={() => onSelect(suggestion)}
            initial={{ opacity: 0, scale: 0.9, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 6 }}
            transition={{ duration: 0.18, delay: index * 0.04 }}
            whileTap={{ scale: 0.95 }}
            className="shrink-0 whitespace-nowrap rounded-full border border-violet-300/60 dark:border-violet-500/40 bg-white/80 dark:bg-gray-800/80 px-4 py-1.5 text-sm text-gray-800 dark:text-gray-100 shadow-sm hover:bg-violet-50 dark:hover:bg-gray-700 transition-colors"
          >
            {suggestion}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default ReplySuggestions;
