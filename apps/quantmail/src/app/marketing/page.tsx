import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveApp } from '@quant/app-registry';
import { quantMailBrandLockup, quantMailBrandMetadata } from '../../brand/identity';

/**
 * QuantMail's OWN public marketing landing — the per-app "marketing" surface
 * from the restructure (apps/quantmail owns its story instead of the horizontal
 * `apps/marketing` shell). Public route: added to AuthGuard's PUBLIC_PATHS so a
 * signed-out visitor can read it. Identity (name / accent / maturity) is pulled
 * LIVE from `@quant/app-registry`, so it can never drift from the catalog.
 *
 * Server Component (no client hooks) so it renders statically with real SEO
 * metadata and ships no JS for the content itself.
 */

const app = resolveApp('quantmail');

export const metadata: Metadata = {
  title: `${app.name} — the intelligent inbox at the center of your work`,
  description: quantMailBrandMetadata.description,
  alternates: { canonical: '/marketing' },
  openGraph: {
    title: `${app.name} — the intelligent inbox`,
    description: quantMailBrandMetadata.description,
    type: 'website',
  },
};

interface Feature {
  title: string;
  blurb: string;
}

/** The suite QuantMail hosts today (apps/quantmail/src/app/{drive,calendar,documents,repos,quantgit}). */
const FEATURES: Feature[] = [
  { title: 'Intelligent inbox', blurb: 'AI triage, threading, and instant search keep the signal above the noise.' },
  { title: 'QuantDrive', blurb: 'Files live beside your mail — attach, preview, and share without leaving the thread.' },
  { title: 'QuantCalendar', blurb: 'Scheduling is built in: events, availability, and public booking links.' },
  { title: 'QuantDocs', blurb: 'Draft, collaborate, and send documents from the same workspace.' },
  { title: 'Git & CodeHub', blurb: 'Review repos, pull requests, and CI runs right where you already work.' },
  { title: 'One Quant identity', blurb: 'QuantMail is the SSO root — one sign-in carries you across every Quant app.' },
];

const MATURITY_COPY: Record<string, string> = {
  ga: 'Generally available',
  beta: 'Public beta',
  alpha: 'Early access',
};

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6 transition-colors hover:border-[color-mix(in_srgb,var(--quant-muted-foreground)_40%,transparent)]">
      <h3 className="text-base font-semibold text-[var(--quant-foreground)]">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--quant-muted-foreground)]">
        {feature.blurb}
      </p>
    </div>
  );
}

export default function QuantMailMarketingPage() {
  const maturity = MATURITY_COPY[app.maturity] ?? app.maturity.toUpperCase();
  return (
    <main
      id="main-content"
      className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span
            className="flex size-9 items-center justify-center rounded-lg border text-sm font-bold"
            style={{ borderColor: `${app.color}55`, backgroundColor: `${app.color}1a`, color: app.color }}
          >
            QM
          </span>
          <span className="text-lg font-semibold tracking-tight">{app.name}</span>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/login"
            className="text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg px-3 py-1.5 font-medium text-[var(--quant-surface)]"
            style={{ backgroundColor: app.color }}
          >
            Get started
          </Link>
        </nav>
      </header>
      <section className="mx-auto max-w-6xl px-6 pb-8 pt-10 sm:pt-16">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
          style={{ borderColor: `${app.color}55`, color: app.color }}
        >
          <span className="inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: app.color }} />
          {maturity} · {quantMailBrandLockup.byline}
        </span>
        <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          The intelligent inbox at the center of your work.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--quant-muted-foreground)]">
          {quantMailBrandMetadata.description} Mail, files, calendar, docs, and code — one
          workspace, one identity, connected across the whole Quant ecosystem.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/register"
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-[var(--quant-surface)]"
            style={{ backgroundColor: app.color }}
          >
            Create your account
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] px-5 py-2.5 text-sm font-semibold text-[var(--quant-foreground)]"
          >
            Sign in
          </Link>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
          Everything, in one workspace
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-4">
        <div
          className="flex flex-col items-start justify-between gap-5 rounded-2xl border p-8 sm:flex-row sm:items-center"
          style={{ borderColor: `${app.color}44`, backgroundColor: `${app.color}12` }}
        >
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Ready when you are.</h2>
            <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
              Join with your Quant identity and your whole workspace comes with you.
            </p>
          </div>
          <Link
            href="/register"
            className="shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold text-[var(--quant-surface)]"
            style={{ backgroundColor: app.color }}
          >
            Get started free
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-[var(--quant-muted-foreground)]">
        {app.name} · part of the Quant ecosystem · {quantMailBrandMetadata.applicationName}
      </footer>
    </main>
  );
}
