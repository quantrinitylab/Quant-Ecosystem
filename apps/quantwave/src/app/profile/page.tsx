'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Avatar, LoadingState, ErrorState, PageTransition } from '@quant/shared-ui';
import { quantSyncAPI } from '../../services/api-client';

export default function ProfilePage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const response = await quantSyncAPI.getSession();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load profile');
      }
      return response.data;
    },
  });

  return (
    <PageTransition>
      <main className="max-w-2xl mx-auto px-4 py-6 min-h-screen">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Profile</h1>

        {isLoading && <LoadingState text="Loading profile..." />}

        {isError && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load profile'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && data && (
          <Card className="p-6 bg-white dark:bg-[var(--quant-card)] border dark:border-gray-800">
            <div className="flex items-center gap-4">
              <Avatar src={data.avatar} alt={data.displayName || 'User'} size="lg" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {data.displayName || 'Anonymous User'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  @{data.username || 'user'}
                </p>
              </div>
            </div>
            {data.bio && (
              <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">{data.bio}</p>
            )}
            <div className="flex gap-6 mt-4 text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                <strong className="text-gray-900 dark:text-gray-100">
                  {data.followerCount ?? 0}
                </strong>{' '}
                followers
              </span>
              <span className="text-gray-600 dark:text-gray-400">
                <strong className="text-gray-900 dark:text-gray-100">
                  {data.followingCount ?? 0}
                </strong>{' '}
                following
              </span>
              <span className="text-gray-600 dark:text-gray-400">
                <strong className="text-gray-900 dark:text-gray-100">{data.postCount ?? 0}</strong>{' '}
                posts
              </span>
            </div>
          </Card>
        )}
      </main>
    </PageTransition>
  );
}
