'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell } from '../../../components/AppShell';
import { ErrorState, EmptyState, Skeleton } from '@quant/shared-ui';
import { AppSidebar } from '../../../components/AppSidebar';
import { PageTransition } from '../../../components/PageTransition';
import { useThread } from '../../../hooks/useThread';
import { apiClient } from '../../../services/api-client';
import type { Email } from '../../../types';
import { showToast } from '../../../components/InboxToast';
import { IdentityAvatar } from '../../../components/IdentityAvatar';
import { PostcardReader } from '../../../components/postcard/PostcardReader';
import { EmailReaderHeader } from '../../../components/EmailReaderHeader';
import { EmailLetterCard } from '../../../components/EmailLetterCard';
import { QuantyCopilotDrawer } from '../../../components/QuantyCopilotDrawer';

function formatMessageDate(value?: string | Date): string {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const rawThreadId = (params?.id as string) || '';
  const threadId = rawThreadId === 'null' || rawThreadId === 'undefined' ? '' : rawThreadId;
  const { data: thread, isLoading, error, refetch } = useThread(threadId);

  const [isQuantyOpen, setIsQuantyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [showReplyBox, setShowReplyBox] = useState(false);

  // Accordion state: track expanded message indices
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [expandedDetailsIndices, setExpandedDetailsIndices] = useState<Set<number>>(new Set());

  // Initialize latest message as expanded
  useEffect(() => {
    if (thread?.messages && thread.messages.length > 0) {
      setExpandedIndices(new Set([thread.messages.length - 1]));
    }
  }, [thread?.messages?.length]);

  const toggleMessageExpand = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleDetailsExpand = (index: number) => {
    setExpandedDetailsIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  useEffect(() => {
    if (!threadId) router.replace('/');
  }, [threadId, router]);

  useEffect(() => {
    const messages = thread?.messages;
    if (!messages || messages.length === 0) return;
    const unread = messages.filter((m: Email) => !m.isRead);
    if (unread.length === 0) return;
    void Promise.all(unread.map((m: Email) => apiClient.markAsRead(m.id).catch(() => null)));
  }, [thread]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        void handleArchive();
      } else if (e.key === '#') {
        e.preventDefault();
        void handleDelete();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void handleStar();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        router.push('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [thread, router]);

  const handleArchive = useCallback(async () => {
    if (!thread?.messages?.[0]) return;
    await apiClient.archiveEmail(thread.messages[0].id);
    showToast({ text: 'Conversation archived', type: 'info' });
    router.push('/');
  }, [thread, router]);

  const handleStar = useCallback(async () => {
    if (!thread?.messages?.[0]) return;
    await apiClient.toggleStar(thread.messages[0].id);
    showToast({
      text: thread.isStarred ? 'Conversation unstarred' : 'Conversation starred',
      type: 'info',
    });
    refetch();
  }, [thread, refetch]);

  const handleDelete = useCallback(async () => {
    if (!thread?.messages?.[0]) return;
    await apiClient.deleteEmail(thread.messages[0].id);
    showToast({ text: 'Conversation moved to trash', type: 'info' });
    router.push('/');
  }, [thread, router]);

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || isSendingReply) return;
    setIsSendingReply(true);
    setReplyError(null);
    try {
      const replyTarget =
        thread?.messages && thread.messages.length > 0
          ? thread.messages[thread.messages.length - 1].id
          : threadId;
      const res = await apiClient.replyToEmail(replyTarget, replyText);
      if (!res.success) {
        setReplyError(res.error?.message || 'Failed to send reply');
        return;
      }
      setReplyText('');
      setShowReplyBox(false);
      showToast({ text: 'Reply sent successfully', type: 'success' });
      refetch();
    } catch {
      setReplyError('Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  }, [replyText, isSendingReply, thread, threadId, refetch]);

  if (!threadId) {
    return (
      <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
        <PageTransition className="workspace-page thread-workspace flex flex-col h-full">
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-sm text-zinc-400">Taking you back to your inbox…</p>
          </div>
        </PageTransition>
      </AppShell>
    );
  }

  const primaryMessage = thread?.messages?.[0];
  const senderName = primaryMessage?.from?.name || primaryMessage?.from?.email || 'Sender';
  const senderEmail = primaryMessage?.from?.email || '';

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page thread-workspace flex flex-col h-full bg-[#0a0d14]">
        {/* Top Header Action Bar (Clean Gmail Layout) */}
        <EmailReaderHeader
          subject={thread?.subject || '(No Subject)'}
          senderName={senderName}
          senderEmail={senderEmail}
          category="Inbox"
          isStarred={thread?.isStarred || false}
          onBack={() => router.push('/')}
          onOpenQuanty={() => setIsQuantyOpen(true)}
          onArchive={() => void handleArchive()}
          onDelete={() => void handleDelete()}
          onToggleStar={() => void handleStar()}
        />

        {/* Main Reading Canvas */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 max-w-4xl mx-auto w-full">
          {isLoading && (
            <div className="space-y-4 pt-2">
              <Skeleton variant="rect" width="70%" height="32px" />
              <Skeleton variant="rect" width="100%" height="280px" />
            </div>
          )}

          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
          {!isLoading && !error && !thread && (
            <EmptyState title="Thread not found" description="This thread may have been deleted" />
          )}

          {!isLoading && !error && thread && (
            <>
              {/* Subject Title & Category Badges Row (Gmail standard) */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800/80">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight break-words">
                      {thread.subject || '(No Subject)'}
                    </h1>
                    <span className="px-2 py-0.5 rounded-full bg-blue-600/20 border border-blue-500/30 text-[11px] font-semibold text-blue-400">
                      Inbox
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStar}
                  className={`p-2 rounded-xl transition-all active:scale-95 shrink-0 ${
                    thread.isStarred
                      ? 'text-amber-400 bg-amber-400/10'
                      : 'text-zinc-500 hover:text-amber-300 hover:bg-zinc-800'
                  }`}
                  title={thread.isStarred ? 'Starred' : 'Not starred'}
                >
                  <svg
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill={thread.isStarred ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              </div>

              {/* Messages Stack */}
              <div className="space-y-4 pt-1">
                {thread.messages?.map((message: Email, index: number) => {
                  const isPostcard = message.bodyText?.includes('<!-- QUANTMAIL_POSTCARD:');
                  const isExpanded = expandedIndices.has(index);
                  const isDetailsExpanded = expandedDetailsIndices.has(index);
                  const isSenderSelf = message.from?.email?.toLowerCase().includes('me') || false;
                  const isShortChat = (message.bodyText?.length || 0) < 140 && !isPostcard;

                  return (
                    <div key={message.id} className="w-full">
                      {!isExpanded ? (
                        /* Collapsed 1-Line Strip */
                        <div
                          onClick={() => toggleMessageExpand(index)}
                          className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-zinc-800 bg-[#121622]/90 hover:bg-zinc-800/80 cursor-pointer w-full transition-all shadow-sm select-none"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <IdentityAvatar
                              name={message.from?.name || message.from?.email || ''}
                              size="sm"
                            />
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold text-white truncate">
                                {message.from?.name || message.from?.email}
                              </span>
                              <span className="text-xs text-zinc-400 truncate max-w-xs sm:max-w-md">
                                — {message.snippet}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-zinc-500 font-mono">
                              {formatMessageDate(message.receivedAt)}
                            </span>
                            <svg
                              className="size-4 text-zinc-500"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </div>
                        </div>
                      ) : (
                        /* Expanded Full Message */
                        <div className="rounded-2xl sm:rounded-3xl border border-zinc-800/90 bg-[#10141d] shadow-xl overflow-hidden">
                          {/* Sender Row (Gmail Style) */}
                          <div className="flex items-start justify-between gap-3 p-4 sm:p-5 pb-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <IdentityAvatar
                                name={message.from?.name || message.from?.email || ''}
                                size="md"
                              />

                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-white">
                                    {message.from?.name || message.from?.email || 'Sender'}
                                  </span>
                                  <span className="text-xs text-zinc-400 font-mono">
                                    {formatMessageDate(message.receivedAt)}
                                  </span>
                                </div>

                                {/* "to me ⌵" Accordion Trigger */}
                                <button
                                  type="button"
                                  onClick={() => toggleDetailsExpand(index)}
                                  className="group inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 text-left pt-0.5 font-mono"
                                >
                                  <span>to me</span>
                                  <svg
                                    className={`size-3 transition-transform ${
                                      isDetailsExpanded ? 'rotate-180' : ''
                                    }`}
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                  >
                                    <path d="m6 9 6 6 6-6" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {/* Right Action Icons: Emoji, Reply, More */}
                            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowReplyBox(true);
                                  setTimeout(
                                    () => document.getElementById('inline-reply-input')?.focus(),
                                    100,
                                  );
                                }}
                                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                                title="Reply"
                              >
                                <svg
                                  className="size-4.5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.2"
                                >
                                  <path d="M9 14L4 9l5-5" />
                                  <path d="M4 9h11a5 5 0 015 5v5" />
                                </svg>
                              </button>

                              {/* Message Collapse Toggle Chevron */}
                              <button
                                type="button"
                                onClick={() => toggleMessageExpand(index)}
                                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                                title="Collapse message"
                              >
                                <svg
                                  className="size-4.5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.2"
                                >
                                  <path d="m18 15-6-6-6 6" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Expandable "to me ⌵" Details Box */}
                          <AnimatePresence>
                            {isDetailsExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="px-4 sm:px-5 pb-3"
                              >
                                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-3.5 text-xs text-zinc-300 font-mono space-y-1.5">
                                  <div className="flex">
                                    <span className="w-20 text-zinc-500">From:</span>
                                    <span className="text-white font-medium">
                                      {message.from?.name} &lt;{message.from?.email}&gt;
                                    </span>
                                  </div>
                                  <div className="flex">
                                    <span className="w-20 text-zinc-500">To:</span>
                                    <span className="text-zinc-300">me</span>
                                  </div>
                                  <div className="flex">
                                    <span className="w-20 text-zinc-500">Date:</span>
                                    <span className="text-zinc-300">
                                      {message.receivedAt
                                        ? new Date(message.receivedAt).toLocaleString()
                                        : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="flex">
                                    <span className="w-20 text-zinc-500">Security:</span>
                                    <span className="text-emerald-400 flex items-center gap-1">
                                      <span>🔐</span>
                                      <span>
                                        Standard Encryption (TLS 1.3 · E2EE Authenticated)
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Email Body: Postcard, Luxury Letterhead, or Chat Bubble */}
                          <div className="p-3 sm:p-5 pt-0">
                            {isPostcard ? (
                              <PostcardReader email={message} />
                            ) : isShortChat ? (
                              <div
                                className={`rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                                  isSenderSelf
                                    ? 'bg-[#1a73e8] text-white ml-auto max-w-[88%]'
                                    : 'bg-[#1a1e2a] border border-zinc-800 text-zinc-200'
                                }`}
                              >
                                <p className="whitespace-pre-wrap">
                                  {message.bodyText || message.snippet}
                                </p>
                              </div>
                            ) : (
                              <EmailLetterCard email={message} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bottom Unified Quick Reply Area (Gmail Style) */}
              <div className="pt-2">
                {!showReplyBox ? (
                  <div className="flex items-center gap-2.5 p-2 rounded-2xl border border-zinc-800 bg-[#121622]/90 shadow-md">
                    <button
                      type="button"
                      onClick={() => {
                        setShowReplyBox(true);
                        setTimeout(
                          () => document.getElementById('inline-reply-input')?.focus(),
                          100,
                        );
                      }}
                      className="flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-xs text-zinc-400 text-left border border-zinc-800 transition-all cursor-text"
                    >
                      <svg
                        className="size-4 text-zinc-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M9 14L4 9l5-5" />
                        <path d="M4 9h11a5 5 0 015 5v5" />
                      </svg>
                      <span>Reply to this conversation…</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/compose?forward=${primaryMessage?.id || thread.id}`)
                      }
                      className="px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 transition-all"
                    >
                      Forward
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsQuantyOpen(true)}
                      className="p-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 transition-all"
                      title="Ask Quanty AI"
                    >
                      ✨
                    </button>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-zinc-800 bg-[#10141d] p-4 sm:p-5 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        <span>↩</span>
                        <span>Reply</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowReplyBox(false)}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                    </div>

                    <textarea
                      id="inline-reply-input"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write your reply here…"
                      rows={4}
                      className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#64b5f6] focus:ring-1 focus:ring-[#64b5f6]/40 transition-all resize-none shadow-inner leading-relaxed"
                    />

                    {replyError && <p className="text-xs text-rose-400">{replyError}</p>}

                    <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                      <button
                        type="button"
                        onClick={() => setIsQuantyOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 transition-all"
                      >
                        <span>✨</span>
                        <span>Draft with Quanty AI</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/compose?replyTo=${primaryMessage?.id || thread.id}`)
                          }
                          className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all"
                        >
                          Full Composer
                        </button>

                        <button
                          type="button"
                          onClick={handleSendReply}
                          disabled={!replyText.trim() || isSendingReply}
                          className="px-4 py-2 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-40"
                        >
                          {isSendingReply ? 'Sending…' : 'Send'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Quanty Assistant Bottom Sheet */}
        <QuantyCopilotDrawer
          isOpen={isQuantyOpen}
          onClose={() => setIsQuantyOpen(false)}
          contextEmail={primaryMessage}
          contextThreadSubject={thread?.subject}
          onInsertReply={(text) => {
            setReplyText(text);
            setShowReplyBox(true);
          }}
        />
      </PageTransition>
    </AppShell>
  );
}
