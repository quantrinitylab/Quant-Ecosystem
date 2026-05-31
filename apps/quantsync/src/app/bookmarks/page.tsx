'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Avatar,
  LoadingState,
  ErrorState,
  EmptyState,
  PageTransition,
  StaggerList,
} from '@quant/shared-ui';
import { quantSyncAPI } from '../../services/api-client';
import type { Post } from '../../types';

export default function BookmarksPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['bookmarks'],
    queryFn: async () => {
      const response = await quantSyncAPI.getBookmarks();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load bookmarks');
      }
      return response.data || [];
    },
  });

  return (
    <PageTransition>
      <main className="max-w-2xl mx-auto px-4 py-6 min-h-screen">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Bookmarks</h1>

        {isLoading && <LoadingState text="Loading bookmarks..." />}

        {isError && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load bookmarks'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && data && data.length === 0 && (
          <EmptyState
            title="No bookmarks"
            description="Save posts you want to read later by bookmarking them."
          />
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <StaggerList className="space-y-3">
            {data.map((post: Post) => (
              <Card
                key={post.id}
                className="p-4 bg-white dark:bg-[var(--quant-card)] border dark:border-gray-800"
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    src={post.author?.avatar}
                    alt={post.author?.displayName || 'User'}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate text-gray-900 dark:text-gray-100">
                        {post.author?.displayName || 'Anonymous'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        @{post.author?.username || 'anon'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                      {post.content}
                    </p>
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
