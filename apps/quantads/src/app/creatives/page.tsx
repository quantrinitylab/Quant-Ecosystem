'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Card,
  Button,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
  PageTransition,
  StaggerList,
} from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { quantAdsAPI } from '../../services/api-client';
import { SignInRequired } from '../../components/SignInRequired';
import { isUnauthorizedError } from '../../lib/auth-errors';
import type { Creative } from '../../types';

const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.gentle } },
};

function CreativeCard({ creative }: { creative: Creative }) {
  const statusVariant =
    creative.status === 'approved'
      ? 'success'
      : creative.status === 'rejected'
        ? 'danger'
        : 'default';

  return (
    <motion.div variants={staggerItem}>
      <Card className="p-4 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">{creative.name}</h3>
              <Badge variant={statusVariant}>{creative.status}</Badge>
            </div>
            <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
              {creative.format} &middot; {creative.headline}
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-[var(--quant-muted-foreground)]">
              <span>{creative.performance.impressions.toLocaleString()} impressions</span>
              <span>{creative.performance.clicks.toLocaleString()} clicks</span>
              <span>{(creative.performance.ctr * 100).toFixed(2)}% CTR</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
          >
            Edit
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

export default function CreativesPage() {
  const {
    data: creatives,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['creatives'],
    queryFn: async () => {
      const response = await quantAdsAPI.listCreatives();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load creatives');
      }
      return response.data || [];
    },
  });

  return (
    <PageTransition>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Creatives</h1>
          <Button
            variant="primary"
            size="sm"
            className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
          >
            New Creative
          </Button>
        </div>

        {isLoading && <LoadingState text="Loading creatives..." />}

        {isError &&
          (isUnauthorizedError(error) ? (
            <SignInRequired />
          ) : (
            <ErrorState
              message={error instanceof Error ? error.message : 'Failed to load creatives'}
              onRetry={() => refetch()}
            />
          ))}

        {!isLoading && !isError && creatives && creatives.length === 0 && (
          <EmptyState
            title="No creatives yet"
            description="Create your first ad creative to start building campaigns."
          />
        )}

        {!isLoading && !isError && creatives && creatives.length > 0 && (
          <StaggerList className="space-y-0">
            {creatives.map((creative: Creative) => (
              <CreativeCard key={creative.id} creative={creative} />
            ))}
          </StaggerList>
        )}
      </main>
    </PageTransition>
  );
}
