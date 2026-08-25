'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../services/api-client';
import type { Email, EmailAttachment, EmailThread } from '../types';
import { showToast } from './InboxToast';
import { IdentityAvatar } from './IdentityAvatar';
import { EmailLetterCard } from './EmailLetterCard';
import { QuantyCopilotDrawer } from './QuantyCopilotDrawer';
import { Quanty } from './Quanty';
import { useAuth } from '../providers/auth-provider';

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

  const loadedThreadIdRef = useRef<string | null>(null);

  const { user: currentUser } = useAuth();
  const currentEmail = (currentUser?.email || '').toLowerCase();
  const currentHandle = currentEmail.split('@')[0];

  // Derive participant summary for header
  const participantSummary = useMemo(() => {
    const names: string[] = [];
    let hasOther = false;
    for (const m of messages) {
      const fromAddr = (m.from?.email || (m as any).fromAddress || '').toLowerCase();
      const isMe = Boolean(
        (currentEmail &&
          (fromAddr === currentEmail ||
            (currentHandle && fromAddr.startsWith(`${currentHandle}@`)))) ||
        (m as any).isSent ||
        m.status === 'sent',
      );
      if (isMe) {
        if (!names.includes('You')) names.push('You');
      } else {
        hasOther = true;
        const name =
          m.from?.name ||
          (m as any).fromName ||
          m.from?.email?.split('@')[0] ||
          (m as any).fromAddress?.split('@')[0] ||
          'Sender';
        if (!names.includes(name)) names.push(name);
      }
    }
    if (names.length === 0) return 'Conversation';
    if (names.length === 1 && names[0] === 'You' && !hasOther) return 'You';
    return names.join(', ');
  }, [messages, currentEmail, currentHandle]);

  // Fetch thread messages if not pre-populated or update when threadId changes
  useEffect(() => {
    let isMounted = true;
    if (!threadId) {
      setIsLoading(false);
      return;
    }

    if (initialEmails && initialEmails.length > 0) {
      setMessages(initialEmails);
      setExpandedIndices(new Set([initialEmails.length - 1]));
      setIsLoading(false);
      return;
    }

    if (loadedThreadIdRef.current === threadId && messages.length > 0) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    loadedThreadIdRef.current = threadId;

    const loadData = async () => {
      try {
        // 1. Try fetching as thread
        const threadRes = await apiClient.getThread(threadId).catch(() => null);
        if (threadRes && threadRes.success && threadRes.data) {
          const msgs = (threadRes.data.messages || (threadRes.data as any).emails || []) as Email[];
          if (msgs.length > 0) {
            if (!isMounted) return;
            setMessages(msgs);
            setThreadSubject(threadRes.data.subject || msgs[0]?.subject || '(No Subject)');
            setStarred(threadRes.data.isStarred || false);
            if (msgs.length <= 2) {
              setExpandedIndices(new Set(msgs.map((_, i) => i)));
            } else {
              setExpandedIndices(new Set([msgs.length - 1]));
            }
            setIsLoading(false);
            return;
          }
        }

        // 2. Fallback: Fetch as single email
        const emailRes = await apiClient.getEmail(threadId).catch(() => null);
        if (emailRes && emailRes.success && emailRes.data) {
          if (!isMounted) return;
          const email = emailRes.data;
          // If the email belongs to a thread, try fetching the full thread
          if (email.threadId && email.threadId !== threadId) {
            const fullThreadRes = await apiClient.getThread(email.threadId).catch(() => null);
            if (fullThreadRes && fullThreadRes.success && fullThreadRes.data) {
              const fullMsgs = (fullThreadRes.data.messages ||
                (fullThreadRes.data as any).emails ||
                []) as Email[];
              if (fullMsgs.length > 0) {
                setMessages(fullMsgs);
                setThreadSubject(
                  fullThreadRes.data.subject ||
                    fullMsgs[0]?.subject ||
                    email.subject ||
                    '(No Subject)',
                );
                setStarred(fullThreadRes.data.isStarred || email.isStarred || false);
                setExpandedIndices(
                  new Set(fullMsgs.length <= 2 ? fullMsgs.map((_, i) => i) : [fullMsgs.length - 1]),
                );
                setIsLoading(false);
                return;
              }
            }
          }
          setMessages([email]);
          setThreadSubject(email.subject || '(No Subject)');
          setStarred(email.isStarred || false);
          setExpandedIndices(new Set([0]));
          setIsLoading(false);
          return;
        }
      } catch {
        /* proceed */
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [threadId]);

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
      showToast({ text: 'Reply sent successfully', type: 'success' });

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
    <div className={`flex flex-col h-full bg-[#090A0C] text-white select-text ${className}`}>
      {/* Top Header Actions Bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-zinc-800/90 bg-[#090A0C]/95 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 -ml-1.5 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800/80 active:bg-zinc-700/60 transition-all active:scale-95 flex items-center justify-center min-w-[40px] min-h-[40px]"
              title="Back to inbox"
              aria-label="Back to inbox"
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                {participantSummary}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-400 shrink-0">
                {messages.length} {messages.length === 1 ? 'Message' : 'Messages'}
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 truncate">
              {threadSubject || '(No Subject)'}
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

          {/* Pin Button */}
          <button
            type="button"
            onClick={handleToggleStar}
            className={`p-2 rounded-xl transition-all active:scale-95 ${
              starred
                ? 'text-amber-400 bg-amber-400/10'
                : 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800'
            }`}
            title={starred ? 'Pinned to top' : 'Pin to top'}
          >
            <svg
              className="size-4.5"
              viewBox="0 0 24 24"
              fill={starred ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
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

          {/* Print Thread */}
          <button
            type="button"
            onClick={() => window.print()}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
            title="Print entire conversation (Ctrl+P / Cmd+P)"
          >
            <svg
              className="size-4.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect width="12" height="8" x="6" y="14" />
            </svg>
          </button>

          {/* Archive */}
          {onArchive && (
            <button
              type="button"
              onClick={onArchive}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
              title="Archive conversation (E)"
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
              title="Move to Trash (#)"
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

            const msgFromAddr = (
              message.from?.email ||
              (message as any).fromAddress ||
              ''
            ).toLowerCase();
            const isOutbound = Boolean(
              message.status === 'sent' ||
              (message as any).isSent ||
              (currentEmail &&
                (msgFromAddr === currentEmail ||
                  (currentHandle && msgFromAddr.startsWith(`${currentHandle}@`)))),
            );

            const msgFromName = isOutbound
              ? 'You'
              : message.from?.name ||
                (message as any).fromName ||
                message.from?.email?.split('@')[0] ||
                (message as any).fromAddress?.split('@')[0] ||
                'Sender';

            const msgFromEmail = message.from?.email || (message as any).fromAddress || '';
            const msgAttachments = message.attachments || [];
            const hasAtt = msgAttachments.length > 0;
            const toDisplay =
              message.to?.map((t) => t.name || t.email).join(', ') ||
              (message as any).toAddresses?.join(', ') ||
              'me';

            // Detect if this message is a full rich email or a chat quick thread
            const isThreadQuick = Boolean(
              !message.subject ||
              message.subject.toLowerCase() === '(no subject)' ||
              message.subject.toLowerCase() === 'quick reply' ||
              (message.bodyText && message.bodyText.length < 120 && !message.bodyHtml),
            );
            const messageTypeBadge = isThreadQuick ? 'Thread' : 'Mail';

            return (
              <motion.div
                key={message.id || index}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`w-full flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
              >
                {!isExpanded ? (
                  /* Collapsed 1-Line Strip */
                  <div
                    onClick={() => toggleMessageExpand(index)}
                    className={`group w-full max-w-[95%] sm:max-w-[88%] flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer shadow-sm select-none hover:shadow-md ${
                      isOutbound
                        ? 'border-amber-500/30 bg-[#121016] hover:border-amber-500/50'
                        : 'border-zinc-800/90 bg-[#0d0e14] hover:bg-[#12141c] hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <IdentityAvatar name={msgFromName} size="sm" />
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`text-xs font-bold truncate ${isOutbound ? 'text-amber-400' : 'text-white'}`}
                        >
                          {msgFromName}
                        </span>

                        {/* Badges: Mail or Thread */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              messageTypeBadge === 'Mail'
                                ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                                : 'bg-zinc-800/80 border border-zinc-700/70 text-zinc-300'
                            }`}
                          >
                            {messageTypeBadge}
                          </span>
                          {hasAtt && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-bold text-amber-400 flex items-center gap-0.5">
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
                    className={`w-full max-w-[96%] sm:max-w-[90%] rounded-2xl sm:rounded-3xl border shadow-xl overflow-hidden transition-all ${
                      isOutbound
                        ? 'border-amber-500/30 bg-[#0f0e14]'
                        : 'border-zinc-800/90 bg-[#0a0c10]'
                    }`}
                  >
                    {/* Header Bar */}
                    <div className="flex items-start justify-between gap-3 p-4 sm:p-5 pb-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <IdentityAvatar name={msgFromName} size="md" />

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm font-bold ${isOutbound ? 'text-amber-400' : 'text-white'}`}
                            >
                              {msgFromName}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ${
                                messageTypeBadge === 'Mail'
                                  ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                                  : 'bg-zinc-800/80 border border-zinc-700/80 text-zinc-300'
                              }`}
                            >
                              {messageTypeBadge}
                            </span>
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

      {/* Action Chips & Smart Reply Suggestions Bar */}
      <div className="px-3 sm:px-4 pt-2.5 pb-1 bg-[#08090d]/95 border-t border-zinc-800/80 flex items-center justify-between gap-2 flex-wrap">
        {/* Left: Action Chips (Reply / Reply All / Forward) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const recipient = primaryMessage?.from?.email || '';
              const subj = threadSubject.startsWith('Re:') ? threadSubject : `Re: ${threadSubject}`;
              router.push(
                `/compose?to=${encodeURIComponent(recipient)}&subject=${encodeURIComponent(subj)}&replyTo=${primaryMessage?.id || threadId}`,
              );
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] hover:border-[#3A404D] text-[11px] font-medium text-[#A1A4AC] hover:text-[#F5F5F5] transition-all shadow-sm active:scale-95"
            title="Reply to sender (R)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
            <span>Reply</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const allRecipients = messages
                .flatMap((m) => [m.from?.email, ...(m.to?.map((t) => t.email) || [])])
                .filter(Boolean)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(', ');
              const subj = threadSubject.startsWith('Re:') ? threadSubject : `Re: ${threadSubject}`;
              router.push(
                `/compose?to=${encodeURIComponent(allRecipients)}&subject=${encodeURIComponent(subj)}&replyTo=${primaryMessage?.id || threadId}`,
              );
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] hover:border-[#3A404D] text-[11px] font-medium text-[#A1A4AC] hover:text-[#F5F5F5] transition-all shadow-sm active:scale-95"
            title="Reply to all recipients (A)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16l-4-4m0 0l4-4m-4 4h18"
              />
            </svg>
            <span>Reply All</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const subj = threadSubject.startsWith('Fwd:')
                ? threadSubject
                : `Fwd: ${threadSubject}`;
              const forwardBody = `\n\n---------- Forwarded message ---------\nFrom: ${primaryMessage?.from?.name || ''} <${primaryMessage?.from?.email || ''}>\nSubject: ${threadSubject}\n\n${primaryMessage?.bodyText || primaryMessage?.snippet || ''}`;
              router.push(
                `/compose?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(forwardBody)}`,
              );
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#16181D] hover:bg-[#1C1F26] border border-[#282C35] hover:border-[#3A404D] text-[11px] font-medium text-[#A1A4AC] hover:text-[#F5F5F5] transition-all shadow-sm active:scale-95"
            title="Forward this conversation (F)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
            <span>Forward</span>
          </button>
        </div>

        {/* Right: Smart Reply Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {['Sounds good, thanks!', "Let's do that.", "I'll review and get back shortly."].map(
            (suggestion, sIdx) => (
              <button
                key={sIdx}
                type="button"
                onClick={() => {
                  setQuickReplyText(suggestion);
                  setTimeout(() => document.getElementById('chatbot-reply-input')?.focus(), 50);
                }}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-[#2B1A11] hover:bg-[#3D2315] border border-[#5C3016] text-[11px] font-medium text-[#FF9B5A] hover:text-[#F5F5F5] transition-all active:scale-95 flex items-center gap-1"
              >
                <svg
                  className="w-2.5 h-2.5 text-[#FF8C42]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span>{suggestion}</span>
              </button>
            ),
          )}
        </div>
      </div>

      {/* Chatbot-Style Bottom Floating Quick Reply Bar */}
      <div className="p-3 sm:p-4 bg-[#08090d]/95 border-t border-zinc-800/60 backdrop-blur-md sticky bottom-0 z-20 space-y-2">
        {/* Pending Attachment Previews */}
        {pendingAttachments.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-2 py-1">
            {pendingAttachments.map((att, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#16181D] border border-[#282C35] text-xs text-[#F5F5F5]"
              >
                <svg
                  className="w-3.5 h-3.5 text-[#FF8C42]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
                  />
                </svg>
                <span className="truncate max-w-[150px]">{att.name}</span>
                <button
                  type="button"
                  onClick={() => removePendingAttachment(index)}
                  className="text-[#6B6E76] hover:text-[#F87171] p-0.5 rounded transition-colors"
                  aria-label="Remove attachment"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Main Floating Input Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-2xl border border-[#282C35] bg-[#111318] shadow-2xl">
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
            className="p-1.5 sm:p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all shrink-0"
            title="Attach Files / Photos"
          >
            <svg
              className="size-4.5 sm:size-5"
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
            className="p-1 sm:p-1.5 rounded-xl text-amber-400 hover:bg-amber-500/10 transition-all shrink-0"
            title="Ask Quanty AI to write response"
          >
            <Quanty size={20} expression="happy" bob={false} />
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
            placeholder="Quick reply (↵ to send)…"
            className="min-w-0 flex-1 bg-transparent border-none text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none px-1 sm:px-2 py-1.5"
          />

          {/* Mail Button (Opens Full Corporate Composer with Prefilled To) */}
          <button
            type="button"
            onClick={() => {
              const isOut =
                primaryMessage &&
                Boolean(
                  (primaryMessage as any).isOutbound ||
                  (primaryMessage as any).folder === 'SENT' ||
                  (primaryMessage as any).folder === 'sent' ||
                  (primaryMessage as any).folderType === 'SENT',
                );
              const recipientEmail = isOut
                ? primaryMessage?.to?.[0]?.email || (primaryMessage as any)?.toAddresses?.[0] || ''
                : primaryMessage?.from?.email || (primaryMessage as any)?.fromAddress || '';
              const cleanSubject =
                threadSubject?.replace(/^(Re:\s*)+/i, '').trim() ||
                primaryMessage?.subject?.replace(/^(Re:\s*)+/i, '').trim() ||
                '';
              const params = new URLSearchParams();
              if (recipientEmail) params.set('to', recipientEmail);
              if (cleanSubject) params.set('subject', cleanSubject);
              if (primaryMessage?.id || threadId) {
                params.set('replyTo', primaryMessage?.id || threadId);
              }
              router.push(`/compose?${params.toString()}`);
            }}
            className="inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-amber-400 text-xs font-semibold transition-all shrink-0 border border-zinc-700/70 shadow-sm active:scale-95"
            title="Open Full Mail Composer"
          >
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <span className="text-xs">Mail</span>
          </button>

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSendReply}
            disabled={
              (!quickReplyText.trim() && pendingAttachments.length === 0) || isSendingQuickReply
            }
            className="px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] text-[#111111] text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-30 disabled:pointer-events-none shrink-0 flex items-center gap-1.5"
          >
            <span>{isSendingQuickReply ? '…' : 'Send'}</span>
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
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
