'use client';

import Link from 'next/link';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { SettingsSection } from '../SettingsPrimitives';
import { DataExportSettings } from './DataExportSettings';

export default function AccountSettingsPage() {
  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page settings-workspace flex h-full flex-col overflow-hidden bg-[var(--quant-background)]">
        <header className="shrink-0 border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 pb-3 pt-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] text-[var(--quant-foreground)]">
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--quant-foreground)] sm:text-xl">
                  Account Management
                </h1>
                <p className="truncate text-xs text-[var(--quant-muted-foreground)]">
                  Privacy and data controls for your QuantMail account.
                </p>
              </div>
            </div>

            <Link
              href="/settings"
              className="text-xs text-[var(--brand-primary)] hover:underline flex items-center gap-1"
            >
              ← Back to Settings
            </Link>
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-8">
          {/* Privacy & Safety Overview Link */}
          <SettingsSection
            title="Google Play Data Safety &amp; Disclosures"
            description="Review complete transparency documentation regarding collected data types, zero third-party advertising, and transit encryption."
            action={
              <Link
                href="/privacy"
                className="inline-flex items-center justify-center rounded-lg border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:bg-[var(--brand-primary)] hover:text-black transition-colors"
              >
                Read Privacy Policy →
              </Link>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
                <div className="text-[11px] font-semibold text-[var(--quant-foreground)]">
                  Zero Ads
                </div>
                <div className="text-[10px] text-[var(--quant-muted-foreground)] mt-0.5">
                  No advertising SDKs, data brokers, or profiling trackers.
                </div>
              </div>
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
                <div className="text-[11px] font-semibold text-[var(--quant-foreground)]">
                  TLS 1.2+ &amp; AES-256
                </div>
                <div className="text-[10px] text-[var(--quant-muted-foreground)] mt-0.5">
                  Enforced encryption in transit and encrypted data storage at rest.
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* Data export — wired to the QM-BACK-006 export center (QM-UIUX-091) */}
          <DataExportSettings />
        </div>
      </div>
    </AppShell>
  );
}
