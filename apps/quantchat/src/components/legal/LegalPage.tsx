// ============================================================================
// QuantChat - Legal page shell (Terms / Privacy / Support)
// Static, public pages — listed in AuthGate.PUBLIC_PATHS so logged-out users
// can reach them from the login footer (P0-2).
// ============================================================================

import type { ReactNode } from 'react';

export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#080B12] relative overflow-hidden px-4 py-10 font-sans text-slate-200">
      {/* Ambient background — matches the login page */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 mx-auto w-full max-w-2xl">
        <a
          href="/login"
          className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-8"
        >
          <span aria-hidden="true">←</span> Back to sign in
        </a>

        <article className="backdrop-blur-2xl bg-[#0B101B]/80 border border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-emerald-950/20">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-400/80">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-2 text-xs text-slate-500">Last updated: {updated}</p>

          <div className="legal-prose mt-8 space-y-6 text-[15px] leading-relaxed text-slate-300">
            {children}
          </div>
        </article>

        <div className="mt-8 flex items-center justify-center gap-4 text-[11px] text-slate-500">
          <a href="/terms" className="hover:text-slate-300 transition-colors">
            Terms
          </a>
          <span className="text-slate-700">·</span>
          <a href="/privacy" className="hover:text-slate-300 transition-colors">
            Privacy Policy
          </a>
          <span className="text-slate-700">·</span>
          <a href="/support" className="hover:text-slate-300 transition-colors">
            Support
          </a>
        </div>
      </div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-white mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
