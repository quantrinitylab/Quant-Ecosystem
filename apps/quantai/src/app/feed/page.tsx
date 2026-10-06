'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import FeedInstructionsCard from '../../components/feed/FeedInstructionsCard';
import FeedPostCard, { type FeedPost } from '../../components/feed/FeedPostCard';

const PAGE_SIZE = 20;

interface FeedPageData {
  posts: FeedPost[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message || json?.message || `Request failed (${res.status})`);
  }
  return json.data as T;
}

/**
 * Quanty Feed — Muse S5/S9 parity.
 * Editable instructions power the scheduled generator; posts are paginated;
 * every post shows honest provenance ("Quanty brief" vs real external source).
 */
export default function FeedPage() {
  const router = useRouter();
  const [instructions, setInstructions] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFeed = useCallback(async (page: number, append: boolean) => {
    const data = await api<FeedPageData>(`/api/quanty/feed?page=${page}&limit=${PAGE_SIZE}`);
    setFeed((prev) =>
      append && prev ? { ...data, posts: [...prev.posts, ...data.posts] } : data,
    );
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [instr, firstPage] = await Promise.all([
          api<{ prompt: string } | null>('/api/quanty/feed/instructions'),
          api<FeedPageData>(`/api/quanty/feed?page=1&limit=${PAGE_SIZE}`),
        ]);
        setInstructions(instr?.prompt ?? null);
        setFeed(firstPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load your feed.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSaveInstructions = useCallback(async (prompt: string) => {
    setSavingInstructions(true);
    try {
      const saved = await api<{ prompt: string }>('/api/quanty/feed/instructions', {
        method: 'PUT',
        body: JSON.stringify({ prompt }),
      });
      setInstructions(saved.prompt);
    } finally {
      setSavingInstructions(false);
    }
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!feed?.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadFeed(feed.page + 1, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load more posts.');
    } finally {
      setLoadingMore(false);
    }
  }, [feed, loadingMore, loadFeed]);

  const handleReact = useCallback(
    async (postId: string, kind: 'like' | 'dislike') => {
      setReactingId(postId);
      try {
        const result = await api<{
          postId: string;
          myReaction: 'like' | 'dislike' | null;
          likeCount: number;
          dislikeCount: number;
        }>(`/api/quanty/feed/${encodeURIComponent(postId)}/react`, {
          method: 'POST',
          body: JSON.stringify({ kind }),
        });
        setFeed((prev) =>
          prev
            ? {
                ...prev,
                posts: prev.posts.map((p) =>
                  p.id === result.postId
                    ? {
                        ...p,
                        myReaction: result.myReaction,
                        likeCount: result.likeCount,
                        dislikeCount: result.dislikeCount,
                      }
                    : p,
                ),
              }
            : prev,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your reaction.');
      } finally {
        setReactingId(null);
      }
    },
    [],
  );

  const handleDiscuss = useCallback(
    async (postId: string) => {
      try {
        const ctx = await api<{ openingPrompt: string; title: string; postId: string }>(
          `/api/quanty/feed/${encodeURIComponent(postId)}/discuss`,
          { method: 'POST' },
        );
        // Hand the context to the main chat via sessionStorage; the composer
        // pre-fills it so the user reviews before sending (no auto-send).
        sessionStorage.setItem(
          'quanty:feed-discuss',
          JSON.stringify({ openingPrompt: ctx.openingPrompt, postId: ctx.postId, title: ctx.title }),
        );
        router.push('/');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not open the discussion.');
      }
    },
    [router],
  );

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      await api('/api/quanty/feed/generate', { method: 'POST' });
      // Refresh from page 1 so new briefs appear at the top.
      await loadFeed(1, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate briefs.');
    } finally {
      setGenerating(false);
    }
  }, [loadFeed]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Feed</h1>
          <button
            onClick={handleGenerate}
            disabled={generating || loading}
            className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-zinc-700 disabled:opacity-40"
          >
            {generating ? 'Generating…' : '✦ Generate briefs'}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-3xl bg-zinc-900" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-zinc-900/60" />
            ))}
          </div>
        ) : (
          <>
            <FeedInstructionsCard
              initialPrompt={instructions}
              onSave={handleSaveInstructions}
              saving={savingInstructions}
            />

            <div className="mt-6">
              {feed && feed.posts.length === 0 ? (
                <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center">
                  <div className="text-4xl">📰</div>
                  <p className="mt-3 text-lg font-semibold text-white">Your feed is empty</p>
                  <p className="mt-1 text-sm text-white/50">
                    Set your instructions above, then tap “Generate briefs” and Quanty will
                    write AI-labeled briefs for you.
                  </p>
                </div>
              ) : (
                feed?.posts.map((post) => (
                  <FeedPostCard
                    key={post.id}
                    post={post}
                    onReact={handleReact}
                    onDiscuss={handleDiscuss}
                    reacting={reactingId === post.id}
                  />
                ))
              )}
            </div>

            {feed && feed.hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="mt-6 w-full rounded-full bg-zinc-800 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-zinc-700 disabled:opacity-40"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
