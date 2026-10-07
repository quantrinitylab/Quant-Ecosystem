'use client';

// ============================================================================
// /plan — Quanty Plan / Usage screen (Muse S3 parity, PR-Q6).
//
//   - Plan card (name, % used, reset date, progress bar)
//   - Additional tokens card (% used, tokens left, never expires)
//   - Upgrade link (honest "coming soon" when no checkout URL is configured)
//   - Link rows: Connectors, Wallet, Secure credentials store, Permissions,
//     Messaging channels, Devices, Notifications
// ============================================================================

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '../../lib/auth';
import PlanCards from '../../components/plan/PlanCards';
import PlanSection from '../../components/plan/PlanSection';
import WalletSection from '../../components/plan/WalletSection';
import CredentialsSection from '../../components/plan/CredentialsSection';
import PermissionsSection from '../../components/plan/PermissionsSection';
import MessagingChannelsSection from '../../components/plan/MessagingChannelsSection';
import DevicesSection from '../../components/plan/DevicesSection';
import NotificationsSection from '../../components/plan/NotificationsSection';
import type { PlanSummaryData } from '../../components/plan/types';
import { apiFetchRaw } from '@quant/api-client';

const DEFAULT_PLAN: PlanSummaryData = {
  configured: false,
  plan: { name: 'Free plan', tier: 'free', percentUsed: 0, resetsAt: null },
  tokens: { percentUsed: 0, remaining: 0, granted: 0, expiresAt: null },
  upgradeUrl: null,
};

export default function PlanPage() {
  const [plan, setPlan] = useState<PlanSummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetchRaw('/api/quanty/plan', { headers: getAuthHeaders() })
      .then(async (r) => {
        const j = await r.json();
        if (!cancelled) {
          if (j.success) setPlan(j.data);
          else setError(j.error?.message ?? 'Could not load plan');
        }
      })
      .catch(() => !cancelled && setError('Could not load plan'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-[560px]">
        <header className="mb-5 flex items-center gap-3">
          <Link href="/" aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1C1C1E] text-[20px] text-white/80">
            ‹
          </Link>
          <h1 className="flex-1 text-center text-[20px] font-semibold">Plan</h1>
          <span className="w-10" aria-hidden="true" />
        </header>

        {error && (
          <div className="mb-4 rounded-3xl bg-[#1C1C1E] p-5">
            <p className="text-[14px] text-[#FF453A]">{error}</p>
            <p className="mt-1 text-[13px] text-white/50">Showing plan defaults.</p>
          </div>
        )}

        <PlanCards plan={plan ?? DEFAULT_PLAN} />

        <div className="mt-4 flex flex-col gap-3">
          <PlanSection icon="🧩" title="Connectors" subtitle="Apps and services Quanty can use" badge="Soon">
            <p className="text-[14px] text-white/50">
              The Connectors screen is coming soon. It will list connected and available
              integrations with per-connector connect, test, and disconnect.
            </p>
          </PlanSection>

          <PlanSection icon="👛" title="Wallet" subtitle="Quant Credits balance and history">
            <WalletSection />
          </PlanSection>

          <PlanSection icon="🔐" title="Secure credentials store" subtitle="Connected accounts — values never shown">
            <CredentialsSection />
          </PlanSection>

          <PlanSection icon="✋" title="Permissions" subtitle="What Quanty may do on your behalf">
            <PermissionsSection />
          </PlanSection>

          <PlanSection icon="💬" title="Messaging channels" subtitle="Reach Quanty on your messaging apps">
            <MessagingChannelsSection />
          </PlanSection>

          <PlanSection icon="📱" title="Devices" subtitle="Devices linked to this account">
            <DevicesSection />
          </PlanSection>

          <PlanSection icon="🔔" title="Notifications" subtitle="Quiet hours and channel preferences">
            <NotificationsSection />
          </PlanSection>
        </div>
      </div>
    </main>
  );
}
