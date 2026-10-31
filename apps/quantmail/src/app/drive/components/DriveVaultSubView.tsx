'use client';

import { VaultShieldIcon, PadlockIcon } from './DriveIcons';

/**
 * Drive vault placeholder.
 *
 * The vault (lock-to-vault with client-side encryption) is not built yet:
 * there is no backend vault store and no lock/unlock action anywhere in the
 * app. Accepting an `items` prop would invite fabricated vault data — the
 * exact failure this surface was purged for — so this component renders only
 * the honest "not available yet" state. When real client-side encryption plus
 * a lock-to-vault action ship, reintroduce an items prop backed by the real
 * vault store.
 */
export function DriveVaultSubView() {
  return (
    <div
      id="drive-panel-vault"
      role="tabpanel"
      aria-labelledby="drive-tab-vault"
      className="space-y-6"
    >
      {/* 1. Vault Status Card */}
      <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5 shadow-[0_4px_28px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-3.5">
          <div className="size-12 rounded-xl bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] flex items-center justify-center text-[var(--app-accent)] shrink-0 shadow-[0_0_16px_color-mix(in_srgb,var(--app-accent)_50%,transparent)]">
            <VaultShieldIcon className="size-6" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC]">Vault</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              The vault is not available yet.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Honest empty state — no impossible instructions */}
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--quant-border)] bg-[var(--quant-surface)] px-6 py-12 text-center">
        <div className="size-10 rounded-xl bg-[var(--quant-background)] border border-[var(--quant-border)] flex items-center justify-center text-[#64748B]">
          <PadlockIcon className="size-5" />
        </div>
        <p className="text-sm font-semibold text-[#F8FAFC]">Vault is not available yet</p>
        <p className="text-xs text-[#94A3B8] max-w-sm">
          Locking a file into the vault needs client-side encryption first.
          Client-side encryption is not available yet, so there is no
          lock-to-vault action in Drive — your files stay in your main Drive.
        </p>
      </div>
    </div>
  );
}
