'use client';

// ============================================================================
// QuantAI - Unauthenticated Onboarding Hero & Sign-in Gateway
// ============================================================================

import React from 'react';

interface OnboardingHeroProps {
  // R3-P1-4 (2026-10-10): single sign-in entry point. The hero used to offer a
  // direct-SSO button AND a sign-in button — two of the 4+ paths on one
  // screen. Every CTA now routes to /login, which presents SSO + email.
  onSignIn: () => void;
  onDismiss?: () => void;
}

export function OnboardingHero({
  onSignIn,
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
        {/* Headline */}
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--foreground)]">
            Meet{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
              Quanty
            </span>
          </h2>
          <p className="text-sm md:text-base text-[var(--foreground-secondary)] max-w-2xl mx-auto leading-relaxed">
            Converse with multi-model AI, execute
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
              Conversational streaming, multi-model switcher &amp; personas.
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)]/60 hover:border-emerald-500/40 transition-colors">
            <div className="text-xl mb-1.5">⚡</div>
            <div className="text-xs font-semibold text-[var(--foreground)]">Agent & Code Mode</div>
            <div className="text-[11px] text-[var(--foreground-secondary)] mt-1 leading-snug">
              Agentic terminal with prompt, multi-step tree &amp; reasoning chains.
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

        {/* Action Buttons — single sign-in path (R3-P1-4): /login presents the
            SSO hero and email credentials. */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto pt-2">
          <button
            type="button"
            onClick={onSignIn}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all cursor-pointer"
          >
            <span>Sign in to start chatting</span>
            <span className="text-xs">→</span>
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
