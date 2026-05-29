'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, LoadingState, ErrorState } from '@quant/shared-ui';
import { quantAdsAPI } from '../../services/api-client';

type DateRange = '7d' | '14d' | '30d' | '90d';

const DATE_RANGES: { id: DateRange; label: string }[] = [
  { id: '7d', label: '7 Days' },
  { id: '14d', label: '14 Days' },
  { id: '30d', label: '30 Days' },
  { id: '90d', label: '90 Days' },
];

function MetricCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-[var(--quant-muted-foreground)] uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {subtext && <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">{subtext}</p>}
    </Card>
  );
}

function getDateRangeStart(range: DateRange): number {
  const now = Date.now();
  const days = parseInt(range, 10);
  return now - days * 24 * 60 * 60 * 1000;
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('7d');

  const {
    data: campaigns,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['analytics-overview', dateRange],
    queryFn: async () => {
      const response = await quantAdsAPI.listCampaigns();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load analytics');
      }
      const all = response.data || [];
      const rangeStart = getDateRangeStart(dateRange);
      return all.filter((c) => new Date(c.createdAt).getTime() >= rangeStart);
    },
  });

  const totalImpressions = campaigns?.reduce((sum, c) => sum + c.metrics.impressions, 0) || 0;
  const totalClicks = campaigns?.reduce((sum, c) => sum + c.metrics.clicks, 0) || 0;
  const totalConversions = campaigns?.reduce((sum, c) => sum + c.metrics.conversions, 0) || 0;
  const totalSpend = campaigns?.reduce((sum, c) => sum + c.budget.spent, 0) || 0;
  const avgCtr =
    totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';
  const convRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : '0.00';

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--quant-muted)]">
          {DATE_RANGES.map((range) => (
            <button
              key={range.id}
              onClick={() => setDateRange(range.id)}
              className={`py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                dateRange === range.id
                  ? 'bg-[var(--quant-background)] text-[var(--quant-foreground)] shadow-sm'
                  : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingState text="Loading analytics..." />}

      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load analytics'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            <MetricCard label="Impressions" value={totalImpressions.toLocaleString()} />
            <MetricCard
              label="Clicks"
              value={totalClicks.toLocaleString()}
              subtext={`${avgCtr}% CTR`}
            />
            <MetricCard
              label="Conversions"
              value={totalConversions.toLocaleString()}
              subtext={`${convRate}% conv rate`}
            />
            <MetricCard label="Total Spend" value={`$${totalSpend.toLocaleString()}`} />
            <MetricCard
              label="Avg CPC"
              value={totalClicks > 0 ? `$${(totalSpend / totalClicks).toFixed(2)}` : '$0.00'}
            />
            <MetricCard
              label="Avg CPM"
              value={
                totalImpressions > 0
                  ? `$${((totalSpend / totalImpressions) * 1000).toFixed(2)}`
                  : '$0.00'
              }
            />
          </div>

          <h2 className="text-lg font-semibold mb-3">Conversion Funnel</h2>
          <Card className="p-6 mb-6">
            <div className="flex items-center justify-between text-center">
              <div className="flex-1">
                <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">Impressions</p>
              </div>
              <div className="text-[var(--quant-muted-foreground)]">&rarr;</div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">Clicks</p>
              </div>
              <div className="text-[var(--quant-muted-foreground)]">&rarr;</div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{totalConversions.toLocaleString()}</p>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">Conversions</p>
              </div>
            </div>
          </Card>

          <h2 className="text-lg font-semibold mb-3">Top Campaigns</h2>
          {campaigns && campaigns.length > 0 ? (
            <div className="space-y-2">
              {campaigns
                .sort((a, b) => b.metrics.conversions - a.metrics.conversions)
                .slice(0, 5)
                .map((campaign) => (
                  <Card key={campaign.id} className="p-3 flex items-center justify-between">
                    <span className="font-medium text-sm">{campaign.name}</span>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">
                      {campaign.metrics.conversions} conversions
                    </span>
                  </Card>
                ))}
            </div>
          ) : (
            <p className="text-[var(--quant-muted-foreground)] text-sm">
              No campaign data to display.
            </p>
          )}
        </>
      )}
    </main>
  );
}
