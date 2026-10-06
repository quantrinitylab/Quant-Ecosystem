// ============================================================================
// QuantChat - Privacy Policy (public page, see AuthGate.PUBLIC_PATHS)
// ============================================================================

import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '../../components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy — QuantChat',
  description: 'QuantChat Privacy Policy.',
};

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="QuantChat · Legal" title="Privacy Policy" updated="October 6, 2026">
      <LegalSection title="1. What we collect">
        <p>
          We collect the minimum needed to run QuantChat: your account identifier
          (QuantMail identity or user ID), device keys for encryption, and basic
          operational data (e.g. delivery state, crash diagnostics).{' '}
          <strong className="text-slate-100">
            We never collect or store your message content.
          </strong>
        </p>
      </LegalSection>

      <LegalSection title="2. End-to-end encryption">
        <p>
          Messages, calls, and media are end-to-end encrypted. Encryption keys
          live on your devices; our servers relay only ciphertext and cannot
          read your conversations.
        </p>
      </LegalSection>

      <LegalSection title="3. Metadata">
        <p>
          To deliver messages we necessarily process limited metadata — such as
          who messaged whom and when. We do not sell metadata, and we do not
          use it for advertising.
        </p>
      </LegalSection>

      <LegalSection title="4. How we use data">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>to provide, secure, and improve QuantChat;</li>
          <li>to prevent abuse, spam, and fraud;</li>
          <li>to comply with legal obligations.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Sharing">
        <p>
          We do not sell your personal data. We share it only with infrastructure
          providers bound by contract to process it on our behalf, or when
          required by law.
        </p>
      </LegalSection>

      <LegalSection title="6. Retention and deletion">
        <p>
          Account data is kept while your account is active. You can request
          deletion of your account and associated data at any time via Support —
          encrypted message content on your own devices is yours to delete.
        </p>
      </LegalSection>

      <LegalSection title="7. Your rights">
        <p>
          Depending on where you live you may have the right to access, correct,
          or delete your personal data, or to object to certain processing.
          Contact us and we will respond.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes">
        <p>
          We may update this policy; material changes will be announced in-app.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact">
        <p>
          Privacy questions:{' '}
          <a
            href="mailto:support@quantrinity.in"
            className="text-emerald-400 hover:text-emerald-300"
          >
            support@quantrinity.in
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
