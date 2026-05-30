'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Avatar,
  LoadingState,
  ErrorState,
  EmptyState,
  StaggerList,
  PageTransition,
  SpringButton,
  Skeleton,
} from '@quant/shared-ui';
import { motion, AnimatePresence } from 'framer-motion';
import { quantSyncAPI } from '../services/api-client';
import type { Post, FeedMode } from '../types';

const FEED_MODES: { id: FeedMode; label: string }[] = [
  { id: 'for-you', label: 'For You' },
  { id: 'following', label: 'Following' },
  { id: 'trending', label: 'Trending' },
];

function PostSkeleton() {
  return (
    <Card className="p-4 mb-3">
      <div className="flex items-start gap-3">
        <Skeleton variant="circle" width="48px" height="48px" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton variant="text" width="120px" height="16px" />
            <Skeleton variant="text" width="80px" height="14px" />
          </div>
          <Skeleton variant="rect" width="100%" height="60px" />
          <div className="flex items-center gap-4 mt-3">
            <Skeleton variant="text" width="60px" height="14px" />
            <Skeleton variant="text" width="60px" height="14px" />
            <Skeleton variant="text" width="60px" height="14px" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function PostCard({ post }: { post: Post }) {
  return (
    <Card className="p-4 mb-3 bg-white dark:bg-[var(--quant-card)] border dark:border-gray-800">
      <div className="flex items-start gap-3">
        <Avatar src={post.author?.avatar} alt={post.author?.displayName || 'User'} size="md" />
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
          <div className="flex items-center gap-4 mt-3">
            <SpringButton className="min-h-[44px] text-sm text-gray-600 dark:text-gray-400 hover:text-blue-500 px-2 py-1 rounded">
              {post.upvotes} Likes
            </SpringButton>
            <SpringButton className="min-h-[44px] text-sm text-gray-600 dark:text-gray-400 hover:text-green-500 px-2 py-1 rounded">
              {post.repostCount} Reposts
            </SpringButton>
            <SpringButton className="min-h-[44px] text-sm text-gray-600 dark:text-gray-400 hover:text-blue-500 px-2 py-1 rounded">
              {post.commentCount} Comments
            </SpringButton>
            <SpringButton className="min-h-[44px] text-sm text-gray-600 dark:text-gray-400 hover:text-yellow-500 px-2 py-1 rounded">
              Bookmark
            </SpringButton>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function FeedPage() {
  const [activeMode, setActiveMode] = useState<FeedMode>('for-you');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['feed', activeMode],
    queryFn: async () => {
      const response = await quantSyncAPI.getFeed(activeMode);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load feed');
      }
      return response.data || [];
    },
  });

  return (
    <PageTransition>
      <main className="max-w-2xl mx-auto px-4 py-6 min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Feed</h1>
          <SpringButton className="min-h-[44px] px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg">
            Compose
          </SpringButton>
        </div>

        <div className="relative flex gap-1 mb-6 p-1 rounded-lg bg-[var(--quant-muted)]">
          {FEED_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              className={`relative flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
                activeMode === mode.id
                  ? 'text-[var(--quant-foreground)]'
                  : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
              }`}
            >
              {activeMode === mode.id && (
                <motion.div
                  layoutId="feed-indicator"
                  className="absolute inset-0 bg-[var(--quant-background)] rounded-md shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{mode.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {isLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <PostSkeleton />
              <PostSkeleton />
              <PostSkeleton />
              <PostSkeleton />
            </motion.div>
          )}

          {isError && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ErrorState
                message={error instanceof Error ? error.message : 'Failed to load feed'}
                onRetry={() => refetch()}
              />
            </motion.div>
          )}

          {!isLoading && !isError && data && data.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <EmptyState
                title="No posts yet"
                description="Follow some people or check out trending topics to see posts here!"
              />
            </motion.div>
          )}

          {!isLoading && !isError && data && data.length > 0 && (
            <motion.div
              key="posts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <StaggerList className="space-y-3">
                {data.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </StaggerList>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </PageTransition>
  );
}
