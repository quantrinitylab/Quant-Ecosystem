'use client';

// ============================================================================
// QuantAI - Unauthenticated Onboarding Hero & Sign-in Gateway
// ============================================================================

import React from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface OnboardingHeroProps {
  onContinueQuantSSO: () => void;
  onContinueAsGuest: () => void;
  onDismiss?: () => void;
}

export function OnboardingHero({
  onContinueQuantSSO,
  onContinueAsGuest,
  onDismiss,
}: OnboardingHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-gradient-to-br from-[var(--quant-surface)] via-[var(--quant-surface)] to-[var(--quant-surface-hover)] p-6 md:p-8 shadow-xl mb-6">
      {/* Background glow accents */}
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto space-y-6">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', ...spring.snappy }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
        >
          <span className="animate-pulse">⚡</span>
          <span>QUANT INTELLIGENCE CONTROL PLANE • v2.4</span>
        </motion.div>

        {/* Headline */}
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--foreground)]">
            Meet{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
              Quanty
            </span>
          </h2>
          <p className="text-sm md:text-base text-[var(--foreground-secondary)] max-w-2xl mx-auto leading-relaxed">
            Full Claude Code + Codex + ChatGPT parity. Converse with multi-model AI, execute
            autonomous terminal workflows, inspect live tool trees, and preview interactive
            components in split-screen canvas.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full text-left mt-2">
          <div className="p-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)]/60 hover:border-emerald-500/40 transition-colors">
            <div className="text-xl mb-1.5">💬</div>
            <div className="text-xs font-semibold text-[var(--foreground)]">Chat Mode</div>
            <div className="text-[11px] text-[var(--foreground-secondary)] mt-1 leading-snug">
              ChatGPT & Claude conversational streaming, multi-model switcher & personas.
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)]/60 hover:border-emerald-500/40 transition-colors">
            <div className="text-xl mb-1.5">⚡</div>
            <div className="text-xs font-semibold text-[var(--foreground)]">Agent & Code Mode</div>
            <div className="text-[11px] text-[var(--foreground-secondary)] mt-1 leading-snug">
              Claude Code / Codex CLI with terminal prompt, multi-step tree & reasoning chains.
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)]/60 hover:border-emerald-500/40 transition-colors">
            <div className="text-xl mb-1.5">🎨</div>
            <div className="text-xs font-semibold text-[var(--foreground)]">
              Split-Screen Canvas
            </div>
            <div className="text-[11px] text-[var(--foreground-secondary)] mt-1 leading-snug">
              Live interactive component preview, syntax editor with copy/apply & markdown.
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)]/60 hover:border-emerald-500/40 transition-colors">
            <div className="text-xl mb-1.5">🌐</div>
            <div className="text-xs font-semibold text-[var(--foreground)]">
              Cross-App MCP Bridge
            </div>
            <div className="text-[11px] text-[var(--foreground-secondary)] mt-1 leading-snug">
              Direct tool execution across QuantMail, QuantDrive, Calendar, Git & Chat.
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto pt-2">
          <button
            type="button"
            onClick={onContinueQuantSSO}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all cursor-pointer"
          >
            <span className="text-base">⚡</span>
            <span>Continue with Quant Account</span>
          </button>

          <button
            type="button"
            onClick={onContinueAsGuest}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:bg-[var(--quant-surface-hover)] text-[var(--foreground)] font-medium text-sm transition-colors cursor-pointer"
          >
            <span>Continue as Guest</span>
            <span className="text-xs text-[var(--foreground-secondary)]">→</span>
          </button>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[11px] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] underline underline-offset-4 transition-colors"
          >
            Dismiss for now
          </button>
        )}
      </div>
    </div>
  );
}

export default OnboardingHero;
