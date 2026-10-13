// ============================================================================
// Login skeleton — instant, zero-JS paint for the sign-in shell
// (fix/qm-login-paint-vs-gmail).
//
// Server components only: no 'use client', no hooks, no browser APIs. The
// skeleton is pure static markup + CSS, so it paints with the first HTML
// bytes — no spinner wall, no waiting on JS. Used as the Suspense fallback
// inside the login page and as the whole body of login/loading.tsx (client-
// side navigations to /login).
// ============================================================================

import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';

/** Shared brand copy for the sign-in shell (single source — page + skeleton). */
export function LoginBrand() {
  return (
    <AuthBrandPanel
      eyebrow="Return to your workspace"
      title="Your work, back in focus."
      subtitle="Open your mail workspace with threads, schedules, and assisted drafting kept in one clear flow."
    />
  );
}

/**
 * Inner skeleton: form-shaped shimmer blocks that mirror the real sign-in
 * form's geometry (heading, two 46px fields, primary action). Renders inside
 * an already-mounted AuthShell.
 */
export function LoginSkeletonBody() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the sign-in form…</span>
      <div className="mb-6 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08]" />
        <div>
          <div className="h-3 w-28 bg-white/[0.06] rounded" />
          <div className="h-2.5 w-36 bg-white/[0.04] rounded mt-1.5" />
        </div>
      </div>
      <div className="mb-7">
        <div className="h-5 w-32 bg-[var(--quant-primary)]/10 rounded-full mb-2.5" />
        <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-white">
          Sign in to QuantMail
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Enter your email address and password.
        </p>
      </div>
      <div aria-hidden="true" className="space-y-4">
        <div className="h-[46px] rounded-xl border border-white/[0.08] bg-[var(--quant-surface)]/90" />
        <div className="h-[46px] rounded-xl border border-white/[0.08] bg-[var(--quant-surface)]/90" />
        <div className="h-[46px] rounded-xl auth-primary-action opacity-40" />
      </div>
    </div>
  );
}

/** Full-shell skeleton for route-level loading (login/loading.tsx). */
export function LoginSkeleton() {
  return (
    <AuthShell brand={<LoginBrand />}>
      <LoginSkeletonBody />
    </AuthShell>
  );
}
