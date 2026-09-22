// ============================================================================
// QuantMax — Comments sheet (TikTok-style bottom sheet).
// Real comment thread backed by GET/POST /api/videos/:id/comments. Replaces the
// old "Comments loaded from API" placeholder. Fetches on open, optimistic-ish
// prepend on post, with loading / empty / error states.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { apiClient } from '../services/api-client';
import type { VideoComment } from '../types';

interface CommentsSheetProps {
  videoId: string;
  onClose: () => void;
  /** Bubble the new count up so the overlay counter can update. */
  onCountChange?: (count: number) => void;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function CommentsSheet({ videoId, onClose, onCountChange }: CommentsSheetProps) {
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    const res = await apiClient.getComments(videoId);
    if (res.success && res.data) {
      setComments(res.data.comments);
      setStatus('ready');
    } else {
      setStatus('error');
    }
  }, [videoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const body = draft.trim();
      if (!body || posting) return;
      setPosting(true);
      const res = await apiClient.postComment(videoId, body);
      setPosting(false);
      if (res.success && res.data) {
        setComments((prev) => {
          const next = [res.data!.comment, ...prev];
          onCountChange?.(next.length);
          return next;
        });
        setDraft('');
      }
    },
    [draft, posting, videoId, onCountChange],
  );

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', ...spring.stiff }}
      className="absolute inset-x-0 bottom-0 z-40 flex max-h-[62vh] flex-col rounded-t-2xl bg-[var(--quant-card)]"
      role="dialog"
      aria-label="Comments"
    >
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <h3 className="text-base font-semibold text-[var(--quant-foreground)]">
          Comments{comments.length ? ` · ${comments.length}` : ''}
        </h3>
        <button
          type="button"
          aria-label="Close comments"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--quant-foreground)] hover:bg-[var(--surface-hover)]"
        >
          &#10005;
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {status === 'loading' && (
          <p className="py-6 text-center text-sm text-[var(--quant-muted-foreground)]">
            Loading comments…
          </p>
        )}
        {status === 'error' && (
          <div className="py-6 text-center">
            <p className="text-sm text-[var(--quant-muted-foreground)]">Couldn’t load comments.</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 text-sm font-medium text-[var(--brand-primary)] hover:underline"
            >
              Retry
            </button>
          </div>
        )}
        {status === 'ready' && comments.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--quant-muted-foreground)]">
            No comments yet — be the first.
          </p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div className="h-8 w-8 flex-none rounded-full bg-[var(--quant-muted)]" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13px] font-semibold text-[var(--quant-foreground)]">
                  @{c.userId.slice(0, 8)}
                </span>
                <span className="text-[11px] text-[var(--quant-muted-foreground)]">
                  {timeAgo(c.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--quant-foreground)]">
                {c.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-[var(--quant-border)] px-4 py-3"
      >
        <label htmlFor="comment-input" className="sr-only">
          Add a comment
        </label>
        <input
          id="comment-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1000}
          placeholder="Add a comment…"
          className="min-h-[44px] flex-1 rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 text-sm text-[var(--quant-foreground)] outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20"
        />
        <button
          type="submit"
          disabled={!draft.trim() || posting}
          className="min-h-[44px] rounded-full bg-[var(--brand-primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {posting ? '…' : 'Post'}
        </button>
      </form>
    </motion.div>
  );
}
