import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { spring } from '@quant/brand';
import type { ReelComment } from '../types';

const QUICK_REACTIONS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'] as const;
const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;

interface PendingAttachment {
  kind: 'gif' | 'photo';
  file: File;
  previewUrl: string;
}

interface ReelsCommentsSheetProps {
  reelId: string;
  isOpen: boolean;
  comments: ReelComment[];
  loading: boolean;
  error?: string | null;
  onClose: () => void;
  onRetry: () => void;
  onSubmit: (text: string, parentId?: string) => Promise<void>;
  onLike: (commentId: string) => Promise<void>;
}

function formatCommentTime(value: string): string {
  const createdAt = new Date(value).getTime();
  if (!Number.isFinite(createdAt)) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function ReelsCommentsSheet({
  reelId,
  isOpen,
  comments,
  loading,
  error,
  onClose,
  onRetry,
  onSubmit,
  onLike,
}: ReelsCommentsSheetProps) {
  const dragControls = useDragControls();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<ReelComment | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(() => new Set());
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) return;
    setDraft('');
    setReplyTarget(null);
    setPendingAttachment(null);
    setAttachmentError(null);
    setSubmitError(null);
  }, [isOpen, reelId]);

  useEffect(
    () => () => {
      if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl);
    },
    [pendingAttachment],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handlePickAttachment = (
    event: React.ChangeEvent<HTMLInputElement>,
    kind: PendingAttachment['kind'],
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    setAttachmentError(null);
    setSubmitError(null);
    if (!file) return;

    if (file.size > MAX_PREVIEW_BYTES) {
      setAttachmentError('Choose a file smaller than 10 MB.');
      return;
    }

    if (kind === 'gif' && file.type !== 'image/gif') {
      setAttachmentError('Choose a GIF file.');
      return;
    }

    if (kind === 'photo' && !file.type.startsWith('image/')) {
      setAttachmentError('Choose an image file.');
      return;
    }

    setPendingAttachment({
      kind,
      file,
      previewUrl: URL.createObjectURL(file),
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSubmitting) return;

    if (pendingAttachment) {
      setSubmitError(
        'Media uploads are not enabled for QuantGram comments yet. Remove the attachment to post text.',
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(text, replyTarget?.id);
      setDraft('');
      setReplyTarget(null);
    } catch (submissionError) {
      setSubmitError(
        submissionError instanceof Error ? submissionError.message : 'Could not post comment.',
      );
    } finally {
      setIsSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const appendReaction = (emoji: string) => {
    setDraft((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${emoji}`);
    inputRef.current?.focus();
  };

  const toggleReplies = (commentId: string) => {
    setExpandedReplies((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const chooseReply = (comment: ReelComment) => {
    setReplyTarget(comment);
    setSubmitError(null);
    inputRef.current?.focus();
  };

  const handleLike = async (commentId: string) => {
    setSubmitError(null);
    try {
      await onLike(commentId);
    } catch (likeError) {
      setSubmitError(likeError instanceof Error ? likeError.message : 'Could not update like.');
    }
  };

  const totalCommentCount = comments.reduce(
    (total, comment) => total + 1 + comment.replies.length,
    0,
  );

  const renderComment = (comment: ReelComment, isReply = false) => (
    <div
      key={comment.id}
      className={`flex gap-2.5 ${isReply ? 'ml-10 border-l border-white/10 pl-3' : ''}`}
      role="listitem"
    >
      {comment.userAvatar ? (
        <img
          className={`rounded-full object-cover shrink-0 ${isReply ? 'h-7 w-7' : 'h-9 w-9'}`}
          src={comment.userAvatar}
          alt=""
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`rounded-full shrink-0 flex items-center justify-center bg-white/10 text-white/70 font-semibold ${
            isReply ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs'
          }`}
        >
          {comment.username.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <strong className="text-xs font-semibold text-white">@{comment.username}</strong>
          <span className="text-[10px] text-white/40">{formatCommentTime(comment.createdAt)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-white/90">
          {comment.content}
        </p>
        {!isReply && (
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              className="text-[11px] font-medium text-white/50 hover:text-white/80"
              onClick={() => chooseReply(comment)}
              aria-label={`Reply to ${comment.username}`}
            >
              Reply
            </button>
            {comment.replies.length > 0 && (
              <button
                type="button"
                className="text-[11px] font-semibold text-violet-300 hover:text-violet-200"
                onClick={() => toggleReplies(comment.id)}
                aria-expanded={expandedReplies.has(comment.id)}
              >
                {expandedReplies.has(comment.id)
                  ? 'Hide replies'
                  : `View all ${comment.replies.length} replies`}
              </button>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className="min-w-10 flex flex-col items-center justify-start gap-0.5 pt-0.5 text-white/55 hover:text-rose-400"
        onClick={() => void handleLike(comment.id)}
        aria-label={`${comment.isLiked ? 'Unlike' : 'Like'} comment, ${comment.likeCount} likes`}
        aria-pressed={comment.isLiked}
      >
        <span className={comment.isLiked ? 'text-rose-400' : ''}>
          {comment.isLiked ? '♥' : '♡'}
        </span>
        <span className="text-[10px] tabular-nums">{comment.likeCount}</span>
      </button>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            type="button"
            className="absolute inset-0 z-40 cursor-default bg-black/55"
            aria-label="Close comments"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reels-comments-title"
            className="absolute bottom-0 left-0 right-0 z-50 flex max-h-[78vh] min-h-[52vh] flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#17171d] text-white shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', ...spring.snappy }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.65 }}
            dragMomentum={false}
            data-reel-gesture-ignore
            onClick={(event) => event.stopPropagation()}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 750) onClose();
            }}
          >
            <button
              type="button"
              className="mx-auto mt-2 flex h-7 w-16 items-center justify-center touch-none"
              aria-label="Drag down to close comments"
              onPointerDown={(event) => dragControls.start(event)}
            >
              <span className="h-1 w-10 rounded-full bg-white/30" />
            </button>

            <div className="flex items-center justify-between border-b border-white/10 px-4 pb-3 pt-1">
              <span className="w-10" aria-hidden="true" />
              <h2 id="reels-comments-title" className="text-sm font-semibold">
                Comments
                {!loading && (
                  <span className="ml-1.5 font-normal text-white/50">{totalCommentCount}</span>
                )}
              </h2>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/65 hover:bg-white/10 hover:text-white"
                onClick={onClose}
                aria-label="Close comments"
              >
                ✕
              </button>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
              role="list"
              aria-label="Reel comments"
              aria-busy={loading}
            >
              {loading ? (
                <div className="flex h-full min-h-32 items-center justify-center text-xs text-white/55">
                  Loading comments…
                </div>
              ) : error ? (
                <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 text-center">
                  <p className="text-sm text-rose-200">{error}</p>
                  <button
                    type="button"
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                    onClick={onRetry}
                  >
                    Reload
                  </button>
                </div>
              ) : comments.length === 0 ? (
                <div className="flex h-full min-h-40 flex-col items-center justify-center text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-xl">
                    💬
                  </span>
                  <p className="text-sm font-medium text-white/90">
                    No comments yet. Start the conversation.
                  </p>
                  <p className="mt-1 text-xs text-white/45">Be the first to share a thought.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {comments.map((comment) => (
                    <div key={comment.id} className="space-y-3">
                      {renderComment(comment)}
                      {expandedReplies.has(comment.id) && comment.replies.length > 0 && (
                        <div className="space-y-3">
                          {comment.replies.map((reply) => renderComment(reply, true))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-white/10 bg-[#17171d] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
              <div
                className="mb-2 flex items-center justify-between gap-1"
                aria-label="Quick reactions"
              >
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-110 hover:bg-white/10 active:scale-95"
                    onClick={() => appendReaction(emoji)}
                    aria-label={`Add ${emoji} reaction`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {replyTarget && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/65">
                  <span>
                    Replying to <strong className="text-white">@{replyTarget.username}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
                    className="rounded px-2 py-1 hover:bg-white/10"
                    aria-label="Cancel reply"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {pendingAttachment && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                  <img
                    src={pendingAttachment.previewUrl}
                    alt={`${pendingAttachment.kind} preview`}
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{pendingAttachment.file.name}</p>
                    <p className="text-[10px] text-amber-200/80">
                      Local preview only — media upload is not available.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
                    onClick={() => {
                      setPendingAttachment(null);
                      setSubmitError(null);
                    }}
                    aria-label="Remove attachment"
                  >
                    ✕
                  </button>
                </div>
              )}

              {(attachmentError || submitError) && (
                <p className="mb-2 px-1 text-xs text-rose-200" role="alert">
                  {attachmentError || submitError}
                </p>
              )}

              <form className="flex items-end gap-2" onSubmit={(event) => void handleSubmit(event)}>
                <button
                  type="button"
                  className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-[10px] font-bold text-white/70 hover:bg-white/10"
                  onClick={() => gifInputRef.current?.click()}
                  aria-label="Attach a GIF"
                  title="Choose a GIF"
                >
                  GIF
                </button>
                <button
                  type="button"
                  className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-base text-white/70 hover:bg-white/10"
                  onClick={() => photoInputRef.current?.click()}
                  aria-label="Attach a photo"
                  title="Choose a photo"
                >
                  ▣
                </button>
                <input
                  ref={gifInputRef}
                  type="file"
                  accept="image/gif"
                  className="hidden"
                  onChange={(event) => handlePickAttachment(event, 'gif')}
                  aria-label="Choose a GIF file"
                />
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handlePickAttachment(event, 'photo')}
                  aria-label="Choose a photo file"
                />
                <div className="flex min-h-11 min-w-0 flex-1 items-end rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 focus-within:border-violet-400/60">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={
                      replyTarget ? `Reply to @${replyTarget.username}…` : 'Add a comment…'
                    }
                    aria-label={replyTarget ? 'Write a reply' : 'Add a reel comment'}
                    className="max-h-24 min-h-7 flex-1 resize-y bg-transparent py-1 text-sm text-white outline-none placeholder:text-white/40"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!draft.trim() || isSubmitting}
                  className="mb-1 min-h-9 shrink-0 rounded-full px-2.5 text-sm font-semibold text-violet-300 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting ? 'Posting…' : 'Post'}
                </button>
              </form>
              <p className="sr-only">Reel {reelId}</p>
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}

export default ReelsCommentsSheet;
