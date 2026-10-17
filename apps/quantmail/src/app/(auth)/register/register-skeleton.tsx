// ============================================================================
// Register skeleton — instant, zero-JS paint for the sign-up shell
// (fix/qm-auth-pages-paint).
//
// Server components only: no 'use client', no hooks, no browser APIs. The
// skeleton is pure static markup + CSS, so it paints with the first HTML
// bytes — no spinner wall, no waiting on JS. Used as the Suspense fallback
// inside the register page and as the whole body of register/loading.tsx
// (client-side navigations to /register).
// ============================================================================

import { AuthBrandPanel } from '../../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../../components/auth/AuthShell';

/** Shared brand copy for the sign-up shell (single source — page + skeleton). */
export function RegisterBrand() {
  // Copy-honesty note (2026-10-15, P1 auth-sso finding — carried over from
  // origin/main's register/page.tsx via merge): this subtitle previously
  // promised "assisted drafting", which is not a provable user-facing truth
  // (see note in login/login-skeleton.tsx). Restricted to shipped features:
  // mail, scheduling.
  return (
    <AuthBrandPanel
      eyebrow="Create your workspace identity"
      title="Start with one clear address."
      subtitle="Claim a QuantMail handle for a focused workspace across mail and scheduling."
    />
  );
}

/**
 * Inner skeleton: form-shaped shimmer blocks that mirror the real sign-up
 * form's geometry (heading, handle/password/confirm fields, terms row,
 * primary action). Renders inside an already-mounted AuthShell.
 */
export function RegisterSkeletonBody() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the sign-up form…</span>
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
          Create your QuantMail
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Pick the handle for your QuantMail address.
        </p>
      </div>
      <div aria-hidden="true" className="space-y-4">
        <div className="h-[46px] rounded-xl border border-white/[0.08] bg-[var(--quant-surface)]/90" />
        <div className="h-[46px] rounded-xl border border-white/[0.08] bg-[var(--quant-surface)]/90" />
        <div className="h-[46px] rounded-xl border border-white/[0.08] bg-[var(--quant-surface)]/90" />
        <div className="h-[46px] rounded-xl auth-primary-action opacity-40" />
      </div>
    </div>
  );
}

/** Full-shell skeleton for route-level loading (register/loading.tsx). */
export function RegisterSkeleton() {
  return (
    <AuthShell brand={<RegisterBrand />}>
      <RegisterSkeletonBody />
    </AuthShell>
  );
}
