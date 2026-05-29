'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Button, LoadingState, ErrorState } from '@quant/shared-ui';
import { quantAdsAPI } from '../services/api-client';
import type { Campaign } from '../types';

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-[var(--quant-muted-foreground)] uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </Card>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const statusColor =
    campaign.status === 'active'
      ? 'text-[var(--quant-success)]'
      : campaign.status === 'paused'
        ? 'text-[var(--quant-warning)]'
        : 'text-[var(--quant-muted-foreground)]';

  return (
    <Card className="p-4 mb-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">{campaign.name}</h3>
          <p className="text-xs text-[var(--quant-muted-foreground)] mt-0.5">
            {campaign.objective} &middot; <span className={statusColor}>{campaign.status}</span>
          </p>
        </div>
        <div className="text-right text-xs text-[var(--quant-muted-foreground)]">
          <p>${campaign.budget.spent.toLocaleString()} spent</p>
          <p>{campaign.metrics.impressions.toLocaleString()} impressions</p>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const {
    data: campaigns,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['campaigns-dashboard'],
    queryFn: async () => {
      const response = await quantAdsAPI.listCampaigns();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load campaigns');
      }
      return response.data || [];
    },
  });

  const activeCampaigns = campaigns?.filter((c) => c.status === 'active') || [];
  const totalSpend = campaigns?.reduce((sum, c) => sum + c.budget.spent, 0) || 0;
  const totalImpressions = campaigns?.reduce((sum, c) => sum + c.metrics.impressions, 0) || 0;
  const totalClicks = campaigns?.reduce((sum, c) => sum + c.metrics.clicks, 0) || 0;
  const avgCtr =
    totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Ads Dashboard</h1>
        <Button variant="primary" size="sm">
          New Campaign
        </Button>
      </div>

      {isLoading && <LoadingState text="Loading dashboard..." />}

      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load dashboard'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
            <MetricCard label="Total Spend" value={`$${totalSpend.toLocaleString()}`} />
            <MetricCard label="Impressions" value={totalImpressions.toLocaleString()} />
            <MetricCard label="Clicks" value={totalClicks.toLocaleString()} />
            <MetricCard label="Avg CTR" value={`${avgCtr}%`} />
            <MetricCard label="Active Campaigns" value={String(activeCampaigns.length)} />
          </div>

          <h2 className="text-lg font-semibold mb-3">Recent Campaigns</h2>

          {campaigns && campaigns.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[var(--quant-muted-foreground)]">
                No campaigns yet. Create your first campaign to get started!
              </p>
            </div>
          )}

          {campaigns && campaigns.length > 0 && (
            <div>
              {campaigns.slice(0, 10).map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
