'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Card,
  LoadingState,
  ErrorState,
  EmptyState,
  PageTransition,
  StaggerList,
} from '@quant/shared-ui';
import { quantSyncAPI } from '../../services/api-client';
import type { TrendingTopic } from '../../types';

export default function TrendingPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['trending'],
    queryFn: async () => {
      const response = await quantSyncAPI.getTrending();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load trending topics');
      }
      return response.data || [];
    },
  });

  return (
    <PageTransition>
      <main className="max-w-2xl mx-auto px-4 py-6 min-h-screen">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Trending</h1>

        {isLoading && <LoadingState text="Loading trending topics..." />}

        {isError && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load trending'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && data && data.length === 0 && (
          <EmptyState
            title="No trending topics"
            description="Check back later for trending topics and discussions."
          />
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <StaggerList className="space-y-3">
            {data.map((topic: TrendingTopic) => (
              <Card
                key={topic.id}
                className="p-4 bg-white dark:bg-[var(--quant-card)] border dark:border-gray-800"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {topic.category}
                    </span>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      #{topic.hashtag}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {topic.postCount.toLocaleString()} posts
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-green-500 font-medium">Trending</span>
                  </div>
                </div>
              </Card>
            ))}
          </StaggerList>
        )}
      </main>
    </PageTransition>
  );
}
