'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Card, Button, Badge, LoadingState, ErrorState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { quantAdsAPI } from '../../services/api-client';
import { SignInRequired } from '../../components/SignInRequired';
import { isUnauthorizedError } from '../../lib/auth-errors';
import type { CustomAudience } from '../../types';

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.gentle } },
};

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
    <motion.div variants={staggerItem}>
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
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
            >
              Use in Campaign
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
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
        <Button
          variant="primary"
          size="sm"
          className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
        >
          Create Audience
        </Button>
      </div>

      {isLoading && <LoadingState text="Loading audiences..." />}

      {isError &&
        (isUnauthorizedError(error) ? (
          <SignInRequired />
        ) : (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load audiences'}
            onRetry={() => refetch()}
          />
        ))}

      {!isLoading && !isError && audiences && audiences.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--quant-muted-foreground)]">
            No audiences yet. Create a custom audience to start targeting.
          </p>
        </div>
      )}

      {!isLoading && !isError && audiences && audiences.length > 0 && (
        <motion.div variants={staggerContainer} initial="hidden" animate="show">
          {audiences.map((audience) => (
            <AudienceCard key={audience.id} audience={audience} />
          ))}
        </motion.div>
      )}
    </main>
  );
}
