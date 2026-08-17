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

// ---------------------------------------------------------------------------
// Compact toolbar icons (consistent with the inbox icon language)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Shared relative-time formatter (mirrors the inbox formatReceivedAt)
// ---------------------------------------------------------------------------
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
  // Same calendar year: omit year
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Thread body with expand-collapse when text is long
// ---------------------------------------------------------------------------
const PREVIEW_LIMIT = 400;

function BodyWithExpand({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(text.length <= PREVIEW_LIMIT);
  const shown = expanded ? text : text.slice(0, PREVIEW_LIMIT);

  return (
    <div className="pt-4 text-sm leading-relaxed whitespace-pre-wrap">
      {shown}
      {!expanded && <span aria-hidden="true">…</span>}
      {text.length > PREVIEW_LIMIT && (
        <button
          type="button"
          className="ml-2 text-xs text-[var(--quant-primary)] hover:underline min-h-[44px]"
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
        className="text-xs min-h-[44px] text-[var(--quant-primary)] hover:underline flex items-center gap-1"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Hide' : 'Show'} quoted text
        <span className="text-[10px]">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            variants={expandCollapseVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="pl-3 border-l-2 border-[var(--quant-muted-foreground)]/30 mt-2 text-sm text-[var(--quant-muted-foreground)] whitespace-pre-wrap"
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
      <p className="text-xs font-medium text-[var(--quant-muted-foreground)] mb-2">
        Attachments ({attachments.length})
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {attachments.map((att) => (
          <motion.div
            key={att.id}
            variants={attachmentItemVariants}
            initial="hidden"
            animate="visible"
            className="flex-shrink-0 w-32 rounded-lg border border-[var(--quant-border)] overflow-hidden hover:shadow-md transition-shadow"
          >
            {isImage(att.mimeType) ? (
              <div className="w-32 h-24 bg-[var(--quant-muted)] flex items-center justify-center">
                <span className="text-2xl">&#128247;</span>
              </div>
            ) : (
              <div className="w-32 h-24 bg-[var(--quant-muted)] flex items-center justify-center">
                <span className="text-2xl">&#128196;</span>
              </div>
            )}
            <div className="p-2">
              <p className="text-xs font-medium truncate" title={att.filename}>
                {att.filename}
              </p>
              <p className="text-[10px] text-[var(--quant-muted-foreground)]">
                {(att.size / 1024).toFixed(1)} KB
              </p>
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
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) router.replace('/');
  }, [threadId, router]);

  // Opening a thread marks its unread messages as read (Gmail behaviour) so
  // the inbox unread indicators clear the moment the user has read the mail.
  useEffect(() => {
    const messages = thread?.messages;
    if (!messages || messages.length === 0) return;
    const unread = messages.filter((m: Email) => !m.isRead);
    if (unread.length === 0) return;
    void Promise.all(unread.map((m: Email) => apiClient.markAsRead(m.id).catch(() => null)));
  }, [thread]);

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
    router.push('/');
  }, [thread, router]);

  const handleStar = useCallback(async () => {
    if (!thread?.messages?.[0]) return;
    await apiClient.toggleStar(thread.messages[0].id);
    refetch();
  }, [thread, refetch]);

  const handleDelete = useCallback(async () => {
    if (!thread?.messages?.[0]) return;
    await apiClient.deleteEmail(thread.messages[0].id);
    router.push('/');
  }, [thread, router]);

  const handleOpenReplyComposer = useCallback(() => setShowReplyComposer(true), []);
  const handleCloseReplyComposer = useCallback(() => {
    setShowReplyComposer(false);
    setReplyError(null);
  }, []);

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || isSendingReply) return;
    setIsSendingReply(true);
    setReplyError(null);
    try {
      // Reply to the latest message in the conversation; fall back to the
      // route id (the backend resolves both email ids and thread ids).
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
      setShowReplyComposer(false);
      refetch();
    } catch {
      setReplyError('Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  }, [replyText, isSendingReply, thread, threadId, refetch]);

  const handleSummarize = useCallback(async () => {
    if (!thread?.messages?.[0] || isSummarizing) return;
    setIsSummarizing(true);
    setSummaryError(null);
    try {
      const response = await apiClient.aiSummarize(thread.messages[0].id);
      if (!response.success) {
        setSummaryError(response.error?.message || 'Failed to summarize thread');
        return;
      }
      if (response.data?.summary) {
        setThreadSummary(response.data.summary);
        setIsSummaryVisible(true);
      }
    } catch {
      setSummaryError('Failed to summarize thread');
    } finally {
      setIsSummarizing(false);
    }
  }, [thread, isSummarizing]);

  const handleDismissSummary = useCallback(() => setThreadSummary(null), []);

  const handleForward = useCallback(
    (emailId: string) => router.push(`/compose?forward=${emailId}`),
    [router],
  );

  const isExpanded = (index: number, total: number) =>
    index === total - 1 || expandedMessages.has(index);

  if (!threadId) {
    return (
      <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
        <PageTransition className="workspace-page thread-workspace flex flex-col h-full">
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-sm text-[var(--quant-muted-foreground)]">
              Taking you back to your inbox…
            </p>
          </div>
        </PageTransition>
      </AppShell>
    );
  }

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page thread-workspace flex flex-col h-full">
        {/* Toolbar — one compact icon bar; clean on mobile, calm on desktop */}
        <div className="thread-toolbar">
          <button
            type="button"
            className="icon-action"
            onClick={() => router.push('/')}
            aria-label="Back to inbox"
            title="Back to inbox"
          >
            <TbIcon name="back" />
          </button>
          <h1 className="thread-toolbar-title">
            {thread ? thread.subject || '(no subject)' : 'Conversation'}
          </h1>
          {thread && (
            <div className="thread-toolbar-actions">
              <button
                type="button"
                className="icon-action"
                onClick={handleSummarize}
                disabled={isSummarizing}
                aria-label="Summarise thread with QuantAI"
                title="Summarise with QuantAI"
              >
                <TbIcon
                  name="spark"
                  className={
                    isSummarizing ? 'h-[18px] w-[18px] animate-pulse' : 'h-[18px] w-[18px]'
                  }
                />
              </button>
              <button
                type="button"
                className={`icon-action ${thread.isStarred ? 'is-on' : ''}`}
                onClick={handleStar}
                aria-label={thread.isStarred ? 'Unstar conversation' : 'Star conversation'}
                aria-pressed={thread.isStarred}
                title={thread.isStarred ? 'Unstar' : 'Star'}
              >
                <TbIcon name="star" filled={thread.isStarred} />
              </button>
              <button
                type="button"
                className="icon-action"
                onClick={handleArchive}
                aria-label="Archive conversation"
                title="Archive"
              >
                <TbIcon name="archive" />
              </button>
              <button
                type="button"
                className="icon-action icon-action-danger"
                onClick={handleDelete}
                aria-label="Delete conversation"
                title="Delete"
              >
                <TbIcon name="trash" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton variant="rect" width="60%" height="32px" />
              <Skeleton variant="rect" width="100%" height="200px" />
              <Skeleton variant="rect" width="100%" height="200px" />
            </div>
          )}
          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
          {!isLoading && !error && !thread && (
            <EmptyState title="Thread not found" description="This thread may have been deleted" />
          )}

          {!isLoading && !error && thread && (
            <>
              {summaryError && (
                <Card padding="md" className="mb-4 bg-red-50 border-red-200">
                  <p className="text-sm text-red-600">{summaryError}</p>
                </Card>
              )}

              <AnimatePresence>
                {threadSummary && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', ...spring.gentle }}
                    className="overflow-hidden"
                  >
                    <Card padding="md" className="mb-4 bg-[var(--quant-muted)]">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div>
                          <span className="text-sm font-semibold">AI Summary</span>
                          <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                            Read the thread signal first, then reply, archive, or forward.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => setIsSummaryVisible((v) => !v)}
                          >
                            {isSummaryVisible ? 'Hide' : 'Show'}
                          </Button>
                          <Button variant="secondary" onClick={handleDismissSummary}>
                            Dismiss
                          </Button>
                        </div>
                      </div>
                      {isSummaryVisible && (
                        <p className="text-sm text-[var(--quant-muted-foreground)] leading-relaxed">
                          {threadSummary}
                        </p>
                      )}
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Thread meta (the subject lives in the toolbar now) */}
              <div className="mb-5 flex items-center gap-2 text-sm text-[var(--quant-muted-foreground)]">
                <span>
                  {thread.messageCount} message{thread.messageCount === 1 ? '' : 's'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="truncate">
                  {thread.participants?.map((p: any) => p.name || p.email).join(', ')}
                </span>
              </div>

              {/* Messages */}
              <div className="space-y-4">
                {thread.messages?.map((message: Email, index: number) => {
                  const expanded = isExpanded(index, thread.messages.length);
                  const bodyText = message.bodyText || message.snippet || '';
                  const parsed = parseBodyWithQuotes(bodyText);

                  return (
                    <Card key={message.id} padding="none" className="overflow-hidden">
                      {/* Message header (always visible, click to collapse/expand) */}
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[var(--quant-muted)] select-none"
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                        onClick={() => toggleMessage(index)}
                        onKeyDown={(e) => e.key === 'Enter' && toggleMessage(index)}
                      >
                        <Avatar
                          src={undefined}
                          name={message.from?.name || message.from?.email || 'Unknown'}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">
                              {message.from?.name || message.from?.email || 'Unknown sender'}
                            </span>
                            {!message.isRead && <Badge variant="info">New</Badge>}
                          </div>
                          {!expanded && (
                            <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
                              {message.snippet}
                            </p>
                          )}
                        </div>
                        {/* Consistent relative timestamp */}
                        <time
                          className="text-xs text-[var(--quant-muted-foreground)] whitespace-nowrap"
                          dateTime={
                            message.receivedAt
                              ? new Date(message.receivedAt).toISOString()
                              : undefined
                          }
                          title={
                            message.receivedAt
                              ? new Date(message.receivedAt).toLocaleString()
                              : undefined
                          }
                        >
                          {formatMessageDate(message.receivedAt)}
                        </time>
                      </div>

                      {/* Message body (expanded only) */}
                      {expanded && (
                        <div className="px-4 pb-4 border-t border-[var(--quant-border)]">
                          <BodyWithExpand text={parsed.regular} />
                          {parsed.quoted && <QuotedText text={parsed.quoted} />}
                          <AttachmentGallery attachments={message.attachments} />
                          <div className="flex gap-2 mt-4">
                            <Button variant="secondary" onClick={handleOpenReplyComposer}>
                              Reply
                            </Button>
                            <Button variant="secondary" onClick={() => handleForward(message.id)}>
                              Forward
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* Reply composer */}
              <div className="mt-6 pt-4 border-t border-[var(--quant-border)]">
                {!showReplyComposer ? (
                  <Button variant="primary" onClick={handleOpenReplyComposer}>
                    Reply to thread
                  </Button>
                ) : (
                  <Card padding="md">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
                          Reply to thread
                        </h2>
                        <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                          Write one clear response, then send or cancel.
                        </p>
                      </div>
                      <Button variant="secondary" onClick={handleCloseReplyComposer}>
                        Cancel
                      </Button>
                    </div>
                    {replyError && <p className="text-sm text-red-600 mb-2">{replyError}</p>}
                    <textarea
                      className="w-full min-h-[120px] p-3 rounded-md border border-[var(--quant-border)] bg-[var(--quant-background)] text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[var(--quant-primary)]"
                      placeholder="Write your reply…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <Button
                        variant="primary"
                        onClick={handleSendReply}
                        disabled={isSendingReply || !replyText.trim()}
                      >
                        {isSendingReply ? 'Sending…' : 'Send Reply'}
                      </Button>
                      <span className="text-xs text-[var(--quant-muted-foreground)]">
                        Keep the reply focused on the next action.
                      </span>
                    </div>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
