// ============================================================================
// QuantChat - 404 (App Router)
// ============================================================================
//
// A REAL not-found page. Unknown paths used to be bounced to /login by the
// auth gate (it gated "anything that isn't public"), which masked broken
// links and made 404s undetectable (P2, live audit 2026-10-11). The gate
// now classifies paths through src/lib/route-access.ts and steps aside
// for unknown ones, so this page is what a bad link actually shows.

import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--quant-background)] px-6 py-16 text-center text-[var(--quant-foreground)]">
      <p className="text-5xl font-bold tracking-tight" aria-hidden="true">
        404
      </p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-[var(--quant-muted-foreground)]">
        This link doesn&apos;t point to a QuantChat page. It may have been moved, renamed, or never
        existed.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="flex min-h-[44px] items-center rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          Go to chats
        </Link>
        <Link
          href="/login"
          className="flex min-h-[44px] items-center rounded-full bg-[var(--quant-muted)] px-5 text-sm font-medium text-[var(--quant-foreground)] hover:bg-[var(--quant-border)]"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
