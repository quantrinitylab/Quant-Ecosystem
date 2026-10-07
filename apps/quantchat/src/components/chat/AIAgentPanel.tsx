'use client';

import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { AIGeneratedBadge } from './AIGeneratedBadge';

// ============================================================================
// Task 12.1 / 12.9 (Requirement 11.1, 11.9): AI Agent Panel.
//
// Per-conversation control surface for the Quant AI Agent. Its primary control
// is the auto-reply toggle: enabling it tells the backend to generate
// contextual replies on the user's behalf; disabling it immediately stops
// generation and cancels any queued unsent AI responses (the backend returns
// the number of cancelled responses, surfaced here as feedback).
// ============================================================================

export interface AutoReplyToggleResponse {
  success: boolean;
  data?: { conversationId: string; enabled: boolean; cancelledCount: number };
}

export interface AIAgentPanelProps {
  conversationId: string;
  /** Initial enabled state (e.g. restored from per-conversation settings). */
  initialEnabled?: boolean;
  /** Notifies the parent when auto-reply is toggled. */
  onToggle?: (enabled: boolean, cancelledCount: number) => void;
  /** Fetcher override (defaults to POST /api/ai/auto-reply/toggle). */
  toggleAutoReply?: (args: {
    conversationId: string;
    enabled: boolean;
  }) => Promise<{ enabled: boolean; cancelledCount: number }>;
  className?: string;
}

async function defaultToggleAutoReply(args: {
  conversationId: string;
  enabled: boolean;
}): Promise<{ enabled: boolean; cancelledCount: number }> {
  const res = await fetch('/api/ai/auto-reply/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error('toggle failed');
  const json = (await res.json()) as AutoReplyToggleResponse;
  if (!json.success || !json.data) throw new Error('toggle failed');
  return { enabled: json.data.enabled, cancelledCount: json.data.cancelledCount };
}

export function AIAgentPanel({
  conversationId,
  initialEnabled = false,
  onToggle,
  toggleAutoReply = defaultToggleAutoReply,
  className = '',
}: AIAgentPanelProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleToggle = useCallback(async () => {
    if (pending) return;
    const next = !enabled;
    setPending(true);
    setStatus(null);

    // Optimistic update for snappy UI.
    setEnabled(next);
    try {
      const result = await toggleAutoReply({ conversationId, enabled: next });
      setEnabled(result.enabled);
      if (!result.enabled && result.cancelledCount > 0) {
        setStatus(
          `Auto-reply off — cancelled ${result.cancelledCount} queued AI ${
            result.cancelledCount === 1 ? 'response' : 'responses'
          }.`,
        );
      } else {
        setStatus(result.enabled ? 'Auto-reply on' : 'Auto-reply off');
      }
      onToggle?.(result.enabled, result.cancelledCount);
    } catch {
      // Roll back on failure.
      setEnabled(!next);
      setStatus('Could not update auto-reply. Try again.');
    } finally {
      setPending(false);
    }
  }, [conversationId, enabled, pending, toggleAutoReply, onToggle]);

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border border-violet-200/60 dark:border-violet-500/30 bg-white/70 dark:bg-gray-900/70 p-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-lg">
            {'\uD83D\uDC7D'}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Quant AI Auto-Reply
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Replies in your style while you&apos;re away
            </span>
          </div>
          <AIGeneratedBadge size="sm" className="ml-1" />
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle AI auto-reply"
          disabled={pending}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            enabled ? 'bg-violet-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ${
              enabled ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {status && (
        <p
          role="status"
          className="text-xs text-gray-500 dark:text-gray-400"
          data-testid="auto-reply-status"
        >
          {status}
        </p>
      )}
    </div>
  );
}

export default AIAgentPanel;
