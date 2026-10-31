// ============================================================================
// QuantNeon - Saved Posts Page
// Renders the existing GET /api/posts/saved route via PostGrid.
// No seeded content: an empty saved list renders an honest empty state,
// and a failed load renders an error state with retry — never fake posts.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { PostGrid } from '../components/PostGrid';
import { apiClient } from '../services/api-client';
import type { Post } from '../types';

export interface SavedPostsViewProps {
  posts: Post[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onPostClick: (id: string) => void;
}

export function SavedPostsView({ posts, isLoading, error, onRetry, onPostClick }: SavedPostsViewProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0F0F14] text-gray-900 dark:text-gray-100">
      <div className="px-4 max-w-7xl mx-auto py-4">
        <h1 className="text-xl font-bold mb-4">Saved</h1>

        {isLoading ? (
          <p role="status">Loading saved posts…</p>
        ) : error ? (
          <div role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-900"
            >
              Try again
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div>
            <p className="font-medium">No saved posts yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Posts you save will appear here. Tap the bookmark icon on a post to save it.
            </p>
          </div>
        ) : (
          <PostGrid posts={posts} onPostClick={onPostClick} />
        )}
      </div>
    </div>
  );
}

export function SavedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedPosts() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient.getSavedPosts();
        if (cancelled) {
          return;
        }
        if (response.success && response.data) {
          setPosts(response.data.posts ?? []);
        } else {
          setPosts([]);
          setError(response.error?.message ?? 'Could not load saved posts.');
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setPosts([]);
        setError(err instanceof Error ? err.message : 'Could not load saved posts.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSavedPosts();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function handlePostClick(id: string) {
    void router?.push(`/post/${id}`);
  }

  return (
    <SavedPostsView
      posts={posts}
      isLoading={isLoading}
      error={error}
      onRetry={() => setReloadKey((key) => key + 1)}
      onPostClick={handlePostClick}
    />
  );
}

export default SavedPage;
