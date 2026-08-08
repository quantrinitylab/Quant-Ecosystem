'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api-client';
import type { Email, EmailCategory } from '../types';

interface UseInfiniteInboxOptions {
  category?: EmailCategory;
  pageSize?: number;
}

interface UseInfiniteInboxReturn {
  emails: Email[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => Promise<void>;
  sentinelRef: (node: HTMLElement | null) => void;
}

/**
 * Infinite scroll hook for the inbox.
 * Uses IntersectionObserver to automatically load more emails when the user
 * scrolls near the bottom. Gmail uses pagination — we use smooth infinite scroll.
 */
export function useInfiniteInbox({
  category = 'primary',
  pageSize = 20,
}: UseInfiniteInboxOptions = {}): UseInfiniteInboxReturn {
  const [emails, setEmails] = useState<Email[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLElement | null>(null);

  // Initial fetch
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    setPage(1);
    setEmails([]);
    setHasMore(true);

    apiClient
      .getEmails({ category, page: 1, pageSize })
      .then((response) => {
        if (!active) return;
        if (response.success && response.data) {
          const items = Array.isArray(response.data) ? response.data : response.data.items ?? [];
          setEmails(items);
          setHasMore(items.length >= pageSize);
        } else {
          setError(new Error(response.error?.message || 'Failed to load inbox'));
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err : new Error('Network error'));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [category, pageSize]);

  // Load more pages
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);

    const nextPage = page + 1;
    try {
      const response = await apiClient.getEmails({ category, page: nextPage, pageSize });
      if (response.success && response.data) {
        const items = Array.isArray(response.data) ? response.data : response.data.items ?? [];
        setEmails((prev) => [...prev, ...items]);
        setPage(nextPage);
        setHasMore(items.length >= pageSize);
      }
    } catch {
      // Silently fail on load-more — user can scroll down again
    } finally {
      setIsLoadingMore(false);
    }
  }, [category, hasMore, isLoadingMore, page, pageSize]);

  // IntersectionObserver for sentinel element
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      sentinelNodeRef.current = node;

      if (!node) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && hasMore && !isLoadingMore && !isLoading) {
            void loadMore();
          }
        },
        { rootMargin: '200px' },
      );
      observerRef.current.observe(node);
    },
    [hasMore, isLoading, isLoadingMore, loadMore],
  );

  // Refetch from the beginning
  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPage(1);
    setHasMore(true);
    try {
      const response = await apiClient.getEmails({ category, page: 1, pageSize });
      if (response.success && response.data) {
        const items = Array.isArray(response.data) ? response.data : response.data.items ?? [];
        setEmails(items);
        setHasMore(items.length >= pageSize);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Network error'));
    } finally {
      setIsLoading(false);
    }
  }, [category, pageSize]);

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return {
    emails,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
    sentinelRef,
  };
}
