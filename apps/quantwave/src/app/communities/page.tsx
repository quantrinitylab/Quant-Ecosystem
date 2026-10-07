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
import type { Community } from '../../types';

export default function CommunitiesPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['communities'],
    queryFn: async () => {
      const response = await quantSyncAPI.listCommunities();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load communities');
      }
      return response.data || [];
    },
  });

  return (
    <PageTransition>
      <main className="max-w-2xl mx-auto px-4 py-6 min-h-screen">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Communities</h1>

        {isLoading && <LoadingState text="Loading communities..." />}

        {isError && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load communities'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && data && data.length === 0 && (
          <EmptyState
            title="No communities yet"
            description="Be the first to create a community and start the conversation."
          />
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <StaggerList className="space-y-3">
            {data.map((community: Community) => (
              <Card
                key={community.id}
                className="p-4 bg-white dark:bg-[var(--quant-card)] border dark:border-gray-800"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {community.displayName}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {community.description}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {community.memberCount.toLocaleString()} members
                    </span>
                  </div>
                  <SpringButton className="min-h-[44px] px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg">
                    {community.isJoined ? 'Joined' : 'Join'}
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
