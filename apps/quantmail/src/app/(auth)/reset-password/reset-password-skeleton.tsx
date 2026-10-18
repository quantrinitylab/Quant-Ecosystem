// ============================================================================
// Reset-password skeleton — instant, zero-JS paint for the new-password shell
// (fix/qm-auth-pages-paint).
//
// Server components only: no 'use client', no hooks, no browser APIs. The
// skeleton is pure static markup + CSS, so it paints with the first HTML
// bytes — no spinner wall, no waiting on JS. Used as the Suspense fallback
// inside the reset-password page and as the whole body of
// reset-password/loading.tsx (client-side navigations).
// ============================================================================

import { AuthBrandPanel } from '../../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../../components/auth/AuthShell';

/** Shared brand copy for the new-password shell (single source). */
export function ResetPasswordBrand() {
  return (
    <AuthBrandPanel
      eyebrow="Account recovery"
      title="Pick something only you know."
      subtitle="Setting a new password signs out every device that was already signed in."
    />
  );
}

/**
 * Inner skeleton: form-shaped shimmer blocks that mirror the real
 * reset-password form's geometry (heading, two password fields, primary
 * action). Renders inside an already-mounted AuthShell.
 */
export function ResetPasswordSkeletonBody() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the new password form…</span>
      <div className="mb-6 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08]" />
        <div>
          <div className="h-3 w-28 bg-white/[0.06] rounded" />
          <div className="h-2.5 w-36 bg-white/[0.04] rounded mt-1.5" />
        </div>
      </div>
      <div className="mb-8">
        <div className="h-5 w-32 bg-[var(--quant-primary)]/10 rounded-full mb-2.5" />
        <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-white">
          Set a new password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Choose a password of at least 8 characters. The link works once.
        </p>
      </div>
      <div aria-hidden="true" className="space-y-5">
        <div className="h-[46px] rounded-xl border border-white/[0.08] bg-[var(--quant-surface)]/90" />
        <div className="h-[46px] rounded-xl border border-white/[0.08] bg-[var(--quant-surface)]/90" />
        <div className="h-[46px] rounded-xl auth-primary-action opacity-40" />
      </div>
    </div>
  );
}

/** Full-shell skeleton for route-level loading (reset-password/loading.tsx). */
export function ResetPasswordSkeleton() {
  return (
    <AuthShell brand={<ResetPasswordBrand />}>
      <ResetPasswordSkeletonBody />
    </AuthShell>
  );
}
