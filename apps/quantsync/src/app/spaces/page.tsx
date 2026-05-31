'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Card,
  LoadingState,
  ErrorState,
  EmptyState,
  PageTransition,
  StaggerList,
  SpringButton,
} from '@quant/shared-ui';
import { quantSyncAPI } from '../../services/api-client';
import type { Space } from '../../types';

export default function SpacesPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['spaces', 'live'],
    queryFn: async () => {
      const response = await quantSyncAPI.listLiveSpaces();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load spaces');
      }
      return response.data || [];
    },
  });

  return (
    <PageTransition>
      <main className="max-w-2xl mx-auto px-4 py-6 min-h-screen">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Live Spaces</h1>

        {isLoading && <LoadingState text="Loading live spaces..." />}

        {isError && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load spaces'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && data && data.length === 0 && (
          <EmptyState
            title="No live spaces"
            description="No one is hosting a space right now. Start one to begin a live conversation."
          />
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <StaggerList className="space-y-3">
            {data.map((space: Space) => (
              <Card
                key={space.id}
                className="p-4 bg-white dark:bg-[var(--quant-card)] border dark:border-gray-800"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {space.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Hosted by {space.host?.displayName || 'Unknown'}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {space.listenerCount} listening
                    </span>
                  </div>
                  <SpringButton className="min-h-[44px] px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg">
                    Join
                  </SpringButton>
                </div>
              </Card>
            ))}
          </StaggerList>
        )}
      </main>
    </PageTransition>
  );
}
