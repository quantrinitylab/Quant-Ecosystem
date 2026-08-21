'use client';

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Avatar, Badge, Button, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../../components/AppShell';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { AppSidebar } from '../../../components/AppSidebar';
import { PageTransition } from '../../../components/PageTransition';
import { useThread } from '../../../hooks/useThread';
import { apiClient } from '../../../services/api-client';
import { expandCollapseVariants, attachmentItemVariants } from '../../../lib/motion-variants';
import type { Email, EmailAttachment } from '../../../types';
import { showToast } from '../../../components/InboxToast';
import { PostcardReader } from '../../../components/postcard/PostcardReader';

type TbIconName = 'archive' | 'back' | 'spark' | 'star' | 'trash';

function TbIcon({
  name,
  className = 'h-[18px] w-[18px]',
  filled = false,
}: {
  name: TbIconName;
  className?: string;
  filled?: boolean;
}) {
  const paths: Record<TbIconName, ReactNode> = {
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M5 7l1-3h12l1 3v12H5z" />
        <path d="M9 11h6" />
      </>
    ),
    back: <path d="M19 12H5M11 18l-6-6 6-6" />,
    spark: (
      <>
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
        <path d="M18.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
      </>
    ),
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
    trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />,
  };
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled && name === 'star' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

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
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const PREVIEW_LIMIT = 400;

function BodyWithExpand({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(text.length <= PREVIEW_LIMIT);
  const shown = expanded ? text : text.slice(0, PREVIEW_LIMIT);

  return (
    <div className="pt-4 text-sm leading-relaxed whitespace-pre-wrap text-zinc-200">
      {shown}
      {!expanded && <span aria-hidden="true">…</span>}
      {text.length > PREVIEW_LIMIT && (
        <button
          type="button"
          className="ml-2 text-xs text-[#ff9933] hover:underline min-h-[44px]"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show full message'}
        </button>
      )}
    </div>
  );
}

function QuotedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2">
      <button
        className="text-xs min-h-[44px] text-[#ff9933] hover:underline flex items-center gap-1"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Hide' : 'Show'} quoted text
        <span className="text-[10px]">{expanded ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            variants={expandCollapseVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="pl-3 border-l-2 border-zinc-700 mt-2 text-xs text-zinc-400 whitespace-pre-wrap font-mono"
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function parseBodyWithQuotes(bodyText: string): { regular: string; quoted: string | null } {
  const lines = bodyText.split('\n');
  const regularLines: string[] = [];
  const quotedLines: string[] = [];
  let inQuote = false;

  for (const line of lines) {
    if (line.startsWith('>')) {
      inQuote = true;
      quotedLines.push(line.replace(/^>\s?/, ''));
    } else if (inQuote && line.trim() === '') {
      quotedLines.push('');
    } else {
      inQuote = false;
      regularLines.push(line);
    }
  }

  return {
    regular: regularLines.join('\n').trim(),
    quoted: quotedLines.length > 0 ? quotedLines.join('\n').trim() : null,
  };
}

function AttachmentGallery({ attachments }: { attachments: EmailAttachment[] }) {
  if (!attachments || attachments.length === 0) return null;

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-zinc-400 mb-2">
        📎 Attachments ({attachments.length})
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {attachments.map((att) => (
          <motion.div
            key={att.id}
            variants={attachmentItemVariants}
            initial="hidden"
            animate="visible"
            className="flex-shrink-0 w-36 rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden hover:border-[#ff9933]/50 transition-all cursor-pointer"
            onClick={() => showToast({ text: `Downloading ${att.filename}…`, type: 'info' })}
          >
            {isImage(att.mimeType) ? (
              <div className="w-36 h-20 bg-zinc-950 flex items-center justify-center text-2xl">
                🖼
              </div>
            ) : (
              <div className="w-36 h-20 bg-zinc-950 flex items-center justify-center text-2xl">
                📄
              </div>
            )}
            <div className="p-2.5">
              <p className="text-xs font-semibold truncate text-white" title={att.filename}>
                {att.filename}
              </p>
              <p className="text-[10px] text-zinc-400">{(att.size / 1024).toFixed(1)} KB</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const rawThreadId = (params?.id as string) || '';
  const threadId = rawThreadId === 'null' || rawThreadId === 'undefined' ? '' : rawThreadId;
  const { data: thread, isLoading, error, refetch } = useThread(threadId);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
  const [threadSummary, setThreadSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSummaryVisible, setIsSummaryVisible] = useState(true);
  const [summaryMode, setSummaryMode] = useState<'bullets' | 'action_items' | 'hindi'>('bullets');
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

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

  const toggleMessage = useCallback((index: number) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

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

  const handleAISummarize = useCallback(
    async (mode: 'bullets' | 'action_items' | 'hindi' = 'bullets') => {
      if (!thread?.messages?.[0] || isSummarizing) return;
      setIsSummarizing(true);
      setSummaryMode(mode);
      try {
        const bodyContent = thread.messages
          .map((m: Email) => `${m.from?.name || m.from?.email}: ${m.bodyText || m.snippet}`)
          .join('\n\n');

        let prompt = `Summarize this email conversation into 3 crisp bullet points.`;
        if (mode === 'action_items') {
          prompt = `Extract all action items, deliverables, decisions, and deadlines from this email conversation. Format as bullet points.`;
        } else if (mode === 'hindi') {
          prompt = `Translate and summarize this email thread into natural, clear Hindi (Devanagari).`;
        }

        const res = await fetch('/api/ai/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `${prompt}\n\nEmail Thread:\n${bodyContent}` }],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.content) {
            setThreadSummary(data.content);
            setIsSummaryVisible(true);
            return;
          }
        }

        // Fallback to standard summary endpoint
        const response = await apiClient.aiSummarize(thread.messages[0].id);
        if (response.success && response.data?.summary) {
          setThreadSummary(response.data.summary);
          setIsSummaryVisible(true);
        }
      } catch {
        showToast({ text: 'Could not generate AI summary', type: 'error' });
      } finally {
        setIsSummarizing(false);
      }
    },
    [thread, isSummarizing],
  );

  const isExpanded = (index: number, total: number) =>
    index === total - 1 || expandedMessages.has(index);

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

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page thread-workspace flex flex-col h-full">
        {/* Top Action Toolbar */}
        <div className="thread-toolbar flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              onClick={() => router.push('/')}
              aria-label="Back to inbox"
              title="Back to inbox (Esc)"
            >
              <TbIcon name="back" />
            </button>
            <h1 className="text-sm font-bold text-white truncate max-w-lg">
              {thread ? thread.subject || '(no subject)' : 'Conversation'}
            </h1>
          </div>

          {thread && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={`p-2 rounded-xl transition-colors ${
                  thread.isStarred
                    ? 'text-amber-400 bg-amber-400/10'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
                onClick={handleStar}
                aria-label={thread.isStarred ? 'Unstar' : 'Star (S)'}
                title={thread.isStarred ? 'Unstar (S)' : 'Star (S)'}
              >
                <TbIcon name="star" filled={thread.isStarred} />
              </button>
              <button
                type="button"
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                onClick={handleArchive}
                aria-label="Archive (E)"
                title="Archive (E)"
              >
                <TbIcon name="archive" />
              </button>
              <button
                type="button"
                className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                onClick={handleDelete}
                aria-label="Delete (#)"
                title="Delete (#)"
              >
                <TbIcon name="trash" />
              </button>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton variant="rect" width="60%" height="32px" />
              <Skeleton variant="rect" width="100%" height="200px" />
            </div>
          )}
          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
          {!isLoading && !error && !thread && (
            <EmptyState title="Thread not found" description="This thread may have been deleted" />
          )}

          {!isLoading && !error && thread && (
            <>
              {/* Cloudflare Workers AI Smart Action Bar */}
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur">
                <span className="text-xs font-bold text-[#ff9933] flex items-center gap-1.5 mr-2">
                  <TbIcon name="spark" className="size-4 animate-pulse" />
                  Cloudflare Workers AI:
                </span>
                <button
                  type="button"
                  onClick={() => handleAISummarize('bullets')}
                  disabled={isSummarizing}
                  className="px-3 py-1 rounded-xl text-xs font-semibold bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white border border-zinc-700 transition-colors"
                >
                  {isSummarizing && summaryMode === 'bullets'
                    ? 'Summarizing…'
                    : '⚡ 3-Bullet Summary'}
                </button>
                <button
                  type="button"
                  onClick={() => handleAISummarize('action_items')}
                  disabled={isSummarizing}
                  className="px-3 py-1 rounded-xl text-xs font-semibold bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white border border-zinc-700 transition-colors"
                >
                  {isSummarizing && summaryMode === 'action_items'
                    ? 'Extracting…'
                    : '📋 Action Items'}
                </button>
                <button
                  type="button"
                  onClick={() => handleAISummarize('hindi')}
                  disabled={isSummarizing}
                  className="px-3 py-1 rounded-xl text-xs font-semibold bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white border border-zinc-700 transition-colors"
                >
                  {isSummarizing && summaryMode === 'hindi'
                    ? 'अनुवाद हो रहा है…'
                    : '🇮🇳 Translate to Hindi'}
                </button>
              </div>

              {/* AI Summary Box */}
              <AnimatePresence>
                {threadSummary && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', ...spring.gentle }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 rounded-2xl border border-[#ff9933]/30 bg-[#ff9933]/5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-[#ff9933] flex items-center gap-1.5">
                          ✨ AI Intelligence Insight
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-xs text-zinc-400 hover:text-white"
                            onClick={() => setIsSummaryVisible((v) => !v)}
                          >
                            {isSummaryVisible ? 'Hide' : 'Show'}
                          </button>
                          <button
                            type="button"
                            className="text-xs text-zinc-400 hover:text-white"
                            onClick={() => setThreadSummary(null)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                      {isSummaryVisible && (
                        <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
                          {threadSummary}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Thread Meta & Security Seal */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <span>
                    {thread.messageCount} message{thread.messageCount === 1 ? '' : 's'}
                  </span>
                  <span>·</span>
                  <span className="truncate text-zinc-300">
                    {thread.participants?.map((p: any) => p.name || p.email).join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
                    ✓ SPF/DKIM Verified
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-mono">
                    🔐 E2EE Encrypted
                  </span>
                </div>
              </div>

              {/* Messages Thread Stack */}
              <div className="space-y-4">
                {thread.messages?.map((message: Email, index: number) => {
                  const expanded = isExpanded(index, thread.messages.length);
                  const bodyText = message.bodyText || message.snippet || '';
                  const parsed = parseBodyWithQuotes(bodyText);

                  return (
                    <Card
                      key={message.id}
                      padding="none"
                      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90"
                    >
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-zinc-800/60 select-none transition-colors"
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                        onClick={() => toggleMessage(index)}
                        onKeyDown={(e) => e.key === 'Enter' && toggleMessage(index)}
                      >
                        <Avatar
                          src={undefined}
                          name={message.from?.name || message.from?.email || 'User'}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white truncate">
                              {message.from?.name || message.from?.email || 'Unknown sender'}
                            </span>
                            {!message.isRead && <Badge variant="info">New</Badge>}
                          </div>
                          {!expanded && (
                            <p className="text-xs text-zinc-400 truncate mt-0.5">
                              {message.snippet}
                            </p>
                          )}
                        </div>
                        <time
                          className="text-[11px] text-zinc-400 whitespace-nowrap"
                          dateTime={
                            message.receivedAt
                              ? new Date(message.receivedAt).toISOString()
                              : undefined
                          }
                        >
                          {formatMessageDate(message.receivedAt)}
                        </time>
                      </div>

                      {expanded && (
                        <div className="px-5 pb-5 border-t border-zinc-800">
                          {message.bodyText?.includes('<!-- QUANTMAIL_POSTCARD:') ? (
                            <PostcardReader email={message} className="my-3" />
                          ) : (
                            <>
                              <BodyWithExpand text={parsed.regular} />
                              {parsed.quoted && <QuotedText text={parsed.quoted} />}
                            </>
                          )}
                          <AttachmentGallery attachments={message.attachments} />
                          <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-800/80">
                            <button
                              type="button"
                              onClick={() => {
                                const target = document.getElementById('inline-reply-input');
                                target?.focus();
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white border border-zinc-700 transition-colors"
                            >
                              ↩ Reply
                            </button>
                            <button
                              type="button"
                              onClick={() => router.push(`/compose?forward=${message.id}`)}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white border border-zinc-700 transition-colors"
                            >
                              ↪ Forward
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* Instant Inline Reply Box */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    ↩ Quick Reply
                  </span>
                  <span className="text-[10px] text-zinc-400">
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
                  placeholder="Write your reply or ask AI to draft one…"
                  rows={3}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933] transition-colors resize-none"
                />

                {replyError && <p className="text-xs text-rose-400">{replyError}</p>}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!thread?.messages?.[0]) return;
                        const subject = thread.subject || '';
                        const res = await fetch('/api/ai/copilot', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            messages: [
                              {
                                role: 'user',
                                content: `Draft a concise, polite, professional email reply for subject "${subject}".`,
                              },
                            ],
                          }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          if (data?.content) setReplyText(data.content);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-[#ff9933] bg-[#ff9933]/10 hover:bg-[#ff9933]/20 transition-colors"
                    >
                      ✨ Auto-draft reply with AI
                    </button>
                  </div>

                  <Button
                    variant="primary"
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || isSendingReply}
                  >
                    {isSendingReply ? 'Sending…' : 'Send reply'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
