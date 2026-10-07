// ============================================================================
// QuantChat - Terms of Service (public page, see AuthGate.PUBLIC_PATHS)
// ============================================================================

import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '../../components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service — QuantChat',
  description: 'QuantChat Terms of Service.',
};

export default function TermsPage() {
  return (
    <LegalPage eyebrow="QuantChat · Legal" title="Terms of Service" updated="October 6, 2026">
      <LegalSection title="1. The service">
        <p>
          QuantChat is a messaging service operated by Quantrinity (“we”, “us”).
          By creating an account or using QuantChat you agree to these terms.
          If you do not agree, do not use the service.
        </p>
      </LegalSection>

      <LegalSection title="2. Your account">
        <p>
          You sign in with your Quant Account (QuantMail SSO) or your user ID and
          password. You are responsible for keeping your credentials and your
          device keys safe. We may suspend accounts that violate these terms or
          applicable law.
        </p>
      </LegalSection>

      <LegalSection title="3. Acceptable use">
        <p>You agree not to use QuantChat to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>send spam, scams, phishing, or malware;</li>
          <li>harass, threaten, or abuse other people;</li>
          <li>share content that is illegal in your jurisdiction;</li>
          <li>attempt to break, probe, or overload our systems;</li>
          <li>impersonate another person or misrepresent your identity.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Your content">
        <p>
          End-to-end encryption is not enabled in QuantChat yet. Messages are
          stored on our servers in readable form so we can deliver them to you
          and the people you message. You remain responsible for what you send.
        </p>
      </LegalSection>

      <LegalSection title="5. Availability">
        <p>
          We work to keep QuantChat reliable, but the service is provided “as
          is” without warranties of any kind. We may change, suspend, or
          discontinue features at any time.
        </p>
      </LegalSection>

      <LegalSection title="6. Liability">
        <p>
          To the maximum extent permitted by law, Quantrinity is not liable for
          indirect, incidental, or consequential damages arising from your use of
          QuantChat.
        </p>
      </LegalSection>

      <LegalSection title="7. Changes to these terms">
        <p>
          We may update these terms from time to time. Continued use of QuantChat
          after changes take effect constitutes acceptance of the new terms.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>
          Questions about these terms:{' '}
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
