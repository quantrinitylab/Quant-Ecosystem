'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell } from '../../../components/AppShell';
import { ErrorState, EmptyState, Skeleton, Button } from '@quant/shared-ui';
import { AppSidebar } from '../../../components/AppSidebar';
import { PageTransition } from '../../../components/PageTransition';
import { useThread } from '../../../hooks/useThread';
import { apiClient } from '../../../services/api-client';
import type { Email } from '../../../types';
import { showToast } from '../../../components/InboxToast';
import { IdentityAvatar } from '../../../components/IdentityAvatar';
import { PostcardReader } from '../../../components/postcard/PostcardReader';
import { EmailReaderHeader } from '../../../components/EmailReaderHeader';
import { EmailSenderHeader } from '../../../components/EmailSenderHeader';
import { EmailLetterCard } from '../../../components/EmailLetterCard';
import { EmailBottomBar } from '../../../components/EmailBottomBar';
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

  // Accordion state: track expanded message indices
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());

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
  const senderName = primaryMessage?.from?.name || primaryMessage?.from?.email || '';
  const senderEmail = primaryMessage?.from?.email || '';

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page thread-workspace flex flex-col h-full">
        {/* Top Action Header Bar with Back, Quanty AI, Archive, Delete, Star, Red Important */}
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

        {/* Main Reading Canvas Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 max-w-4xl mx-auto w-full">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton variant="rect" width="60%" height="36px" />
              <Skeleton variant="rect" width="100%" height="350px" />
            </div>
          )}

          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
          {!isLoading && !error && !thread && (
            <EmptyState title="Thread not found" description="This thread may have been deleted" />
          )}

          {!isLoading && !error && thread && (
            <>
              {/* Messages Stack (Gmail-style Accordion Collapse + Chat/Email Hybrid) */}
              <div className="space-y-3.5">
                {thread.messages?.map((message: Email, index: number) => {
                  const isPostcard = message.bodyText?.includes('<!-- QUANTMAIL_POSTCARD:');
                  const isExpanded = expandedIndices.has(index);
                  const isSenderSelf = message.from?.email?.toLowerCase().includes('me') || false;
                  const isShortChat = (message.bodyText?.length || 0) < 120 && !isPostcard;

                  return (
                    <div
                      key={message.id}
                      className={`flex flex-col transition-all ${
                        isSenderSelf ? 'items-end' : 'items-start'
                      } w-full`}
                    >
                      {/* Collapsed 1-Line Strip Header */}
                      {!isExpanded ? (
                        <div
                          onClick={() => toggleMessageExpand(index)}
                          className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-zinc-800/80 bg-[#121622]/90 hover:bg-zinc-800/80 cursor-pointer w-full transition-all shadow-sm select-none"
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
                            <span className="text-xs text-zinc-500">▼</span>
                          </div>
                        </div>
                      ) : (
                        /* Expanded Full Message (Letterhead or Chat Bubble) */
                        <div className="w-full space-y-2">
                          {/* Accordion Collapse Trigger Bar */}
                          <div
                            onClick={() => toggleMessageExpand(index)}
                            className="flex items-center justify-between px-3 py-1 cursor-pointer select-none text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            <span className="text-[11px] font-mono">
                              Message {index + 1} of {thread.messages?.length}
                            </span>
                            <span className="text-[11px] text-amber-400 hover:underline flex items-center gap-1">
                              <span>▲ Click to collapse</span>
                            </span>
                          </div>

                          {/* Chat Bubble for Short Messages or Luxury Letterhead for Formal Emails */}
                          {isShortChat ? (
                            <div
                              className={`max-w-[85%] rounded-3xl p-4 sm:p-5 shadow-xl ${
                                isSenderSelf
                                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-none ml-auto'
                                  : 'bg-[#141722] border border-zinc-800 text-zinc-200 rounded-bl-none'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3 mb-1.5 pb-1 border-b border-white/10">
                                <span className="text-xs font-bold">
                                  {message.from?.name || message.from?.email}
                                </span>
                                <span className="text-[10px] opacity-70 font-mono">
                                  {formatMessageDate(message.receivedAt)}
                                </span>
                              </div>
                              <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                                {message.bodyText || message.snippet}
                              </p>
                            </div>
                          ) : (
                            <div className="rounded-3xl border border-zinc-800 bg-[#10131c] shadow-2xl overflow-hidden">
                              {/* Sender Header Row with Expandable "to me ⌵" */}
                              <EmailSenderHeader
                                email={message}
                                onQuickReply={() => {
                                  const target = document.getElementById('inline-reply-input');
                                  target?.focus();
                                }}
                              />

                              {/* Message Content: Postcard or Luxury Letterhead */}
                              <div className="p-3 sm:p-6">
                                {isPostcard ? (
                                  <PostcardReader email={message} />
                                ) : (
                                  <EmailLetterCard email={message} />
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Instant Inline Reply & Chat Input Bar */}
              <div className="rounded-3xl border border-zinc-800 bg-[#10131c] p-4 sm:p-5 space-y-3 shadow-xl mt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <span>↩</span>
                    <span>Quick Reply</span>
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Press Ctrl+Enter to send instantly
                  </span>
                </div>

                <textarea
                  id="inline-reply-input"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void handleSendReply();
                    }
                  }}
                  placeholder="Write your reply or ask Quanty AI to draft one…"
                  rows={3}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/40 transition-all resize-none shadow-inner"
                />

                {replyError && <p className="text-xs text-rose-400">{replyError}</p>}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setIsQuantyOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 transition-all"
                  >
                    <span>✨</span>
                    <span>Draft reply with Quanty AI</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/compose?replyTo=${primaryMessage?.id || thread.id}`)
                      }
                      className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all"
                    >
                      Open Full Composer
                    </button>

                    <Button
                      variant="primary"
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || isSendingReply}
                    >
                      {isSendingReply ? 'Sending…' : 'Send reply'}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sticky Bottom Bar */}
        {thread && (
          <EmailBottomBar
            onReply={() => {
              const target = document.getElementById('inline-reply-input');
              target?.focus();
            }}
            onForward={() => router.push(`/compose?forward=${primaryMessage?.id || thread.id}`)}
          />
        )}

        {/* Interactive Quanty Assistant Slide-Up Drawer */}
        <QuantyCopilotDrawer
          isOpen={isQuantyOpen}
          onClose={() => setIsQuantyOpen(false)}
          contextEmail={primaryMessage}
          contextThreadSubject={thread?.subject}
          onInsertReply={(text) => setReplyText(text)}
        />
      </PageTransition>
    </AppShell>
  );
}
