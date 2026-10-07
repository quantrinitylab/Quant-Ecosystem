// QuantTube - Creator Monetization Dashboard
// ============================================================================
//
// This page used to be entirely fabricated. It shipped five hardcoded constants
// (MOCK_EARNINGS, MOCK_TIERS, MOCK_PAYOUT_HISTORY, MOCK_REVENUE_DATA,
// MOCK_SETTINGS) behind `await new Promise(r => setTimeout(r, 700))` that
// imitated a network call, so every creator saw the same invented figures —
// `adsRevenue: 4523.67`, a 14-day revenue chart, and six bank payouts that never
// happened. Several growth percentages ("+8.2% this month") were not even in the
// mock objects; they were literal strings in the JSX.
//
// The backend it needed was already shipped AND already proxied. Nothing called
// it. This page now reads the real engine endpoints:
//
//   GET /api/creator/earnings  -> MonetizationEngine.getEarnings
//   GET /api/payouts           -> PayoutService.getPayoutHistory
//   GET /api/payouts/balance   -> PayoutService.calculateAvailableBalance
//   GET /api/creator/tier      -> TierService.getTier
//
// Three sections had no backend at all, so they are NOT re-faked: the revenue
// time series, sellable membership tiers, and payout settings. Each now states
// that it is not available yet. An empty panel a creator can trust beats a chart
// that invents their income — and it keeps the gap visible instead of hiding it
// behind plausible numbers.
import React from 'react';
import {
  EMPTY_EARNINGS,
  useCreatorTier,
  useEarnings,
  usePayoutBalance,
  usePayoutHistory,
} from '../features/monetization/useMonetization';
import type { PayoutRecord } from '../features/monetization/useMonetization';

const formatCurrency = (amount: number): string =>
  `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

const getStatusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'text-green-400 bg-green-400/10';
    case 'pending':
      return 'text-yellow-400 bg-yellow-400/10';
    case 'processing':
      return 'text-blue-400 bg-blue-400/10';
    case 'failed':
      return 'text-red-400 bg-red-400/10';
    default:
      return 'text-gray-400 bg-gray-400/10';
  }
};

/**
 * A section with no backend behind it. Says so, rather than rendering invented
 * data that a creator could mistake for their own.
 */
const NotAvailableYet: React.FC<{ title: string; detail: string }> = ({ title, detail }) => (
  <section className="px-6 py-4">
    <h2 className="text-lg font-semibold mb-4">{title}</h2>
    <div className="bg-gray-900 rounded-xl p-6 border border-dashed border-gray-700">
      <p className="text-sm text-gray-400">{detail}</p>
    </div>
  </section>
);

const MonetizationPage: React.FC = () => {
  const earningsQuery = useEarnings();
  const payoutsQuery = usePayoutHistory();
  const balanceQuery = usePayoutBalance();
  const tierQuery = useCreatorTier();

  const loading =
    earningsQuery.isLoading || payoutsQuery.isLoading || balanceQuery.isLoading || tierQuery.isLoading;
  const failed = earningsQuery.isError || payoutsQuery.isError || balanceQuery.isError;

  // `useApiQuery` resolves to the APIResponse envelope, so the payload is `.data.data`.
  const earnings = earningsQuery.data?.data?.breakdown ?? EMPTY_EARNINGS;
  const payouts: PayoutRecord[] = payoutsQuery.data?.data?.payouts ?? [];
  const available = balanceQuery.data?.data?.available ?? 0;
  const tier = tierQuery.data?.data?.tier ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading monetization data...</p>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-4xl">⚠</div>
          <p className="text-white text-lg">Failed to load monetization data</p>
          <button
            onClick={() => {
              void earningsQuery.refetch();
              void payoutsQuery.refetch();
              void balanceQuery.refetch();
            }}
            className="px-6 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // The engine's own five revenue streams. `remixRoyalties` is included because
  // MonetizationEngine tracks it and the old fabricated UI silently dropped it,
  // so the four cards never summed to the total they sat next to.
  const streams: { label: string; icon: string; value: number }[] = [
    { label: 'Ad Revenue', icon: '📺', value: earnings.adRevenue },
    { label: 'Subscriptions', icon: '👥', value: earnings.subscriptions },
    { label: 'Tips', icon: '💬', value: earnings.tips },
    { label: 'In-App Purchases', icon: '🛍', value: earnings.iap },
    { label: 'Remix Royalties', icon: '🎚', value: earnings.remixRoyalties },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      <header className="sticky top-0 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold">Monetization</h1>
            {tier ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 capitalize">
                {String(tier)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center space-x-6">
            <div className="text-right">
              <p className="text-xs text-gray-400">Withdrawable</p>
              <p className="text-sm font-semibold text-white">{formatCurrency(available)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Total Earnings</p>
              <p className="text-lg font-bold text-green-400">{formatCurrency(earnings.total)}</p>
            </div>
          </div>
        </div>
      </header>

      <section className="px-6 py-6">
        <h2 className="text-lg font-semibold mb-4">Earnings Breakdown</h2>
        {earnings.total === 0 ? (
          <div className="bg-gray-900 rounded-xl p-6">
            <p className="text-sm text-gray-400">
              No monetization events recorded yet. Ad revenue, subscriptions, tips, in-app purchases
              and remix royalties will appear here as they are earned.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {streams.map((s) => (
              <div key={s.label} className="bg-gray-900 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-sm text-gray-400">{s.label}</span>
                </div>
                <p className="text-xl font-bold">{formatCurrency(s.value)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <NotAvailableYet
        title="Revenue Overview"
        detail="Revenue over time is not available yet: the monetization engine records earnings
          events but does not expose a time-series endpoint, so there is nothing to chart. This
          panel stays empty rather than showing a generated trend."
      />

      <section className="px-6 py-4">
        <h2 className="text-lg font-semibold mb-4">Payout History</h2>
        {payouts.length === 0 ? (
          <div className="bg-gray-900 rounded-xl p-6">
            <p className="text-sm text-gray-400">No payouts requested yet.</p>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="grid grid-cols-4 bg-gray-800 px-4 py-3">
              <span className="text-xs font-medium text-gray-400">Requested</span>
              <span className="text-xs font-medium text-gray-400">Amount</span>
              <span className="text-xs font-medium text-gray-400">Status</span>
              <span className="text-xs font-medium text-gray-400">Method</span>
            </div>
            {payouts.map((payout) => (
              <div
                key={payout.id}
                className="grid grid-cols-4 px-4 py-3 border-t border-gray-800 hover:bg-gray-800/50"
              >
                <span className="text-sm text-gray-300">
                  {new Date(payout.requestedAt).toLocaleDateString()}
                </span>
                <span className="text-sm font-medium">{formatCurrency(payout.amount)}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center w-fit ${getStatusColor(payout.status)}`}
                >
                  {payout.status}
                </span>
                <span className="text-sm text-gray-400">{payout.method}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <NotAvailableYet
        title="Membership Tiers"
        detail="Sellable membership tiers are not available yet. The backend exposes the creator's
          own tier (via TierService) but has no model for tiers a creator offers to their audience,
          so there is nothing to list, price or edit here."
      />

      <NotAvailableYet
        title="Payout Settings"
        detail="Payout method, threshold and schedule are not available yet — there is no endpoint
          that stores them. Payouts can be requested, processed and completed through the payouts
          API, but the preferences behind them are not persisted anywhere."
      />
    </div>
  );
};

export default MonetizationPage;
