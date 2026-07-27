'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell, Card, Avatar, Badge, Button, Skeleton } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { AppSidebar } from '../../../components/AppSidebar';
import { PageTransition } from '../../../components/PageTransition';
import { useThread } from '../../../hooks/useThread';
import { apiClient } from '../../../services/api-client';
import {
  expandCollapseVariants,
  attachmentItemVariants,
  listContainerVariants,
} from '../../../lib/motion-variants';
import type { Email, EmailAttachment } from '../../../types';

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

function InlineReply({ threadId, onSent }: { threadId: string; onSent: () => void }) {
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await apiClient.replyToEmail(threadId, replyText);
      setReplyText('');
      onSent();
    } finally {
      setSending(false);
    }
  }, [replyText, threadId, onSent]);

  return (
    <div className="mt-4 p-4 border border-[var(--quant-border)] rounded-lg bg-[var(--quant-muted)]/50">
      <textarea
        className="w-full min-h-[80px] p-3 text-sm bg-[var(--quant-background)] border border-[var(--quant-border)] rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-[var(--quant-primary)]"
        placeholder="Write a quick reply..."
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
      />
      <div className="flex items-center gap-2 mt-2">
        <Button variant="primary" onClick={handleSendReply} disabled={sending || !replyText.trim()}>
          {sending ? 'Sending...' : 'Send Reply'}
        </Button>
        <span className="text-xs text-[var(--quant-muted-foreground)]">
          Press Enter to type, Cmd+Enter to send
        </span>
      </div>
    </div>
  );
}

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const threadId = (params?.id as string) || '';
  const { data: thread, isLoading, error, refetch } = useThread(threadId);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

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

  const handleReply = useCallback(() => {
    setShowReplyForm((prev) => !prev);
  }, []);

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || isSendingReply) return;
    setIsSendingReply(true);
    setReplyError(null);
    try {
      const res = await apiClient.replyToEmail(threadId, replyText);
      if (!res.success) {
        setReplyError(res.error?.message || 'Failed to send reply');
        return;
      }
      setReplyText('');
      setShowReplyForm(false);
      refetch();
    } catch {
      setReplyError('Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  }, [replyText, isSendingReply, threadId, refetch]);

  const handleSummarize = useCallback(async () => {
    if (!thread?.messages?.[0] || isSummarizing) return;
    setIsSummarizing(true);
    setSummarizeError(null);
    try {
      const res = await apiClient.aiSummarize(thread.messages[0].id);
      if (!res.success) {
        setSummarizeError(res.error?.message || 'Failed to summarize thread');
        return;
      }
      if (res.data?.summary) {
        setSummary(res.data.summary);
        setShowSummary(true);
      }
    } catch {
      setSummarizeError('Failed to summarize thread');
    } finally {
      setIsSummarizing(false);
    }
  }, [thread, isSummarizing]);

  const handleForward = useCallback(
    (emailId: string) => {
      router.push(`/compose?forward=${emailId}`);
    },
    [router],
  );

  const handleAISummarize = useCallback(async () => {
    if (!thread?.messages?.[0]) return;
    setAiSummarizing(true);
    try {
      const response = await apiClient.aiSummarize(thread.messages[0].id);
      if (response.success && response.data) {
        setAiSummary(response.data.summary);
      }
    } finally {
      setAiSummarizing(false);
    }
  }, [thread]);

  const isExpanded = (index: number, total: number) => {
    if (index === total - 1) return true;
    return expandedMessages.has(index);
  };

  return (
    <AppShell sidebar={<AppSidebar />} className="quantmail-shell">
      <PageTransition className="workspace-page thread-workspace flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center gap-2 p-4 border-b border-[var(--quant-border)]">
          <Button variant="secondary" onClick={() => router.push('/')}>
            Back
          </Button>
          {thread && (
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {/* AI Summarize chip (gradient) */}
              <button
                className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-[rgba(255,153,51,0.22)] bg-[rgba(255,153,51,0.08)] px-3 py-1.5 text-xs font-medium text-[var(--quant-primary)] transition-colors hover:bg-[rgba(255,153,51,0.16)]"
                onClick={handleAISummarize}
                disabled={aiSummarizing}
              >
                <span>{aiSummarizing ? '\u2699\uFE0F' : '\u2728'}</span>
                {aiSummarizing ? 'Summarizing...' : 'AI Summarize'}
              </button>
              {/* Standard Summarize button */}
              <Button variant="secondary" onClick={handleSummarize} disabled={isSummarizing}>
                {isSummarizing ? 'Summarizing...' : 'Summarize'}
              </Button>
              <Button variant="secondary" onClick={handleArchive}>
                Archive
              </Button>
              <Button variant="secondary" onClick={handleStar}>
                {thread.isStarred ? 'Unstar' : 'Star'}
              </Button>
              <Button variant="secondary" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* AI Summary banner */}
        <AnimatePresence>
          {aiSummary && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', ...spring.gentle }}
              className="border-b border-[var(--quant-border)] bg-gradient-to-r from-[rgba(255,153,51,0.055)] to-[rgba(19,136,8,0.05)]"
            >
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-[var(--quant-primary)]">
                    AI Summary
                  </span>
                  <button
                    className="text-xs text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] min-h-[44px] min-w-[44px] flex items-center justify-center"
                    onClick={() => setAiSummary(null)}
                  >
                    Dismiss
                  </button>
                </div>
                <p className="text-sm text-[var(--quant-foreground)]">{aiSummary}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
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
              {/* Summarize error */}
              {summarizeError && (
                <Card padding="md" className="mb-4 bg-red-50 border-red-200">
                  <p className="text-sm text-red-600">{summarizeError}</p>
                </Card>
              )}
              {/* AI Summary Card from main */}
              {summary && (
                <Card padding="md" className="mb-4 bg-[var(--quant-muted)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">AI Summary</span>
                    <Button variant="secondary" onClick={() => setShowSummary((s) => !s)}>
                      {showSummary ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  {showSummary && (
                    <p className="text-sm text-[var(--quant-muted-foreground)] leading-relaxed">
                      {summary}
                    </p>
                  )}
                </Card>
              )}

              <h1 className="text-xl md:text-2xl font-bold mb-4">{thread.subject}</h1>
              <div className="flex items-center gap-2 mb-6 text-sm text-[var(--quant-muted-foreground)]">
                <span>{thread.messageCount} messages</span>
                <span>-</span>
                <span>{thread.participants?.map((p) => p.name || p.email).join(', ')}</span>
              </div>

              <div className="space-y-4">
                {thread.messages?.map((message: Email, index: number) => {
                  const expanded = isExpanded(index, thread.messages.length);
                  const parsed = parseBodyWithQuotes(message.bodyText || message.snippet || '');

                  return (
                    <Card key={message.id} padding="none" className="overflow-hidden">
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[var(--quant-muted)]"
                        onClick={() => toggleMessage(index)}
                      >
                        <Avatar
                          src={undefined}
                          name={message.from?.name || message.from?.email || '?'}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {message.from?.name || message.from?.email}
                            </span>
                            {!message.isRead && <Badge variant="info">New</Badge>}
                          </div>
                          {!expanded && (
                            <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
                              {message.snippet}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-[var(--quant-muted-foreground)] whitespace-nowrap">
                          {message.receivedAt
                            ? new Date(message.receivedAt).toLocaleDateString()
                            : ''}
                        </span>
                      </div>
                      {expanded && (
                        <div className="px-4 pb-4 border-t border-[var(--quant-border)]">
                          <div className="pt-4 text-sm leading-relaxed whitespace-pre-wrap">
                            {parsed.regular}
                          </div>

                          {/* Collapsible quoted text */}
                          {parsed.quoted && <QuotedText text={parsed.quoted} />}

                          {/* Attachment gallery */}
                          <AttachmentGallery attachments={message.attachments} />

                          <div className="flex gap-2 mt-4">
                            <Button variant="secondary" onClick={handleReply}>
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

              {/* Inline quick-reply */}
              <InlineReply threadId={threadId} onSent={() => refetch()} />

              {/* Inline Reply Form (toggleable with more features) */}
              {showReplyForm && (
                <div className="mt-4">
                  <Card padding="md">
                    {replyError && <p className="text-sm text-red-600 mb-2">{replyError}</p>}
                    <textarea
                      className="w-full min-h-[120px] p-3 rounded-md border border-[var(--quant-border)] bg-[var(--quant-background)] text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[var(--quant-primary)]"
                      placeholder="Write your reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="primary"
                        onClick={handleSendReply}
                        disabled={isSendingReply || !replyText.trim()}
                      >
                        {isSendingReply ? 'Sending...' : 'Send Reply'}
                      </Button>
                      <Button variant="secondary" onClick={() => setShowReplyForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </Card>
                </div>
              )}

              {/* Reply footer */}
              {!showReplyForm && (
                <div className="mt-6 pt-4 border-t border-[var(--quant-border)]">
                  <Button variant="primary" onClick={handleReply}>
                    Reply to thread
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
