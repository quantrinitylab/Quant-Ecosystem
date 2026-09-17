'use client';

import Link from 'next/link';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';

export default function PrivacyPolicyPage() {
  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page privacy-workspace flex h-full flex-col overflow-hidden bg-[var(--quant-background)]">
        {/* Page Header */}
        <header className="shrink-0 border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 pb-4 pt-6 sm:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] text-[var(--brand-primary)]">
                  <svg
                    className="size-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-[var(--quant-foreground)] sm:text-2xl">
                    Privacy Policy &amp; Google Play Data Safety
                  </h1>
                  <p className="text-xs text-[var(--quant-muted-foreground)] mt-0.5">
                    Quant Sovereign Ecosystem · Official Play Store Production Disclosure
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                  Google Play Certified
                </span>
                <span className="rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-1 text-xs font-mono text-[var(--quant-muted-foreground)]">
                  Effective: September 2026 · v1.0.0
                </span>
              </div>
            </div>

            {/* Quick Stat Badges */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[var(--quant-border-subtle)]">
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
                <div className="text-[11px] font-medium text-[var(--quant-muted-foreground)]">
                  Third-Party Ads
                </div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">Zero (0) Ads</div>
              </div>
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
                <div className="text-[11px] font-medium text-[var(--quant-muted-foreground)]">
                  Data Encryption
                </div>
                <div className="text-sm font-bold text-[var(--brand-primary)] mt-0.5">
                  TLS 1.3 &amp; AES-GCM
                </div>
              </div>
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
                <div className="text-[11px] font-medium text-[var(--quant-muted-foreground)]">
                  Data Sharing
                </div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">No External Sharing</div>
              </div>
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
                <div className="text-[11px] font-medium text-[var(--quant-muted-foreground)]">
                  Account Deletion
                </div>
                <div className="text-sm font-bold text-[var(--quant-foreground)] mt-0.5">
                  Self-Service Purge
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Policy Content Body */}
        <div className="mx-auto w-full max-w-4xl flex-1 space-y-8 overflow-y-auto px-4 py-8 sm:px-8 text-sm text-[var(--quant-foreground)]">
          {/* Section 1: Overview */}
          <section className="space-y-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
            <h2 className="text-base font-semibold text-[var(--quant-foreground)] flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-primary)]">
                1
              </span>
              Sovereign Privacy Commitment
            </h2>
            <p className="text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
              QuantMail (provided by Quantrinity as part of the Quant Sovereign Ecosystem) is
              engineered on fundamental cryptographic privacy and data autonomy principles. Unlike
              ad-driven email providers, QuantMail does not read, index, parse, or monetize your
              inbox to serve behavioral advertisements or profile you. Your communication data
              belongs exclusively to you.
            </p>
          </section>

          {/* Section 2: Google Play Data Safety Matrix */}
          <section className="space-y-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-semibold text-[var(--quant-foreground)] flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-primary)]">
                  2
                </span>
                Google Play Data Safety Disclosure Matrix
              </h2>
              <span className="text-[11px] font-mono text-[var(--brand-primary)]">
                Target SDK 35 (Android 15) Compliant
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
              In accordance with Google Play Developer Policy and Data Safety requirements, the
              table below enumerates all data collected, purpose of collection, transfer mechanisms,
              and sharing boundaries:
            </p>

            <div className="overflow-x-auto rounded-xl border border-[var(--quant-border)]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)]">
                    <th className="p-3 font-semibold">Data Category</th>
                    <th className="p-3 font-semibold">Specific Fields</th>
                    <th className="p-3 font-semibold">Purpose</th>
                    <th className="p-3 font-semibold">Shared with 3rd Parties?</th>
                    <th className="p-3 font-semibold">Encryption Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--quant-border-subtle)] text-[var(--quant-muted-foreground)]">
                  <tr>
                    <td className="p-3 font-medium text-[var(--quant-foreground)]">
                      Personal Info
                    </td>
                    <td className="p-3">Email address, Display name, Account identifier</td>
                    <td className="p-3">Account creation, login authentication, mail routing</td>
                    <td className="p-3 text-emerald-400 font-semibold">Never Shared</td>
                    <td className="p-3">TLS 1.3 in transit · AES-256 at rest</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-[var(--quant-foreground)]">Messages</td>
                    <td className="p-3">Emails, subjects, message body, attachments, drafts</td>
                    <td className="p-3">
                      Core App functionality: sending, receiving, and displaying mail
                    </td>
                    <td className="p-3 text-emerald-400 font-semibold">Never Shared</td>
                    <td className="p-3">TLS 1.3 in transit · AES-256-GCM at rest</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-[var(--quant-foreground)]">Contacts</td>
                    <td className="p-3">Address book entries (name, email addresses, labels)</td>
                    <td className="p-3">Recipient autocomplete, contact card synchronization</td>
                    <td className="p-3 text-emerald-400 font-semibold">Never Shared</td>
                    <td className="p-3">TLS 1.3 in transit · AES-256-GCM at rest</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-[var(--quant-foreground)]">
                      App Performance &amp; Logs
                    </td>
                    <td className="p-3">Crash diagnostics, delivery latency timestamps</td>
                    <td className="p-3">Reliability monitoring, network reconnection telemetry</td>
                    <td className="p-3 text-emerald-400 font-semibold">Never Shared</td>
                    <td className="p-3">Ephemeral, anonymized, scrubbed within 7 days</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-[var(--quant-foreground)]">
                      Security &amp; Device Tokens
                    </td>
                    <td className="p-3">Session refresh tokens, FCM push notification token</td>
                    <td className="p-3">
                      Authenticating device session and waking app for incoming mail
                    </td>
                    <td className="p-3 text-emerald-400 font-semibold">Never Shared</td>
                    <td className="p-3">
                      HttpOnly secure cookies &amp; cryptographic token rotation
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Zero Advertising */}
          <section className="space-y-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
            <h2 className="text-base font-semibold text-[var(--quant-foreground)] flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-primary)]">
                3
              </span>
              Strict Zero Third-Party Advertising Policy
            </h2>
            <div className="space-y-2 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
              <p>
                <strong className="text-[var(--quant-foreground)]">No Tracking SDKs:</strong> The
                QuantMail Android application (`com.quant.app`) and web platform contain zero
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
                demographic profiles.
              </p>
            </div>
          </section>

          {/* Section 4: Cryptographic Security Protocols */}
          <section className="space-y-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
            <h2 className="text-base font-semibold text-[var(--quant-foreground)] flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-primary)]">
                4
              </span>
              Technical Security Protocols &amp; Android Sandbox Hardening
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-4 space-y-2">
                <div className="font-semibold text-xs text-[var(--brand-primary)]">
                  Encryption in Transit (TLS 1.3)
                </div>
                <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                  All network communication is strictly over HTTPS utilizing modern TLS 1.3 with
                  Perfect Forward Secrecy. In `AndroidManifest.xml`,{' '}
                  <code className="text-[11px] font-mono text-[var(--brand-primary)]">
                    usesCleartextTraffic
                  </code>{' '}
                  is permanently disabled (`false`), rejecting unencrypted HTTP connections
                  entirely.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-4 space-y-2">
                <div className="font-semibold text-xs text-[var(--brand-primary)]">
                  Encryption at Rest (AES-256-GCM)
                </div>
                <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                  Mailbox databases, message attachments, and contact books are persisted with
                  authenticated AES-256-GCM encryption. Cryptographic keys are isolated and rotated
                  according to NIST SP 800-57 guidelines.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-4 space-y-2">
                <div className="font-semibold text-xs text-[var(--brand-primary)]">
                  Android WebView Sandbox Hardening
                </div>
                <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                  Mobile WebSettings are hardened with{' '}
                  <code className="text-[11px] font-mono">MIXED_CONTENT_NEVER_ALLOW</code>,
                  disabling file scheme access (
                  <code className="text-[11px] font-mono">allowFileAccess = false</code>) and
                  content provider exposure (
                  <code className="text-[11px] font-mono">allowContentAccess = false</code>).
                </p>
              </div>

              <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-4 space-y-2">
                <div className="font-semibold text-xs text-[var(--brand-primary)]">
                  Secure OAuth via Chrome Custom Tabs
                </div>
                <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                  External authentication providers (Google, GitHub, Apple) are intercepted in{' '}
                  <code className="text-[11px] font-mono">shouldOverrideUrlLoading</code> and
                  launched within isolated{' '}
                  <code className="text-[11px] font-mono">CustomTabsIntent</code> windows,
                  preventing credential exposure and eliminating Google&apos;s{' '}
                  <code className="text-[11px] font-mono">disallowed_useragent</code> restriction.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5: Data Retention */}
          <section className="space-y-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
            <h2 className="text-base font-semibold text-[var(--quant-foreground)] flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-primary)]">
                5
              </span>
              Data Retention &amp; Automatic Purge Schedules
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
              <li>
                <strong className="text-[var(--quant-foreground)]">Active Mailbox Records:</strong>{' '}
                Retained for the lifetime of the user account until manually deleted or until
                account termination is triggered.
              </li>
              <li>
                <strong className="text-[var(--quant-foreground)]">
                  Trash &amp; Spam Folders:
                </strong>{' '}
                Items moved to Trash or Spam are automatically and irrevocably purged after 30 days.
              </li>
              <li>
                <strong className="text-[var(--quant-foreground)]">
                  Telemetry &amp; Audit Logs:
                </strong>{' '}
                Access logs, session handshake records, and diagnostic metrics are scrubbed and
                permanently destroyed within 30 days.
              </li>
              <li>
                <strong className="text-[var(--quant-foreground)]">
                  Encrypted Rolling Backups:
                </strong>{' '}
                Disaster recovery snapshots are retained on an immutable 30-day rotation schedule,
                after which cryptographic shredding occurs.
              </li>
            </ul>
          </section>

          {/* Section 6: Account Deletion Instructions */}
          <section className="space-y-4 rounded-2xl border border-red-500/30 bg-red-950/10 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-red-400 flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-400">
                  6
                </span>
                Account &amp; Data Deletion Instructions
              </h2>
              <Link
                href="/settings/account"
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors shadow-sm"
              >
                Go to Account Deletion (/settings/account) →
              </Link>
            </div>

            <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
              In accordance with Google Play&apos;s Account Deletion Requirement, users have the
              right to request complete eradication of their account and all associated data
              directly from within the app and via the web:
            </p>

            <div className="rounded-xl border border-red-500/20 bg-[#090A0C] p-4 space-y-3">
              <div className="text-xs font-semibold text-[var(--quant-foreground)]">
                Step-by-Step Deletion Process:
              </div>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                <li>
                  Open the app and navigate to{' '}
                  <strong className="text-[var(--quant-foreground)]">Settings</strong> via the
                  navigation bar or visit{' '}
                  <Link href="/settings/account" className="text-[var(--brand-primary)] underline">
                    https://quantmail.in/settings/account
                  </Link>
                  .
                </li>
                <li>
                  Select{' '}
                  <strong className="text-[var(--quant-foreground)]">
                    Security &amp; Encryption
                  </strong>{' '}
                  or click{' '}
                  <strong className="text-[var(--quant-foreground)]">
                    Manage Account &amp; Deletion
                  </strong>
                  .
                </li>
                <li>
                  Review your data export options if you wish to download an encrypted backup of
                  your messages before deletion.
                </li>
                <li>
                  In the <strong className="text-red-400">Permanent Account Deletion</strong> card,
                  type{' '}
                  <code className="rounded bg-red-950/50 px-1.5 py-0.5 font-mono text-red-400 font-bold">
                    DELETE
                  </code>{' '}
                  to confirm.
                </li>
                <li>
                  Click <strong className="text-red-400">Permanently Delete My Account</strong>.
                </li>
              </ol>

              <div className="pt-2 border-t border-[var(--quant-border-subtle)] text-[11px] text-[var(--quant-muted-foreground)]">
                <strong className="text-[var(--quant-foreground)]">What happens next:</strong>{' '}
                Within 60 seconds of submission, your user credentials, mailbox records, drafts,
                folders, cryptographic keys, and contact records are queued for immediate
                destruction. All offline tokens are invalidated.
              </div>
            </div>
          </section>

          {/* Section 7: Contact Info */}
          <section className="space-y-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
            <h2 className="text-base font-semibold text-[var(--quant-foreground)] flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-primary)]">
                7
              </span>
              Contact Information &amp; Data Protection Officer
            </h2>
            <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
              If you have any questions, regulatory inquiries under GDPR / CCPA / Indian IT Rules,
              or need manual assistance with data removal, contact our dedicated security and
              privacy officers:
            </p>
            <div className="flex flex-wrap gap-4 pt-1 text-xs">
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
                <div className="font-semibold text-[var(--quant-foreground)]">
                  Privacy &amp; Data Safety
                </div>
                <a
                  href="mailto:privacy@quantmail.in"
                  className="text-[var(--brand-primary)] hover:underline mt-0.5 block"
                >
                  privacy@quantmail.in
                </a>
              </div>
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
                <div className="font-semibold text-[var(--quant-foreground)]">
                  Security &amp; Vulnerability Disclosure
                </div>
                <a
                  href="mailto:security@quantmail.in"
                  className="text-[var(--brand-primary)] hover:underline mt-0.5 block"
                >
                  security@quantmail.in
                </a>
              </div>
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
                <div className="font-semibold text-[var(--quant-foreground)]">
                  Production Web Portal
                </div>
                <a
                  href="https://quantmail.in"
                  className="text-[var(--brand-primary)] hover:underline mt-0.5 block"
                >
                  https://quantmail.in
                </a>
              </div>
            </div>
          </section>

          {/* Footer Back Link */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--quant-border)] text-xs text-[var(--quant-muted-foreground)]">
            <span>© 2026 Quantrinity Inc. All rights reserved.</span>
            <div className="flex items-center gap-4">
              <Link href="/settings" className="hover:text-[var(--quant-foreground)] underline">
                Settings
              </Link>
              <Link
                href="/settings/account"
                className="hover:text-[var(--quant-foreground)] underline"
              >
                Account Deletion
              </Link>
              <Link href="/" className="hover:text-[var(--quant-foreground)] underline">
                Return to Mail
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
