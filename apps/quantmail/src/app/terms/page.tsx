'use client';

import Link from 'next/link';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';
import { PageTransition } from '@quant/shared-ui';

const SECTIONS = [
  {
    title: 'Your account',
    body: 'You are responsible for keeping your password private and for activity under your address. If you believe your account is compromised, reset your password immediately.',
  },
  {
    title: 'Acceptable use',
    body: 'Do not use QuantMail to send spam, phishing, malware, or content that violates the law. Accounts used for abuse may be limited or closed.',
  },
  {
    title: 'Your content',
    body: 'Your mail and files remain yours. We do not sell your personal data. How we handle it is described in the Privacy Policy.',
  },
  {
    title: 'Service availability',
    body: 'QuantMail is provided as-is. We work to keep it reliable, but we do not guarantee uninterrupted access.',
  },
  {
    title: 'Changes',
    body: 'We may update these terms as the product evolves. Continued use after a change means you accept the updated terms.',
  },
];

export default function TermsPage() {
  return (
    <PageTransition>
      <AuthShell
        brand={
          <AuthBrandPanel
            eyebrow="Legal"
            title="Terms of Service."
            subtitle="The short version of the rules that keep QuantMail fair for everyone."
          />
        }
      >
        <div>
          <div className="mb-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
              Legal
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--quant-foreground)] sm:text-[30px]">
              Terms of Service
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              Last updated October 2026.
            </p>
          </div>

          <div className="space-y-6">
            {SECTIONS.map((section, index) => (
              <section key={section.title}>
                <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
                  {index + 1}. {section.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
                  {section.body}
                </p>
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
    </PageTransition>
  );
}
