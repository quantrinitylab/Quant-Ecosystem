// ============================================================================
// QuantCooks Studio — Account page (route: /account, checklist #65–#67)
//
// Thin wiring, the established pattern: this page owns the real reads and
// hands view-ready state to the components.
//  - Session: useAuth (the only identity surface the client has) →
//    signed-in state + the real logout for the Profile panel.
//  - Usage: the caller's EffectCraft renders via the real
//    apiClient.listCraftRenders read (C-2). Export jobs are merged
//    through the same account.ts shape with an empty list today: the
//    backend has a per-project export list (GET /export/project/:id)
//    but no client method or proxy reaches it yet — wiring that read is
//    a named follow-up, and the Usage panel states it on the surface.
//  - Brand Defaults: the caller's real brand kits via useBrandKit.
//  - Credits & ledger history (CP-2): the real tool reads —
//    invokeTool(get_credit_balance) and invokeTool(list_credit_history)
//    through the account.ts envelope mappers. A CREDITS_NOT_CONFIGURED
//    refusal renders the panels' not-configured states; a success
//    renders the ledger's real numbers; any other failure renders its
//    real message. retry: false on both — a refusal is a state to show,
//    not a transient to retry past.
//
// Shell note: StudioShell's STUDIO_NAV "credits" entry is the last one
// still marked in build (href: null). This page makes /account real when
// navigated to directly (the CreditsPill's Account destination); flipping
// the credits entry to href: '/account' is a named follow-up for the
// shared-file batch that also adds this unit's studio-account-* CSS.
// ============================================================================

import React from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { StudioShell } from '../components/studio/StudioShell';
import { AccountShell, type BrandKitLite } from '../components/studio/AccountShell';
import { CreditsPanel } from '../components/studio/CreditsPanel';
import {
  UsagePanel,
  type UsageActivityState,
  type UsageLedgerState,
} from '../components/studio/UsagePanel';
import { useAuth } from '../providers/auth-provider';
import { useBrandKit } from '../hooks/useBrandKit';
import { apiClient } from '../services/api-client';
import {
  CREDIT_TOOLS,
  connectionFromBalanceInvoke,
  historyFromHistoryInvoke,
  isAccountPanelId,
  mergeActivity,
  type LedgerConnection,
} from '../lib/studio/account';

export default function AccountPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const brandKit = useBrandKit();

  const craftQuery = useQuery({
    queryKey: ['account', 'craft-renders'],
    queryFn: async () => {
      const response = await apiClient.listCraftRenders();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load job activity');
      }
      return response.data ?? [];
    },
  });

  const balanceQuery = useQuery({
    queryKey: ['account', 'credit-balance'],
    retry: false,
    queryFn: () => apiClient.invokeTool(CREDIT_TOOLS.balance, { params: {} }),
  });

  const historyQuery = useQuery({
    queryKey: ['account', 'credit-history'],
    retry: false,
    queryFn: () => apiClient.invokeTool(CREDIT_TOOLS.history, { params: {} }),
  });

  const connection: LedgerConnection = balanceQuery.isError
    ? {
        status: 'error',
        code: 'REQUEST_FAILED',
        message:
          balanceQuery.error instanceof Error
            ? balanceQuery.error.message
            : 'The balance request failed.',
      }
    : balanceQuery.isLoading || !balanceQuery.data
      ? { status: 'loading' }
      : connectionFromBalanceInvoke(balanceQuery.data);

  const history = historyQuery.data ? historyFromHistoryInvoke(historyQuery.data) : null;
  const ledgerState: UsageLedgerState = historyQuery.isError
    ? 'error'
    : historyQuery.isLoading || !history
      ? 'loading'
      : history.state === 'ready'
        ? 'ready'
        : history.state;
  const ledgerError =
    history?.state === 'error'
      ? history.message
      : historyQuery.isError
        ? historyQuery.error instanceof Error
          ? historyQuery.error.message
          : 'The ledger history request failed.'
        : null;

  const activityState: UsageActivityState = craftQuery.isLoading
    ? 'loading'
    : craftQuery.isError
      ? 'error'
      : 'ready';
  // Export jobs join via mergeActivity's first argument once a client
  // list read exists (follow-up above); today the real craft list is it.
  const rows = mergeActivity([], craftQuery.data ?? []);

  const brandKits: BrandKitLite[] = (brandKit.kits ?? []).map((kit) => ({
    id: kit.id,
    name: kit.name,
    isDefault: Boolean(kit.isDefault),
  }));

  const panelParam = router.query.panel;
  const initialPanel = isAccountPanelId(panelParam) ? panelParam : 'profile';

  return (
    <StudioShell active="credits">
      <AccountShell
        initialPanel={initialPanel}
        signedIn={isAuthenticated}
        onSignOut={() => {
          void logout();
        }}
        brandKitsState={brandKit.isLoading ? 'loading' : brandKit.error ? 'error' : 'ready'}
        brandKitsError={brandKit.error instanceof Error ? brandKit.error.message : null}
        brandKits={brandKits}
        creditsPanel={<CreditsPanel connection={connection} />}
        usagePanel={
          <UsagePanel
            activityState={activityState}
            activityError={craftQuery.error instanceof Error ? craftQuery.error.message : null}
            rows={rows}
            ledgerState={ledgerState}
            ledgerEntries={history?.state === 'ready' ? history.entries : []}
            ledgerError={ledgerError}
          />
        }
      />
    </StudioShell>
  );
}
