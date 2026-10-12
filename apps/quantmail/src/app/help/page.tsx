'use client';

import Link from 'next/link';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';

type Topic = {
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
};

const TOPICS: Topic[] = [
  {
    // Email address recovery is not available yet (per the locked auth design,
    // phone-based recovery was removed): honest body + support mailto only.
    title: 'Signing in',
    body: 'Use the QuantMail address you created, for example you@quantmail.in. Email address recovery is not available yet — if you cannot remember which address you used, contact support at support@quantrinity.in.',
    href: 'mailto:support@quantrinity.in',
    linkLabel: 'Email support',
  },
  {
    title: 'Resetting your password',
    body: 'Choose Forgot password? on the sign-in page and follow the instructions sent to your address.',
    href: '/forgot-password',
    linkLabel: 'Reset your password',
  },
  {
    title: 'Creating an address',
    body: 'New to QuantMail? Pick an address during registration. One identity gives you access to all Quant apps.',
    href: '/register',
    linkLabel: 'Create an address',
  },
];

export default function HelpPage() {
  return (
    <div className="auth-page-enter">
      <AuthShell
        brand={
          <AuthBrandPanel
            eyebrow="Help"
            title="How can we help?"
            subtitle="Answers to the questions we hear most about signing in and managing your QuantMail account."
          />
        }
      >
        <div>
          <div className="mb-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
              Help
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--quant-foreground)] sm:text-[30px]">
              Help center
            </h1>
          </div>

          <div className="space-y-4">
            {TOPICS.map((topic) => (
              <section
                key={topic.title}
                className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5"
              >
                <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
                  {topic.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
                  {topic.body}
                </p>
                {topic.href && topic.linkLabel ? (
                  <Link
                    href={topic.href}
                    className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  >
                    {topic.linkLabel}
                  </Link>
                ) : null}
              </section>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-[var(--quant-muted-foreground)]">
            <Link
              href="/login"
              className="font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline"
            >
              Return to sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    </div>
  );
}
