'use client';
// ============================================================================
// @quant/shared-ui - QuantSidekick
// ============================================================================
//
// The universal QuantAI presence. EcosystemShell mounts <QuantSidekickProvider>
// (so any surface can drive the assistant via useQuantSidekick) and a single
// floating <QuantSidekick> widget (the Bubble Intelligence avatar + a small
// panel). This is how QuantAI appears consistently in EVERY Quant app.
//
// The provider holds only UI/presence state; the actual intelligence lives in
// the cross-cutting engines (contextual-sidekick / quant-orchestrator) which a
// host can bridge in by calling setStatus/say/setSuggestions from its own
// AI calls (see `runTask` for the common "thinking -> speaking" lifecycle).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BubbleAvatar, type QuantSidekickStatus } from './BubbleAvatar';

export interface QuantSidekickSuggestion {
  id: string;
  label: string;
  onSelect: () => void;
}

export interface QuantSidekickContextValue {
  status: QuantSidekickStatus;
  message: string | null;
  suggestions: QuantSidekickSuggestion[];
  isOpen: boolean;
  setStatus: (status: QuantSidekickStatus) => void;
  /** Show a message and (optionally) move to a state; opens the panel. */
  say: (message: string, status?: QuantSidekickStatus) => void;
  clearMessage: () => void;
  setSuggestions: (suggestions: QuantSidekickSuggestion[]) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /**
   * Run an async unit of assistant work with the correct motion lifecycle:
   * `thinking` while it runs, then `speaking` (if a message is returned) or
   * back to `idle`. Always restores `idle` on error and rethrows.
   */
  runTask: <T>(work: () => Promise<T>, opts?: { speakOnDone?: string }) => Promise<T>;
}

const QuantSidekickContext = createContext<QuantSidekickContextValue | null>(null);

export interface QuantSidekickProviderProps {
  children: React.ReactNode;
  initialStatus?: QuantSidekickStatus;
  initialOpen?: boolean;
}

export function QuantSidekickProvider({
  children,
  initialStatus = 'idle',
  initialOpen = false,
}: QuantSidekickProviderProps) {
  const [status, setStatus] = useState<QuantSidekickStatus>(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<QuantSidekickSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(initialOpen);

  const say = useCallback((msg: string, nextStatus: QuantSidekickStatus = 'speaking') => {
    setMessage(msg);
    setStatus(nextStatus);
    setIsOpen(true);
  }, []);

  const clearMessage = useCallback(() => setMessage(null), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const runTask = useCallback(
    async <T,>(work: () => Promise<T>, opts?: { speakOnDone?: string }): Promise<T> => {
      setStatus('thinking');
      try {
        const result = await work();
        if (opts?.speakOnDone) {
          setMessage(opts.speakOnDone);
          setStatus('speaking');
          setIsOpen(true);
        } else {
          setStatus('idle');
        }
        return result;
      } catch (err) {
        setStatus('idle');
        throw err;
      }
    },
    [],
  );

  const value = useMemo<QuantSidekickContextValue>(
    () => ({
      status,
      message,
      suggestions,
      isOpen,
      setStatus,
      say,
      clearMessage,
      setSuggestions,
      open,
      close,
      toggle,
      runTask,
    }),
    [status, message, suggestions, isOpen, say, clearMessage, open, close, toggle, runTask],
  );

  return <QuantSidekickContext.Provider value={value}>{children}</QuantSidekickContext.Provider>;
}

/** Access (and drive) the universal QuantAI presence. Must be under a provider. */
export function useQuantSidekick(): QuantSidekickContextValue {
  const ctx = useContext(QuantSidekickContext);
  if (!ctx) {
    throw new Error(
      'useQuantSidekick must be used within a QuantSidekickProvider / EcosystemShell',
    );
  }
  return ctx;
}

export interface QuantSidekickProps {
  /** Corner to dock the floating alien in. */
  position?: 'bottom-right' | 'bottom-left';
  /** Avatar size in px. */
  size?: number;
}

/**
 * The single floating QuantAI widget: the Bubble Intelligence avatar (a toggle
 * button) plus an expandable panel showing the current message and contextual
 * suggestions. Rendered once by EcosystemShell so it is present in every app.
 */
export const QuantSidekick: React.FC<QuantSidekickProps> = ({
  position = 'bottom-right',
  size = 56,
}) => {
  const { status, message, suggestions, isOpen, toggle, close } = useQuantSidekick();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('quant_sidekick_enabled');
      if (stored === 'true') {
        setEnabled(true);
      }
    } catch {
      // ignore
    }

    const handleToggle = (e: Event) => {
      const custom = e as CustomEvent<{ enabled?: boolean }>;
      if (custom.detail?.enabled !== undefined) {
        setEnabled(custom.detail.enabled);
        try {
          localStorage.setItem('quant_sidekick_enabled', String(custom.detail.enabled));
        } catch {}
      } else {
        setEnabled((prev) => {
          const next = !prev;
          try {
            localStorage.setItem('quant_sidekick_enabled', String(next));
          } catch {}
          return next;
        });
      }
    };

    window.addEventListener('quant:toggle-sidekick', handleToggle);
    return () => window.removeEventListener('quant:toggle-sidekick', handleToggle);
  }, []);

  // When neither enabled by user nor explicitly opened, do NOT clutter the screen
  if (!enabled && !isOpen) {
    return null;
  }

  const sideClass = position === 'bottom-right' ? 'right-4' : 'left-4';

  return (
    <div
      className={`fixed bottom-4 ${sideClass} z-50 flex flex-col items-end gap-2`}
      data-testid="quant-sidekick"
    >
      {isOpen && (
        <div
          role="dialog"
          aria-label="QuantAI assistant"
          data-testid="quant-sidekick-panel"
          className="w-72 max-w-[80vw] rounded-2xl border border-orange-200/60 bg-[#1a120a]/95 p-4 shadow-[0_12px_40px_-12px_rgba(255,140,66,0.45)] backdrop-blur dark:border-orange-500/20"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-orange-50">QuantAI</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close QuantAI assistant"
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
            >
              ×
            </button>
          </div>
          <p
            className="min-h-[1.25rem] text-sm text-orange-100/85"
            data-testid="quant-sidekick-message"
          >
            {message ?? 'How can I help across your Quant apps?'}
          </p>
          {suggestions.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1" data-testid="quant-sidekick-suggestions">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={s.onSelect}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-orange-200 transition-colors hover:bg-orange-500/15 hover:text-orange-100"
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label="Open QuantAI assistant"
        aria-expanded={isOpen}
        data-testid="quant-sidekick-toggle"
        className="rounded-full p-0.5 shadow-[0_8px_28px_-8px_rgba(255,140,66,0.7)] transition-transform duration-200 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 active:scale-95"
      >
        <BubbleAvatar state={status} size={size} />
      </button>
    </div>
  );
};

QuantSidekick.displayName = 'QuantSidekick';
