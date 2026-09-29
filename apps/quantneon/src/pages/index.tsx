// ============================================================================
// QuantNeon - Instagram-Style Feed Page
// Stories bar, posts feed, infinite scroll, pull-to-refresh
// ============================================================================

import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  LoadingState,
  ErrorState,
  EmptyState,
  Skeleton,
  PageTransition,
  StaggerList,
  SpringButton,
} from '@quant/shared-ui';
import { sanitizeMediaUrl } from '@quant/common';
import { useFeed } from '../hooks/useFeed';

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton variant="circle" width="40px" height="40px" />
            <Skeleton variant="text" width="120px" height="16px" />
          </div>
          <Skeleton variant="rect" width="100%" height="300px" />
          <div className="flex gap-3">
            <Skeleton variant="circle" width="32px" height="32px" />
            <Skeleton variant="circle" width="32px" height="32px" />
            <Skeleton variant="circle" width="32px" height="32px" />
          </div>
          <Skeleton variant="text" width="60%" height="14px" />
        </div>
      ))}
    </div>
  );
}

import { useAuth } from '../providers/auth-provider';
import Link from 'next/link';

function GuestHeroBanner() {
  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-amber-500/10 border border-pink-500/20 p-5 text-center shadow-lg">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-pink-500 via-red-500 to-amber-500 shadow-md shadow-pink-500/30">
        <span className="text-2xl font-black text-white">Q</span>
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
        See what's happening on QuantGram
      </h2>
      <p className="mt-1.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
        Watch trending reels, explore creator stories, and share photos with one unified Quant
        Account.
      </p>
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2.5">
        <Link
          href="/login?returnTo=/"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs sm:text-sm bg-gradient-to-r from-pink-500 via-red-500 to-amber-500 text-white shadow-lg shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all"
        >
          <span>⚡ Continue with Quant Account</span>
        </Link>
        <Link
          href="/explore"
          className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 rounded-full font-medium text-xs sm:text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Explore Trending
        </Link>
      </div>
    </div>
  );
}

function GuestStickyPrompt() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#121218]/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 p-3 sm:p-4 shadow-2xl">
      <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            Experience full QuantGram
          </p>
          <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
            Sign in to follow creators, like, comment, and post reels
          </p>
        </div>
        <Link
          href="/login?returnTo=/"
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-semibold text-xs sm:text-sm bg-gradient-to-r from-pink-500 via-red-500 to-amber-500 text-white shadow-md active:scale-95 transition-all"
        >
          <span>⚡ Continue with Quant Account</span>
        </Link>
      </div>
    </div>
  );
}

function GuestEmptyLanding() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 py-8">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-tr from-pink-500 via-red-500 to-amber-500 shadow-xl shadow-pink-500/30">
        <span className="text-3xl font-black text-white">Q</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Welcome to QuantGram</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
        The creator social platform with high-octane reels, visual stories, and interactive games.
      </p>

      <div className="mt-6 w-full max-w-xs space-y-3">
        <Link
          href="/login?returnTo=/"
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-pink-500 via-red-500 to-amber-500 text-white shadow-lg shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all"
        >
          <span>⚡ Continue with Quant Account</span>
        </Link>
        <div className="grid grid-cols-2 gap-2 text-xs font-medium">
          <Link
            href="/explore"
            className="p-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            🔥 Explore Grid
          </Link>
          <Link
            href="/reels"
            className="p-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            🎬 Watch Reels
          </Link>
        </div>
      </div>
    </div>
  );
}

const FeedPage: React.FC = () => {
  const [state, actions] = useFeed();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const isGuest = (!isAuthenticated && !authLoading) || Boolean(state.isGuest);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      if (target.scrollHeight - target.scrollTop - target.clientHeight < 300) {
        actions.loadMore();
      }
    },
    [actions],
  );

  // Authenticated users with empty feed and currently loading show skeletons
  if (state.loading && state.posts.length === 0 && state.stories.length === 0 && !isGuest) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white dark:bg-[#0F0F14] px-4 py-6 max-w-lg mx-auto">
          <FeedSkeleton />
        </div>
      </PageTransition>
    );
  }

  // Error state for authenticated users
  if (state.error && state.posts.length === 0 && !isGuest) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white dark:bg-[#0F0F14] flex items-center justify-center px-4">
          <ErrorState message={state.error} onRetry={() => void actions.refresh()} />
        </div>
      </PageTransition>
    );
  }

  // Unauthenticated guests with no posts: render Instagram-style guest landing
  if (isGuest && state.posts.length === 0) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white dark:bg-[#0F0F14]">
          <GuestEmptyLanding />
          <GuestStickyPrompt />
        </div>
      </PageTransition>
    );
  }

  if (state.posts.length === 0 && state.stories.length === 0) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white dark:bg-[#0F0F14] flex items-center justify-center px-4">
          <EmptyState
            title="Your feed is empty"
            description="Follow people to see their posts here"
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div
        className="min-h-screen bg-white dark:bg-[#0F0F14] text-gray-900 dark:text-gray-100"
        onScroll={handleScroll}
      >
        <div className="max-w-lg mx-auto px-4 py-4 pb-20">
          {/* Guest Hero Banner */}
          {isGuest && <GuestHeroBanner />}

          {/* Stories Bar */}
          {state.stories.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
              {state.stories.map((user) => (
                <motion.button
                  key={user.id}
                  whileTap={{ scale: 0.92 }}
                  className={`flex flex-col items-center gap-1.5 min-w-[68px] ${user.hasUnseenStory ? 'opacity-100' : 'opacity-70'}`}
                  onClick={() => actions.markStorySeen(user.id)}
                >
                  <div
                    className={`p-[2.5px] rounded-full bg-gradient-to-br ${user.hasUnseenStory ? 'from-pink-500 via-red-500 to-yellow-500' : 'from-gray-400 to-gray-500'}`}
                  >
                    <div className="p-[2px] bg-white dark:bg-[#0F0F14] rounded-full">
                      <img
                        className="w-14 h-14 rounded-full object-cover"
                        src={user.avatar}
                        alt={user.username}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-800 dark:text-gray-200 truncate w-16 text-center">
                    {user.username}
                  </span>
                </motion.button>
              ))}
            </div>
          )}

          {/* Posts Feed */}
          <StaggerList>
            {state.posts.map((post) => (
              <div
                key={post.id}
                className="bg-white dark:bg-gray-900 rounded-xl mb-4 overflow-hidden border border-gray-100 dark:border-gray-800"
              >
                <div className="flex items-center gap-3 p-3">
                  <img
                    className="w-9 h-9 rounded-full object-cover"
                    src={sanitizeMediaUrl(post.authorAvatar)}
                    alt={post.authorUsername}
                  />
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                    {post.authorUsername}
                  </span>
                </div>
                <div
                  className="relative bg-gray-100 dark:bg-gray-800"
                  onDoubleClick={() => actions.doubleTapLike(post.id)}
                >
                  {post.mediaUrls && post.mediaUrls.length > 0 && (
                    <img
                      className="w-full aspect-square object-cover"
                      src={sanitizeMediaUrl(post.mediaUrls[0])}
                      alt="Post"
                    />
                  )}
                  {state.likeAnimation === post.id && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <span className="text-6xl text-red-500 drop-shadow-lg">&#10084;</span>
                    </motion.div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-1">
                    <SpringButton
                      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full ${post.isLiked ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}
                      onClick={() =>
                        post.isLiked ? actions.unlikePost(post.id) : actions.likePost(post.id)
                      }
                    >
                      {post.isLiked ? '❤️' : '🤍'}
                    </SpringButton>
                    <SpringButton className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-gray-700 dark:text-gray-300">
                      💬
                    </SpringButton>
                    <SpringButton className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-gray-700 dark:text-gray-300">
                      ↗
                    </SpringButton>
                    <div className="flex-1" />
                    <SpringButton
                      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full ${post.isSaved ? 'text-yellow-500' : 'text-gray-700 dark:text-gray-300'}`}
                      onClick={() =>
                        post.isSaved ? actions.unsavePost(post.id) : actions.savePost(post.id)
                      }
                    >
                      {post.isSaved ? '🔖' : '📑'}
                    </SpringButton>
                  </div>
                  <p className="font-semibold text-sm mt-1 text-gray-900 dark:text-gray-100">
                    {post.likeCount.toLocaleString()} likes
                  </p>
                  <p className="text-sm mt-1 text-gray-800 dark:text-gray-200">
                    <strong>{post.authorUsername}</strong> {post.caption}
                  </p>
                  {post.commentCount > 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 mt-1 block">
                      View all {post.commentCount} comments
                    </span>
                  )}
                </div>
              </div>
            ))}
          </StaggerList>

          {state.loading && state.posts.length > 0 && (
            <div className="py-4">
              <LoadingState variant="dots" text="Loading more..." size="sm" />
            </div>
          )}
        </div>
      </div>
      {isGuest && <GuestStickyPrompt />}
    </PageTransition>
  );
};

export default FeedPage;
