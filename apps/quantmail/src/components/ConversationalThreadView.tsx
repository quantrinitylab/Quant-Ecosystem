'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../services/api-client';
import type { Email, EmailAttachment, EmailThread } from '../types';
import { showToast } from './InboxToast';
import { IdentityAvatar } from './IdentityAvatar';
import { EmailLetterCard } from './EmailLetterCard';
import { SmartReplySuggestions } from './SmartReplySuggestions';
import { QuantyCopilotDrawer } from './QuantyCopilotDrawer';
import { Quanty } from './Quanty';

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

export interface ConversationalThreadViewProps {
  threadId: string;
  initialThread?: EmailThread | null;
  initialEmails?: Email[];
  subject?: string;
  onClose?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onStarToggle?: (starred: boolean) => void;
  isStarred?: boolean;
  className?: string;
  variant?: 'pane' | 'full';
}

export function ConversationalThreadView({
  threadId,
  initialThread,
  initialEmails = [],
  subject = '(No Subject)',
  onClose,
  onArchive,
  onDelete,
  onStarToggle,
  isStarred = false,
  className = '',
  variant = 'pane',
}: ConversationalThreadViewProps) {
  const router = useRouter();

  // Normalized messages state
  const [messages, setMessages] = useState<Email[]>(() => {
    if (initialEmails && initialEmails.length > 0) return initialEmails;
    if (initialThread?.messages && initialThread.messages.length > 0) return initialThread.messages;
    return [];
  });

  const [threadSubject, setThreadSubject] = useState(
    subject || initialThread?.subject || '(No Subject)',
  );
  const [starred, setStarred] = useState(isStarred || initialThread?.isStarred || false);
  const [isLoading, setIsLoading] = useState(messages.length === 0);

  // Accordion state: Set of message indices that are expanded
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [expandedDetailsIndices, setExpandedDetailsIndices] = useState<Set<number>>(new Set());

  // Quick reply & AI state
  const [quickReplyText, setQuickReplyText] = useState('');
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false);
  const [isQuantyOpen, setIsQuantyOpen] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Attachments in quick reply bar
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ name: string; size: number; dataUrl: string; type: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch thread messages if not pre-populated or update when threadId changes
  useEffect(() => {
    let isMounted = true;
    if (!threadId) return;

    if (initialEmails.length > 0) {
      setMessages(initialEmails);
      setExpandedIndices(new Set([initialEmails.length - 1])); // Expand latest by default
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    apiClient
      .getThread(threadId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          const msgs = (res.data.messages || (res.data as any).emails || []) as Email[];
          if (msgs.length > 0) {
            setMessages(msgs);
            setThreadSubject(res.data.subject || msgs[0]?.subject || '(No Subject)');
            setStarred(res.data.isStarred || false);
            // Default: expand the latest message (or all if short thread)
            if (msgs.length <= 2) {
              setExpandedIndices(new Set(msgs.map((_, i) => i)));
            } else {
              setExpandedIndices(new Set([msgs.length - 1]));
            }
          }
        }
      })
      .catch(() => {
        // Fallback to single email fetch
        apiClient
          .getEmail(threadId)
          .then((emailRes) => {
            if (!isMounted) return;
            if (emailRes.success && emailRes.data) {
              const email = emailRes.data;
              setMessages([email]);
              setThreadSubject(email.subject || '(No Subject)');
              setStarred(email.isStarred || false);
              setExpandedIndices(new Set([0]));
            }
          })
          .catch(() => null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [threadId, initialEmails]);

  // Expand / Collapse Helpers
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

  const expandAll = () => {
    setExpandedIndices(new Set(messages.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedIndices(new Set());
  };

  // Star toggle
  const handleToggleStar = async () => {
    const nextState = !starred;
    setStarred(nextState);
    if (onStarToggle) onStarToggle(nextState);

    const targetId = messages[0]?.id || threadId;
    if (targetId) {
      try {
        await apiClient.toggleStar(targetId);
        showToast({ text: nextState ? 'Thread starred' : 'Thread unstarred', type: 'info' });
      } catch {
        setStarred(!nextState);
      }
    }
  };

  // Attachment upload in quick bar
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 25 * 1024 * 1024) {
        showToast({ text: `File "${file.name}" exceeds 25MB limit`, type: 'error' });
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setPendingAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            dataUrl: reader.result as string,
            type: file.type || 'application/octet-stream',
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Send quick reply
  const handleSendReply = useCallback(async () => {
    if ((!quickReplyText.trim() && pendingAttachments.length === 0) || isSendingQuickReply) return;
    setIsSendingQuickReply(true);
    setReplyError(null);

    const replyContent = quickReplyText.trim();
    const replyTarget = messages.length > 0 ? messages[messages.length - 1].id : threadId;

    try {
      const res = await apiClient.replyToEmail(replyTarget, replyContent);
      if (!res.success) {
        setReplyError(res.error?.message || 'Failed to send reply');
        showToast({ text: res.error?.message || 'Failed to send reply', type: 'error' });
        return;
      }

      const targetTo = messages[0]?.from ? [messages[0].from] : [];

      // Optimistic update: inject the sent reply into the active conversation timeline
      const newReplyMsg: Email = {
        id: (res.data as any)?.id || `reply-${Date.now()}`,
        threadId: threadId || (res.data as any)?.threadId || '',
        userId: '',
        subject: threadSubject.startsWith('Re:') ? threadSubject : `Re: ${threadSubject}`,
        bodyText: replyContent,
        bodyHtml: `<p>${replyContent.replace(/\n/g, '<br/>')}</p>`,
        snippet: replyContent.slice(0, 100),
        from: { name: 'You', email: 'me@quantmail.in' },
        to: targetTo,
        cc: [],
        bcc: [],
        priority: 'normal',
        category: 'primary',
        status: 'sent',
        isRead: true,
        isStarred: false,
        isArchived: false,
        isDraft: false,
        labels: [],
        references: [],
        headers: {},
        receivedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        attachments: pendingAttachments.map((a, i) => ({
          id: `att-${i}`,
          emailId: `reply-${Date.now()}`,
          filename: a.name,
          mimeType: a.type,
          size: a.size,
          url: a.dataUrl,
          isInline: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      };

      setMessages((prev) => {
        const next = [...prev, newReplyMsg];
        setExpandedIndices(new Set([...Array.from(expandedIndices), next.length - 1]));
        return next;
      });

      setQuickReplyText('');
      setPendingAttachments([]);
      showToast({ text: 'Reply sent successfully 🚀', type: 'success' });

      // Scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch {
      setReplyError('Failed to send reply');
      showToast({ text: 'Failed to send reply', type: 'error' });
    } finally {
      setIsSendingQuickReply(false);
    }
  }, [
    quickReplyText,
    pendingAttachments,
    isSendingQuickReply,
    messages,
    threadId,
    threadSubject,
    expandedIndices,
  ]);

  const primaryMessage = messages[0];
  const allExpanded = messages.length > 0 && expandedIndices.size === messages.length;

  return (
    <div className={`flex flex-col h-full bg-[#0a0d14] text-white select-text ${className}`}>
      {/* Top Header Actions Bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-zinc-800/90 bg-[#0d1017]/95 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -ml-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
              title="Close pane"
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                {threadSubject}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-400 shrink-0">
                {messages.length} {messages.length === 1 ? 'Message' : 'Messages'}
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 truncate">
              {messages
                .map((m) => m.from?.name || (m as any).fromName || 'Sender')
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(', ')}
            </span>
          </div>
        </div>

        {/* Right Action Icons: Expand/Collapse All + Open Full Thread + Star + Archive + Delete */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Global Accordion Toggle Button */}
          <button
            type="button"
            onClick={allExpanded ? collapseAll : expandAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-medium text-zinc-300 transition-all shadow-sm active:scale-95"
            title={allExpanded ? 'Collapse All Messages' : 'Expand All Messages'}
          >
            <svg
              className={`size-3.5 transition-transform ${allExpanded ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="m7 15 5 5 5-5" />
              <path d="m7 9 5-5 5 5" />
            </svg>
            <span className="hidden sm:inline">{allExpanded ? 'Collapse All' : 'Expand All'}</span>
          </button>

          {/* Star Button */}
          <button
            type="button"
            onClick={handleToggleStar}
            className={`p-2 rounded-xl transition-all active:scale-95 ${
              starred
                ? 'text-amber-400 bg-amber-400/10'
                : 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800'
            }`}
            title={starred ? 'Starred' : 'Not starred'}
          >
            <svg
              className="size-4.5"
              viewBox="0 0 24 24"
              fill={starred ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>

          {/* Open Full Thread Page */}
          {variant === 'pane' && (
            <button
              type="button"
              onClick={() =>
                router.push(`/thread/${primaryMessage?.threadId || primaryMessage?.id || threadId}`)
              }
              className="p-2 rounded-xl text-zinc-400 hover:text-amber-300 hover:bg-zinc-800 transition-all"
              title="Open in Full Thread View"
            >
              <svg
                className="size-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          )}

          {/* Archive */}
          {onArchive && (
            <button
              type="button"
              onClick={onArchive}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
              title="Archive conversation"
            >
              <svg
                className="size-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect width="20" height="5" x="2" y="3" rx="1" />
                <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                <path d="M10 12h4" />
              </svg>
            </button>
          )}

          {/* Delete */}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
              title="Move to Trash"
            >
              <svg
                className="size-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main Conversation Stream (Chronological Stack) */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 max-w-4xl mx-auto w-full">
        {isLoading && (
          <div className="space-y-4 pt-4">
            <div className="h-20 bg-zinc-900/60 rounded-2xl animate-pulse border border-zinc-800/60" />
            <div className="h-64 bg-zinc-900/60 rounded-3xl animate-pulse border border-zinc-800/60" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-400">
            <span className="text-4xl mb-2">💬</span>
            <p className="text-sm font-semibold">No messages in this conversation</p>
          </div>
        )}

        {!isLoading &&
          messages.map((message: Email, index: number) => {
            const isExpanded = expandedIndices.has(index);
            const isDetailsExpanded = expandedDetailsIndices.has(index);

            const isOutbound = Boolean(
              message.status === 'sent' ||
              (message as any).isSent ||
              message.from?.email?.toLowerCase().includes('@quantmail.in') ||
              (message as any).fromAddress?.toLowerCase().includes('@quantmail.in'),
            );

            const msgFromName =
              message.from?.name ||
              message.from?.email ||
              (message as any).fromName ||
              (message as any).fromAddress ||
              (isOutbound ? 'You' : 'Sender');

            const msgFromEmail = message.from?.email || (message as any).fromAddress || '';
            const msgAttachments = message.attachments || [];
            const hasAtt = msgAttachments.length > 0;
            const toDisplay =
              message.to?.map((t) => t.name || t.email).join(', ') ||
              (message as any).toAddresses?.join(', ') ||
              'me';

            return (
              <motion.div
                key={message.id || index}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`w-full ${isOutbound ? 'conversation-outgoing' : 'conversation-incoming'}`}
              >
                {!isExpanded ? (
                  /* Collapsed 1-Line Strip */
                  <div
                    onClick={() => toggleMessageExpand(index)}
                    className={`group flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer shadow-sm select-none hover:shadow-md ${
                      isOutbound
                        ? 'border-amber-500/25 bg-gradient-to-r from-[#17141f] to-[#121622] hover:border-amber-500/40'
                        : 'border-zinc-800/90 bg-[#111522]/90 hover:bg-[#151a2b] hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <IdentityAvatar name={msgFromName} size="sm" />
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`text-xs font-bold truncate ${isOutbound ? 'text-amber-300' : 'text-white'}`}
                        >
                          {msgFromName}
                        </span>

                        {/* Badges */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-1.5 py-0.2 rounded bg-zinc-800/80 border border-zinc-700/70 text-[9px] font-bold text-zinc-300 font-mono">
                            #{index + 1}
                          </span>
                          {isOutbound && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-bold text-amber-400">
                              Sent
                            </span>
                          )}
                          {hasAtt && (
                            <span className="px-1.5 py-0.2 rounded bg-cyan-500/15 border border-cyan-500/30 text-[9px] font-bold text-cyan-400 flex items-center gap-0.5">
                              <span>📎</span>
                              <span>{msgAttachments.length}</span>
                            </span>
                          )}
                        </div>

                        <span className="text-xs text-zinc-400 truncate max-w-xs sm:max-w-md">
                          — {message.snippet || message.bodyText?.slice(0, 80) || '(No preview)'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {formatMessageDate(message.receivedAt)}
                      </span>
                      <svg
                        className="size-4 text-zinc-500 group-hover:text-zinc-300 transition-colors"
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
                  /* Expanded Rich Card */
                  <div
                    className={`rounded-2xl sm:rounded-3xl border shadow-xl overflow-hidden transition-all ${
                      isOutbound
                        ? 'border-amber-500/30 bg-[#12141f]'
                        : 'border-zinc-800/90 bg-[#10141d]'
                    }`}
                  >
                    {/* Header Bar */}
                    <div className="flex items-start justify-between gap-3 p-4 sm:p-5 pb-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <IdentityAvatar name={msgFromName} size="md" />

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm font-bold ${isOutbound ? 'text-amber-300' : 'text-white'}`}
                            >
                              {msgFromName}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-zinc-800/80 border border-zinc-700/80 text-[10px] font-mono text-zinc-300">
                              Message #{index + 1}
                            </span>
                            {isOutbound && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-400">
                                Outgoing Reply
                              </span>
                            )}
                            <span className="text-xs text-zinc-400 font-mono">
                              {formatMessageDate(message.receivedAt)}
                            </span>
                          </div>

                          {/* "to me ⌵" Security Accordion Trigger */}
                          <button
                            type="button"
                            onClick={() => toggleDetailsExpand(index)}
                            className="group inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-amber-300 text-left pt-0.5 font-mono"
                          >
                            <span>to {isOutbound ? toDisplay : 'me'}</span>
                            <svg
                              className={`size-3 transition-transform ${isDetailsExpanded ? 'rotate-180' : ''}`}
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

                      {/* Right Quick Actions: Collapse Card */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleMessageExpand(index)}
                          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                          title="Collapse this message"
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

                    {/* Expandable "to me ⌵" Security Metadata */}
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
                                {msgFromName} {msgFromEmail ? `<${msgFromEmail}>` : ''}
                              </span>
                            </div>
                            <div className="flex">
                              <span className="w-20 text-zinc-500">To:</span>
                              <span className="text-zinc-300">{toDisplay}</span>
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
                                <span>Standard Encryption (TLS 1.3 · E2EE Authenticated)</span>
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Body Letterhead */}
                    <div className="p-3 sm:p-5 pt-0">
                      <EmailLetterCard email={message} />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}

        <div ref={messagesEndRef} />
      </div>

      {/* Chatbot-Style Bottom Floating Quick Reply Bar */}
      <div className="p-3 sm:p-4 bg-[#0d1017]/95 border-t border-zinc-800/90 backdrop-blur-md sticky bottom-0 z-20 space-y-2">
        {/* Smart Suggestions Chips */}
        {primaryMessage && (
          <SmartReplySuggestions
            emailId={primaryMessage.id}
            onSelectReply={(text) => {
              setQuickReplyText(text);
              setTimeout(() => {
                document.getElementById('chatbot-reply-input')?.focus();
              }, 50);
            }}
          />
        )}

        {/* Pending Attachment Previews */}
        {pendingAttachments.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-2 py-1">
            {pendingAttachments.map((att, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-200"
              >
                <span>📎 {att.name}</span>
                <button
                  type="button"
                  onClick={() => removePendingAttachment(index)}
                  className="text-zinc-400 hover:text-rose-400 font-bold"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Main Floating Input Bar */}
        <div className="flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl border border-zinc-700/80 bg-[#121624] shadow-2xl">
          {/* File Attachment Hidden Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            className="hidden"
          />

          {/* Attachment Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all shrink-0"
            title="Attach Files / Photos"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {/* Quanty AI Assistant Trigger */}
          <button
            type="button"
            onClick={() => setIsQuantyOpen(true)}
            className="p-1.5 rounded-xl text-amber-400 hover:bg-amber-500/10 transition-all shrink-0"
            title="Ask Quanty AI to write response"
          >
            <Quanty size={22} expression="happy" bob={false} />
          </button>

          {/* Chat Input Text Area */}
          <input
            id="chatbot-reply-input"
            type="text"
            value={quickReplyText}
            onChange={(e) => setQuickReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendReply();
              }
            }}
            placeholder="Type a quick reply (press Enter to send ↵)…"
            className="flex-1 bg-transparent border-none text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none px-2 py-1.5"
          />

          {/* Full Composer Trigger */}
          <button
            type="button"
            onClick={() =>
              router.push(
                `/compose?replyTo=${primaryMessage?.threadId || primaryMessage?.id || threadId}`,
              )
            }
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all shrink-0 border border-zinc-700/60"
            title="Open Rich Full Composer"
          >
            <span>Full Composer</span>
          </button>

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSendReply}
            disabled={
              (!quickReplyText.trim() && pendingAttachments.length === 0) || isSendingQuickReply
            }
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#ea580c] hover:from-[#e06c00] hover:to-[#d04e06] text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-30 disabled:pointer-events-none shrink-0 flex items-center gap-1.5"
          >
            <span>{isSendingQuickReply ? 'Sending…' : 'Send'}</span>
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>

        {replyError && <p className="text-xs text-rose-400 px-2">{replyError}</p>}
      </div>

      {/* Quanty Assistant Copilot Drawer */}
      <QuantyCopilotDrawer
        isOpen={isQuantyOpen}
        onClose={() => setIsQuantyOpen(false)}
        contextEmail={primaryMessage}
        contextThreadSubject={threadSubject}
        onInsertReply={(text) => {
          setQuickReplyText(text);
          setTimeout(() => {
            document.getElementById('chatbot-reply-input')?.focus();
          }, 50);
        }}
      />
    </div>
  );
}
