'use client';

import React from 'react';
import { formatBytes } from '../../../lib/format-bytes';
import { VaultShieldIcon, PadlockIcon } from './DriveIcons';

export interface EncryptedVaultItem {
  id: string;
  name: string;
  cipherSize: number;
  cipherAlgorithm: string;
  sha256Checksum: string;
  encryptedAt: string;
}

export interface DriveVaultSubViewProps {
  items?: EncryptedVaultItem[];
}

/**
 * Drive Vault tab.
 *
 * Honesty contract: there is no client-side encryption pipeline in QuantMail
 * yet, so this surface must not render fake encrypted-file cards, fake
 * checksums, or cipher-suite badges the UI cannot verify. The status card
 * admits encryption is not available; the empty state no longer instructs
 * users to perform a "lock a file" action that does not exist anywhere —
 * it says plainly that the action is not available yet.
 */
export function DriveVaultSubView({ items = [] }: DriveVaultSubViewProps) {
  return (
    <div
      id="drive-panel-vault"
      role="tabpanel"
      aria-labelledby="drive-tab-vault"
      className="space-y-6"
    >
      {/* 1. Vault Status Card — honest: no crypto claims, admits the gap. */}
      <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5 shadow-[0_4px_28px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-3.5">
          <div className="size-12 rounded-xl bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] flex items-center justify-center text-[var(--app-accent)] shrink-0 shadow-[0_0_16px_color-mix(in_srgb,var(--app-accent)_50%,transparent)]">
            <VaultShieldIcon className="size-6" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC]">Vault</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Lock files here to keep them separate from your main Drive.
              Client-side encryption is not available yet.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Vault Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
            Vault Items ({items.length})
          </h4>
        </div>

        {items.length === 0 ? (
          /* Honest empty state: no impossible instructions. Locking a file
             into the vault is not wired up, and the surface says so. */
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--quant-border)] bg-[var(--quant-surface)] px-6 py-12 text-center">
            <div className="size-10 rounded-xl bg-[var(--quant-background)] border border-[var(--quant-border)] flex items-center justify-center text-[#64748B]">
              <PadlockIcon className="size-5" />
            </div>
            <p className="text-sm font-semibold text-[#F8FAFC]">No vault items yet</p>
            <p className="text-xs text-[#94A3B8] max-w-sm">
              Locking a file into your vault isn&apos;t available yet — client-side
              encryption hasn&apos;t shipped, so there&apos;s no way to lock a
              file right now. This will come alive when the vault pipeline lands.
            </p>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Locking files into the vault is not available yet"
              className="mt-2 px-4 py-2 rounded-xl bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_25%,transparent)] text-xs font-bold text-[var(--app-accent)] opacity-50 cursor-not-allowed focus-visible:outline-none"
            >
              Lock a file — not available yet
            </button>
          </div>
        ) : (
          /* Real items render as plain metadata only. Cipher details are the
             backend's claims, not the UI's — the surface stays free of
             unverifiable security theatre. */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] transition-all space-y-1"
              >
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-lg bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] flex items-center justify-center text-[var(--app-accent)] shrink-0">
                    <PadlockIcon className="size-4" />
                  </div>
                  <p className="text-xs font-bold text-[#F8FAFC] truncate">{item.name}</p>
                </div>
                <p className="text-[11px] text-[#94A3B8]">
                  {formatBytes(item.cipherSize)} · Added{' '}
                  {new Date(item.encryptedAt).toLocaleDateString()}
                </p>
                {/* The item's own cipher field, rendered verbatim as neutral
                    metadata — no verified-security claims attached. */}
                <p
                  className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]"
                  aria-label={`Cipher: ${item.cipherAlgorithm}`}
                >
                  {item.cipherAlgorithm}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
