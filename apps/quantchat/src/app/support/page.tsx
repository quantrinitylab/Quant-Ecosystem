// ============================================================================
// QuantChat - Support (public page, see AuthGate.PUBLIC_PATHS)
// ============================================================================

import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '../../components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Support — QuantChat',
  description: 'QuantChat help, FAQs, and contact.',
};

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'I cannot sign in. What should I do?',
    a: 'QuantChat uses your Quant Account (QuantMail SSO). Make sure you can sign in at quantmail.in first, then choose “Continue with Quant Account” here. If you use a user ID and password, check for typos — passwords are case-sensitive.',
  },
  {
    q: 'Messages are not arriving in realtime.',
    a: 'QuantChat falls back to periodic refresh if the realtime connection drops, so messages still arrive within a few seconds. Check your network connection; if the problem persists, reload the page.',
  },
  {
    q: 'Are my messages really private?',
    a: 'Yes. Conversations are end-to-end encrypted — only you and the people you message can read them. We cannot read or recover message content.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Write to support@quantrinity.in from your account email with the subject “Delete my QuantChat account”. We will confirm before deleting.',
  },
  {
    q: 'I found a security issue.',
    a: 'Please report it privately to support@quantrinity.in with steps to reproduce. Do not disclose it publicly before we have had a chance to fix it.',
  },
];

export default function SupportPage() {
  return (
    <LegalPage eyebrow="QuantChat · Help" title="Support" updated="October 6, 2026">
      <LegalSection title="Contact us">
        <p>
          Email us at{' '}
          <a
            href="mailto:support@quantrinity.in"
            className="text-emerald-400 hover:text-emerald-300"
          >
            support@quantrinity.in
          </a>{' '}
          — include your QuantChat user ID and a description of the problem. We
          aim to reply within two business days.
        </p>
      </LegalSection>

      <LegalSection title="Frequently asked questions">
        <div className="space-y-4">
          {FAQS.map((faq) => (
            <div key={faq.q}>
              <p className="font-medium text-slate-100">{faq.q}</p>
              <p className="mt-1 text-slate-400">{faq.a}</p>
            </div>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="Status">
        <p>
          If QuantChat is unreachable for everyone, the problem is on our side —
          check back shortly. Your encrypted data on your devices is unaffected
          by service outages.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
