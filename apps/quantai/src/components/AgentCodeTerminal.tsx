'use client';

// ============================================================================
// QuantAI - AgentCodeTerminal (honest placeholder)
//
// The previous version of this component was a client-side simulation: a fake
// terminal with canned "tool executions", fabricated timings and a scripted
// banner, backed by zero backend calls. Per the no-fake-surfaces rule, the
// simulation is removed. Agentic code execution is not built yet — this panel
// says so honestly instead of pretending to run tools.
// ============================================================================

import React from 'react';
import type { CanvasArtifact } from '../types/agent-mode';

interface AgentCodeTerminalProps {
  onArtifactGenerated?: (artifact: CanvasArtifact) => void;
  onOpenCanvas?: () => void;
  currentModelName?: string;
}

export function AgentCodeTerminal({ currentModelName = 'Quanty' }: AgentCodeTerminalProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--quant-surface-hover)]">
          <svg
            className="h-6 w-6 text-[var(--foreground-secondary)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
            />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          Agent / Code Mode isn&apos;t available yet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-secondary)]">
          Agentic code execution hasn&apos;t been built yet. {currentModelName} can still
          help you in Chat Mode — ask it to write code, explain diffs, or plan a
          change, and paste the result where you need it.
        </p>
      </div>
    </div>
  );
}
