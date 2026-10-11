// ============================================================================
// QuantChat - 404 (Pages Router)
// ============================================================================
//
// The Pages Router twin of src/app/not-found.tsx: unknown URLs under the
// Pages Router shell get this real 404 instead of a bounce to /login.
// It renders inside src/pages/_app.tsx, whose PagesAuthGate classifies the
// (unknown) path as 'unknown' and lets it through to render here.

import Head from 'next/head';
import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title>Page not found — QuantChat</title>
      </Head>
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--quant-background)] px-6 py-16 text-center text-[var(--quant-foreground)]">
        <p className="text-5xl font-bold tracking-tight" aria-hidden="true">
          404
        </p>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="max-w-sm text-sm text-[var(--quant-muted-foreground)]">
          This link doesn&apos;t point to a QuantChat page. It may have been moved, renamed, or
          never existed.
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
    </>
  );
}
