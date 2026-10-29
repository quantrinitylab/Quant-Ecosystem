'use client';

import Link from 'next/link';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';

/**
 * Standalone public legal page (mirrors /terms): no AppShell, no AppSidebar,
 * no inbox chrome for signed-out visitors. Pure-black, no divider lines,
 * Mail orange accents. Copy 2026-10-13: §1's absolute "does not read, index,
 * parse" wording was qualified — AI triage genuinely sends the content of the
 * messages you select to the AI provider (backend/services/ai-triage.service.ts
 * → @quant/ai AIEngine.infer → routed model provider) — so the policy now
 * discloses that processing honestly in §3A instead of contradicting the
 * "AI triage" promise on /login and /register.
 */
export default function PrivacyPolicyPage() {
  return (
    <AuthShell
      brand={
        <AuthBrandPanel
          eyebrow="Legal"
          title="Privacy Policy."
          subtitle="How QuantMail handles your data."
        />
      }
    >
      <div>
        <div className="mb-8">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
            Legal
          </p>
          <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--quant-foreground)] sm:text-[30px]">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
            Last updated October 2026.
          </p>
        </div>

        <div className="space-y-8">
          {/* At-a-glance */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
              At a glance
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-medium text-[var(--quant-muted-foreground)]">
                  Third-Party Ads
                </div>
                <div className="mt-0.5 text-sm font-bold text-[var(--brand-primary)]">
                  Zero (0) Ads
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[var(--quant-muted-foreground)]">
                  Data Encryption
                </div>
                <div className="mt-0.5 text-sm font-bold text-[var(--brand-primary)]">
                  TLS 1.3 in transit
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[var(--quant-muted-foreground)]">
                  Third-Party Data Sharing
                </div>
                <div className="mt-0.5 text-sm font-bold text-[var(--brand-primary)]">
                  Mail delivery only (AWS SES)
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[var(--quant-muted-foreground)]">
                  Account Deletion
                </div>
                <div className="mt-0.5 text-sm font-bold text-[var(--quant-foreground)]">
                  <a
                    href="mailto:privacy@quantmail.in"
                    className="text-[var(--brand-primary)] underline-offset-4 hover:underline"
                  >
                    Contact Support
                  </a>
                </div>
              </div>
            </div>
          </section>

          <p className="text-sm leading-6 text-[var(--quant-muted-foreground)]">
            To request deletion of your account and data, email privacy@quantmail.in from your
            account email. Deletion is handled manually by our privacy team — there is currently no
            self-service deletion flow in the app.
          </p>

          {/* Section 1: Overview */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
              1. Sovereign Privacy Commitment
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              QuantMail (provided by Quantrinity as part of the Quant Sovereign Ecosystem) is
              engineered on fundamental cryptographic privacy and data autonomy principles. Unlike
              ad-driven email providers, QuantMail does not read, index, parse, or monetize your
              inbox to serve behavioral advertisements or profile you. The one exception is AI
              features you explicitly invoke: when you ask Quant AI to triage, summarize, or draft
              a reply, the content of the messages you select is processed to perform exactly
              that task (see §3A). Your communication data belongs exclusively to you.
            </p>
          </section>

          {/* Section 2: Data Disclosure Matrix */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
              2. Data Disclosure Matrix
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              The table below lists the data QuantMail collects, the purpose of collection, and
              how that data is shared and protected:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[var(--quant-muted-foreground)]">
                    <th className="py-2 pr-4 font-semibold">Data Category</th>
                    <th className="py-2 pr-4 font-semibold">Specific Fields</th>
                    <th className="py-2 pr-4 font-semibold">Purpose</th>
                    <th className="py-2 pr-4 font-semibold">Shared with 3rd Parties?</th>
                    <th className="py-2 font-semibold">Encryption Status</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--quant-muted-foreground)]">
                  <tr>
                    <td className="py-2 pr-4 font-medium text-[var(--quant-foreground)]">
                      Personal Info
                    </td>
                    <td className="py-2 pr-4">Email address, Display name, Account identifier</td>
                    <td className="py-2 pr-4">Account creation, login authentication, mail routing</td>
                    <td className="py-2 pr-4 font-semibold text-[var(--brand-primary)]">
                      Never Shared
                    </td>
                    <td className="py-2">TLS 1.3 in transit</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium text-[var(--quant-foreground)]">Messages</td>
                    <td className="py-2 pr-4">Emails, subjects, message body, attachments, drafts</td>
                    <td className="py-2 pr-4">
                      Core App functionality: sending, receiving, and displaying mail — plus AI
                      triage and reply drafting, but only for the messages you explicitly ask AI
                      to handle (see §3A)
                    </td>
                    {/* Never Shared is dishonest here: outbound mail passes through
                        AWS SES (backend/lib/ses-sender.ts, SESv2 SendEmail), which by
                        construction handles message content to deliver it. */}
                    <td className="py-2 pr-4">
                      AWS SES (mail delivery)
                    </td>
                    <td className="py-2">TLS 1.3 in transit</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium text-[var(--quant-foreground)]">Contacts</td>
                    <td className="py-2 pr-4">Address book entries (name, email addresses, labels)</td>
                    <td className="py-2 pr-4">Recipient autocomplete, contact card synchronization</td>
                    <td className="py-2 pr-4 font-semibold text-[var(--brand-primary)]">
                      Never Shared
                    </td>
                    <td className="py-2">TLS 1.3 in transit</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium text-[var(--quant-foreground)]">
                      App Performance &amp; Logs
                    </td>
                    <td className="py-2 pr-4">Crash diagnostics, delivery latency timestamps</td>
                    <td className="py-2 pr-4">Reliability monitoring, network reconnection telemetry</td>
                    <td className="py-2 pr-4 font-semibold text-[var(--brand-primary)]">
                      Never Shared
                    </td>
                    <td className="py-2">Retained only while needed for reliability monitoring</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium text-[var(--quant-foreground)]">
                      Security &amp; Device Tokens
                    </td>
                    <td className="py-2 pr-4">Session refresh tokens, FCM push notification token</td>
                    <td className="py-2 pr-4">
                      Authenticating device session and waking app for incoming mail
                    </td>
                    <td className="py-2 pr-4 font-semibold text-[var(--brand-primary)]">
                      Never Shared
                    </td>
                    <td className="py-2">
                      HttpOnly secure cookies &amp; cryptographic token rotation
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--quant-muted-foreground)]">
              Processor disclosure: outbound mail passes through AWS SES — our
              mail-delivery pipeline — which by construction handles message
              content in order to hand it to the recipient&apos;s provider.
            </p>
          </section>

          {/* Section 3: Zero Advertising */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
              3. Strict Zero Third-Party Advertising Policy
            </h2>
            <div className="mt-2 space-y-3 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              <p>
                <strong className="text-[var(--quant-foreground)]">No Tracking SDKs:</strong> The
                QuantMail Android application (`com.quant.mail`) and web platform contain zero
                third-party advertising SDKs, zero Google AdMob binaries, zero Meta Audience Network
                libraries, and zero data broker trackers.
              </p>
              <p>
                <strong className="text-[var(--quant-foreground)]">
                  No Sale of Personal Data:
                </strong>{' '}
                We have never sold, rented, traded, or leased customer personal data or
                communications, and will never do so under any circumstances.
              </p>
              <p>
                <strong className="text-[var(--quant-foreground)]">No Behavioral Profiling:</strong>{' '}
                We do not scan message contents or recipient graphs to build behavioral or
                demographic profiles. This covers profiling only — content you explicitly
                hand to an AI feature (see §3A) is processed to perform that task and
                nothing else.
              </p>
            </div>
          </section>

          {/* Section 3A: AI features the user explicitly invokes.
              Copy-honesty note (2026-10-13): AI triage genuinely reads message
              contents server-side — backend/services/ai-triage.service.ts passes
              From/Subject/Body verbatim into @quant/ai's AIEngine.infer, which
              routes to a model provider (default model muse-spark-1.3 → 'meta'
              provider, packages/ai/src/core/model-router.ts). It is NOT
              on-device/local, and it is NOT profile-building — both halves of
              that claim are wired in the code, so the wording below states
              exactly that. */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
              3A. AI Features You Explicitly Invoke
            </h2>
            <div className="mt-2 space-y-3 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              <p>
                When you use Quant AI to triage your inbox, summarize a message, or draft a
                reply, the content of the messages you select — sender, subject, and body —
                is sent to the AI provider that powers the feature, solely to perform the
                task you asked for.
              </p>
              <p>
                Content processed this way is never used for advertising, never sold, and
                never used to build behavioral or demographic profiles of you. No AI
                feature reads your inbox on its own: processing happens only when you
                invoke it.
              </p>
            </div>
          </section>

          {/* Section 4: Cryptographic Security Protocols */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
              4. Technical Security Protocols
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-[var(--brand-primary)]">
                  Encryption in Transit (TLS 1.3)
                </div>
                <p className="mt-1 text-sm leading-6 text-[var(--quant-muted-foreground)]">
                  All network communication is strictly over HTTPS utilizing modern TLS 1.3 with
                  Perfect Forward Secrecy.
                </p>
              </div>

              <div>
                <div className="text-sm font-semibold text-[var(--brand-primary)]">
                  Encryption at Rest (rolling out)
                </div>
                <p className="mt-1 text-sm leading-6 text-[var(--quant-muted-foreground)]">
                  Database encryption at rest is configured in our infrastructure templates, but it
                  is not yet enabled on the live database — so we do not claim it here. This section
                  will be updated once the rollout is complete and verified.
                </p>
              </div>

              {/* WebView hardening claims removed 2026-10-12: the Android manifest
                  contains no WebView mixed-content or file-access settings, and no
                  such settings were found in the Flutter app — do not re-add
                  without a verified source. */}

              {/* Custom Tabs OAuth claims removed 2026-10-12: no
                  shouldOverrideUrlLoading / CustomTabsIntent usage exists in the
                  Flutter app — do not re-add without a verified source. */}
            </div>
          </section>

          {/* Section 5: Data Retention */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
              5. Data Retention
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              <li>
                <strong className="text-[var(--quant-foreground)]">Active Mailbox Records:</strong>{' '}
                Retained for the lifetime of the user account until manually deleted or until
                account termination is triggered.
              </li>
              <li>
                <strong className="text-[var(--quant-foreground)]">
                  Trash &amp; Spam Folders:
                </strong>{' '}
                Items moved to Trash or Spam stay there until you delete them permanently or
                delete your account. No automatic purge schedule is currently in effect for
                mailbox Trash or Spam.
              </li>
              <li>
                <strong className="text-[var(--quant-foreground)]">
                  Telemetry &amp; Audit Logs:
                </strong>{' '}
                Access logs, session handshake records, and diagnostic metrics are retained
                only while needed to operate and secure the service. No fixed scrubbing or
                destruction schedule is currently published for them.
              </li>
              <li>
                <strong className="text-[var(--quant-foreground)]">Rolling Backups:</strong>{' '}
                Disaster-recovery database snapshots are kept for recovery purposes and pruned
                as newer snapshots replace them under the applicable retention policy. No fixed
                rotation period is currently published.
              </li>
            </ul>
          </section>

          {/* Section 6: Contact Info */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
              6. Contact Information &amp; Data Protection Officer
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              If you have any questions, regulatory inquiries under GDPR / CCPA / Indian IT Rules,
              or need manual assistance with data removal, contact our dedicated security and
              privacy officers:
            </p>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className="font-semibold text-[var(--quant-foreground)]">
                  Privacy &amp; Data Safety
                </div>
                <a
                  href="mailto:privacy@quantmail.in"
                  className="mt-0.5 block text-[var(--brand-primary)] hover:underline"
                >
                  privacy@quantmail.in
                </a>
              </div>
              <div>
                <div className="font-semibold text-[var(--quant-foreground)]">
                  Security &amp; Vulnerability Disclosure
                </div>
                <a
                  href="mailto:security@quantmail.in"
                  className="mt-0.5 block text-[var(--brand-primary)] hover:underline"
                >
                  security@quantmail.in
                </a>
              </div>
              <div>
                <div className="font-semibold text-[var(--quant-foreground)]">
                  Production Web Portal
                </div>
                <a
                  href="https://quantmail.in"
                  className="mt-0.5 block text-[var(--brand-primary)] hover:underline"
                >
                  https://quantmail.in
                </a>
              </div>
            </div>
          </section>
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
  );
}
