'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Button, Badge, LoadingState, ErrorState } from '@quant/shared-ui';
import { quantAdsAPI } from '../../services/api-client';
import type { CustomAudience } from '../../types';

function AudienceCard({ audience }: { audience: CustomAudience }) {
  const sourceLabel =
    audience.source === 'upload'
      ? 'Customer List'
      : audience.source === 'pixel'
        ? 'Pixel Tracking'
        : audience.source === 'engagement'
          ? 'Engagement'
          : 'App Activity';

  return (
    <Card className="p-4 mb-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">{audience.name}</h3>
          <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
            {audience.size.toLocaleString()} users &middot;{' '}
            <Badge variant="default">{sourceLabel}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm">
            Edit
          </Button>
          <Button variant="secondary" size="sm">
            Use in Campaign
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function AudiencesPage() {
  const {
    data: audiences,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['audiences'],
    queryFn: async () => {
      const response = await quantAdsAPI.listAudiences();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load audiences');
      }
      return response.data || [];
    },
  });

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Audiences</h1>
        <Button variant="primary" size="sm">
          Create Audience
        </Button>
      </div>

      {isLoading && <LoadingState text="Loading audiences..." />}

      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load audiences'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && audiences && audiences.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--quant-muted-foreground)]">
            No audiences yet. Create a custom audience to start targeting.
          </p>
        </div>
      )}

      {!isLoading && !isError && audiences && audiences.length > 0 && (
        <div>
          {audiences.map((audience) => (
            <AudienceCard key={audience.id} audience={audience} />
          ))}
        </div>
      )}
    </main>
  );
}
