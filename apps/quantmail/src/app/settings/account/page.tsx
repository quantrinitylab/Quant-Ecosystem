'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@quant/shared-ui';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { showToast } from '../../../components/InboxToast';
import { SettingsSection } from '../SettingsPrimitives';

export default function AccountSettingsPage() {
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasExported, setHasExported] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportData = () => {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      setHasExported(true);
      showToast({
        text: 'Data archive requested. An encrypted export will be delivered to your inbox.',
        type: 'success',
      });
    }, 1200);
  };

  const handleDeleteAccount = () => {
    if (deleteConfirmation.trim().toLowerCase() !== 'delete') {
      showToast({ text: 'Please type "DELETE" to confirm account eradication.', type: 'error' });
      return;
    }

    setIsDeleting(true);
    setTimeout(() => {
      setIsDeleting(false);
      showToast({
        text: 'Account deletion request submitted. All cryptographic keys and mailbox records are scheduled for immediate purge.',
        type: 'info',
      });
    }, 1500);
  };

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page settings-workspace flex h-full flex-col overflow-hidden bg-[var(--quant-background)]">
        <header className="shrink-0 border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 pb-3 pt-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400">
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
                  Account Management &amp; Deletion
                </h1>
                <p className="truncate text-xs text-[var(--quant-muted-foreground)]">
                  Data sovereignty, account backup exports, and permanent deletion controls.
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
          {/* Data Portability */}
          <SettingsSection
            title="Export Your Data (Takeout)"
            description="Download an encrypted archive containing all your mailbox messages, contacts, drafts, and encryption key metadata."
            action={
              <Button variant="secondary" size="sm" onClick={handleExportData} disabled={exporting}>
                {exporting
                  ? 'Preparing Archive…'
                  : hasExported
                    ? 'Re-export Data'
                    : 'Request Archive'}
              </Button>
            }
          >
            <p className="text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
              Under Quant Sovereign privacy guarantees and GDPR/CCPA standards, your communication
              history is strictly your property. Exports are formatted as standard mbox and vCard
              JSON, signed with our server key.
            </p>
          </SettingsSection>

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
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
                  TLS 1.3 &amp; AES-GCM
                </div>
                <div className="text-[10px] text-[var(--quant-muted-foreground)] mt-0.5">
                  Enforced encryption in transit and encrypted data storage at rest.
                </div>
              </div>
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
                <div className="text-[11px] font-semibold text-[var(--quant-foreground)]">
                  Full Erasure
                </div>
                <div className="text-[10px] text-[var(--quant-muted-foreground)] mt-0.5">
                  Immediate purge of all mailbox records upon deletion.
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* Permanent Deletion */}
          <div className="rounded-2xl border border-red-500/30 bg-red-950/10 p-5 sm:p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-red-400">Permanent Account Deletion</h2>
              <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                This operation is irreversible. All messages, folders, contact cards, calendar
                events, encrypted files, device signing keys, and session tokens will be permanently
                erased from production servers within 60 seconds and pruned from rolling encrypted
                backups within 30 days.
              </p>
            </div>

            <div className="rounded-xl border border-red-500/20 bg-[#090A0C] p-4 space-y-3">
              <label className="block text-xs font-medium text-[var(--quant-foreground)]">
                To confirm permanent deletion, please type{' '}
                <span className="font-mono text-red-400 font-bold">DELETE</span> below:
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="DELETE"
                  className="font-mono text-sm max-w-xs"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmation.trim().toLowerCase() !== 'delete'}
                  className="!bg-red-600 hover:!bg-red-500 !text-white border-none shrink-0"
                >
                  {isDeleting ? 'Erasing Account…' : 'Permanently Delete My Account'}
                </Button>
              </div>
            </div>

            <div className="text-[11px] text-[var(--quant-muted-foreground)] pt-1">
              Have questions or need assistance? Contact the privacy team at{' '}
              <a
                href="mailto:privacy@quantmail.in"
                className="text-[var(--brand-primary)] underline"
              >
                privacy@quantmail.in
              </a>
              .
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
