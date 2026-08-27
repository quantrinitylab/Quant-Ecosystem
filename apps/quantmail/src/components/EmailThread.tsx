// ============================================================================
// QuantMail - Email Thread Component
// Email conversation thread view with QuantAI integration
// ============================================================================

import React, { useState } from 'react';
import { sanitizeHtmlContent } from '@quant/shared-ui';
import type { Email, EmailThread as EmailThreadType, EmailAddress } from '../types';
import { IdentityAvatar } from './IdentityAvatar';

export interface EmailThreadProps {
  thread: EmailThreadType;
  onReply: (emailId: string, body: string, replyAll: boolean) => Promise<void>;
  onForward: (emailId: string, to: EmailAddress[], message?: string) => Promise<void>;
  onArchive: (emailId: string) => void;
  onDelete: (emailId: string) => void;
  onToggleStar: (emailId: string) => void;
  onAddLabel: (emailId: string, label: string) => void;
  onAISummarize: (emailId: string) => Promise<string>;
  onAISuggestReplies: (emailId: string) => Promise<string[]>;
  onBack: () => void;
}

export function EmailThread(props: EmailThreadProps): React.ReactElement {
  const {
    thread,
    onReply,
    onForward,
    onArchive,
    onDelete,
    onToggleStar,
    onAddLabel: _onAddLabel,
    onAISummarize,
    onAISuggestReplies,
    onBack,
  } = props;

  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set([thread.messages[thread.messages.length - 1]?.id]),
  );
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyAll, setReplyAll] = useState(false);
  const [forwardingId, setForwardingId] = useState<string | null>(null);
  const [forwardTo, setForwardTo] = useState('');
  const [forwardMessage, setForwardMessage] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [replySuggestions, setReplySuggestions] = useState<string[]>([]);
  const [activeEmailId, setActiveEmailId] = useState<string | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  const toggleExpanded = (emailId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  };

  const handleReply = async () => {
    if (!replyingTo || !replyBody.trim()) return;
    await onReply(replyingTo, replyBody, replyAll);
    setReplyingTo(null);
    setReplyBody('');
    setReplyAll(false);
  };

  const handleForward = async () => {
    if (!forwardingId || !forwardTo.trim()) return;
    const recipients = forwardTo.split(',').map((e) => ({ email: e.trim() }));
    await onForward(forwardingId, recipients, forwardMessage);
    setForwardingId(null);
    setForwardTo('');
    setForwardMessage('');
  };

  const handleSummarize = async (emailId: string) => {
    setIsLoadingAI(true);
    try {
      const result = await onAISummarize(emailId);
      setSummary(result);
      setActiveEmailId(emailId);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const handleSuggestReplies = async (emailId: string) => {
    setIsLoadingAI(true);
    try {
      const suggestions = await onAISuggestReplies(emailId);
      setReplySuggestions(suggestions);
      setActiveEmailId(emailId);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const useSuggestion = (suggestion: string, emailId: string) => {
    setReplyingTo(emailId);
    setReplyBody(suggestion);
    setReplySuggestions([]);
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="email-thread max-w-5xl mx-auto p-4 md:p-6 text-[var(--quant-foreground)]">
      {/* Thread Header */}
      <div className="flex items-center justify-between gap-4 pb-4 mb-6 border-b border-[var(--quant-border-subtle)]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="inline-flex items-center justify-center size-8 rounded-lg bg-[var(--quant-muted)] hover:bg-[var(--quant-surface-hover)] text-xs text-[var(--quant-foreground)] transition-colors"
            onClick={onBack}
            aria-label="Back to inbox"
          >
            ←
          </button>
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight truncate">
              {thread.subject || '(no subject)'}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-[var(--quant-muted-foreground)]">
              <span>{thread.messageCount} messages</span>
              <span>•</span>
              <span>{thread.participants.length} participants</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-none">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-[var(--quant-border)] text-xs text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-muted)] transition-colors"
            onClick={() => onArchive(thread.messages[0]?.id)}
          >
            Archive
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-[var(--quant-border)] text-xs text-[var(--quant-destructive)] hover:bg-rose-500/10 transition-colors"
            onClick={() => onDelete(thread.messages[0]?.id)}
          >
            Delete
          </button>
        </div>
      </div>

      {/* AI Summary Banner */}
      {summary && activeEmailId && (
        <div className="mb-6 p-4 rounded-xl border border-[#5C3016] bg-[#2B1A11] text-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF8C42] flex items-center gap-1.5">
              ✦ QuantAI Summary
            </span>
            <button
              type="button"
              className="text-xs text-[var(--quant-muted-foreground)] hover:text-white"
              onClick={() => setSummary(null)}
            >
              Dismiss
            </button>
          </div>
          <p className="text-[var(--quant-foreground)] leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Thread Messages */}
      <div className="space-y-4">
        {thread.messages.map((email, index) => {
          const isExpanded = expandedMessages.has(email.id);
          const isLast = index === thread.messages.length - 1;

          return (
            <div
              key={email.id}
              className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                isExpanded
                  ? 'border-[var(--quant-border)] bg-[var(--quant-surface)] shadow-lg'
                  : 'border-[var(--quant-border-subtle)] bg-[var(--quant-surface-subtle)] hover:border-[var(--quant-border)]'
              }`}
            >
              {/* Message Header */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer select-none"
                onClick={() => toggleExpanded(email.id)}
              >
                <IdentityAvatar name={email.from.name || email.from.email} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[var(--quant-foreground)] truncate">
                      {email.from.name || email.from.email}
                    </span>
                    <span className="text-xs text-[var(--quant-muted-foreground)] truncate">
                      &lt;{email.from.email}&gt;
                    </span>
                  </div>
                  {!isExpanded && (
                    <p className="text-xs text-[var(--quant-muted-foreground)] truncate mt-0.5">
                      {email.snippet}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-none text-xs text-[var(--quant-muted-foreground)]">
                  <span>{formatDate(email.receivedAt)}</span>
                  <button
                    type="button"
                    className={`size-7 rounded flex items-center justify-center transition-colors ${
                      email.isStarred ? 'text-[#ffb547]' : 'text-[#6B6E76] hover:text-[#A1A4AC]'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(email.id);
                    }}
                    aria-label="Star email"
                  >
                    ★
                  </button>
                </div>
              </div>

              {/* Message Body */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-[var(--quant-border-subtle)]">
                  <div className="text-xs text-[var(--quant-muted-foreground)] mb-4 space-y-0.5">
                    <div>To: {email.to.map((r) => r.name || r.email).join(', ')}</div>
                    {email.cc && email.cc.length > 0 && (
                      <div>Cc: {email.cc.map((r) => r.email).join(', ')}</div>
                    )}
                  </div>

                  <div
                    className="text-sm leading-relaxed text-[var(--quant-foreground)] prose prose-invert max-w-none mb-6"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtmlContent(
                        email.bodyHtml || email.bodyText.replace(/\n/g, '<br>'),
                      ),
                    }}
                  />

                  {/* Attachments */}
                  {email.attachments && email.attachments.length > 0 && (
                    <div className="mb-6 p-3 rounded-lg bg-[var(--quant-surface-subtle)] border border-[var(--quant-border-subtle)]">
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)] mb-2">
                        Attachments ({email.attachments.length})
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {email.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-xs text-[var(--quant-foreground)]"
                          >
                            <span>📎</span>
                            <span className="font-medium truncate max-w-[12rem]">
                              {att.filename}
                            </span>
                            <span className="text-[var(--quant-muted-foreground)]">
                              ({Math.round(att.size / 1024)} KB)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Message Action Toolbar */}
                  <div className="flex items-center gap-2 pt-2 border-t border-[var(--quant-border-subtle)] flex-wrap">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-[var(--quant-muted)] hover:bg-[var(--quant-surface-hover)] text-xs font-medium transition-colors"
                      onClick={() => {
                        setReplyingTo(email.id);
                        setReplyAll(false);
                      }}
                    >
                      Reply
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-[var(--quant-muted)] hover:bg-[var(--quant-surface-hover)] text-xs font-medium transition-colors"
                      onClick={() => {
                        setReplyingTo(email.id);
                        setReplyAll(true);
                      }}
                    >
                      Reply All
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-[var(--quant-muted)] hover:bg-[var(--quant-surface-hover)] text-xs font-medium transition-colors"
                      onClick={() => setForwardingId(email.id)}
                    >
                      Forward
                    </button>
                    <button
                      type="button"
                      disabled={isLoadingAI}
                      className="px-3 py-1.5 rounded-lg border border-[#FF8C42]/30 text-[#FF9B5A] hover:bg-[#FF8C42]/10 text-xs font-medium transition-colors"
                      onClick={() => handleSummarize(email.id)}
                    >
                      ✦ AI Summarize
                    </button>
                    <button
                      type="button"
                      disabled={isLoadingAI}
                      className="px-3 py-1.5 rounded-lg border border-[#5C3016] bg-[#2B1A11] text-[#FF8C42] hover:bg-[#3D2214] text-xs font-medium transition-colors"
                      onClick={() => handleSuggestReplies(email.id)}
                    >
                      ✦ Smart Replies
                    </button>
                  </div>

                  {/* AI Reply Suggestions */}
                  {replySuggestions.length > 0 && activeEmailId === email.id && (
                    <div className="mt-3 p-3 rounded-lg bg-[var(--quant-surface-subtle)] border border-[#5C3016]">
                      <h5 className="text-xs font-semibold text-[#FF8C42] mb-2">
                        Smart Suggestions:
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {replySuggestions.map((suggestion, i) => (
                          <button
                            key={i}
                            type="button"
                            className="px-3 py-1.5 rounded-lg bg-[var(--quant-surface)] hover:bg-[var(--quant-surface-hover)] border border-[var(--quant-border)] text-xs text-[var(--quant-foreground)] transition-colors text-left"
                            onClick={() => useSuggestion(suggestion, email.id)}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Inline Reply Form */}
                  {replyingTo === email.id && (
                    <div className="mt-4 p-4 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] space-y-3">
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder={`Reply to ${email.from.name || email.from.email}…`}
                        rows={4}
                        className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg p-3 text-xs text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[#FF8C42]"
                        autoFocus
                      />
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={replyAll}
                            onChange={(e) => setReplyAll(e.target.checked)}
                            className="accent-[#FF8C42]"
                          />
                          Reply to all
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-lg border border-[var(--quant-border)] text-xs text-[var(--quant-muted-foreground)] hover:text-white"
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyBody('');
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="px-4 py-1.5 rounded-lg bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] text-[#111111] font-semibold text-xs transition-colors"
                            onClick={handleReply}
                            disabled={!replyBody.trim()}
                          >
                            Send Reply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline Forward Form */}
                  {forwardingId === email.id && (
                    <div className="mt-4 p-4 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-[var(--quant-muted-foreground)] mb-1">
                          Forward to:
                        </label>
                        <input
                          type="text"
                          value={forwardTo}
                          onChange={(e) => setForwardTo(e.target.value)}
                          placeholder="recipient@example.com"
                          className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--quant-foreground)] focus:outline-none focus:border-[#FF8C42]/60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--quant-muted-foreground)] mb-1">
                          Message:
                        </label>
                        <textarea
                          value={forwardMessage}
                          onChange={(e) => setForwardMessage(e.target.value)}
                          rows={2}
                          placeholder="Add an optional note…"
                          className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg p-3 text-xs text-[var(--quant-foreground)] focus:outline-none focus:border-[#FF8C42]/60"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border border-[var(--quant-border)] text-xs text-[var(--quant-muted-foreground)] hover:text-white"
                          onClick={() => {
                            setForwardingId(null);
                            setForwardTo('');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="px-4 py-1.5 rounded-lg bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] text-[#111111] font-semibold text-xs transition-colors"
                          onClick={handleForward}
                          disabled={!forwardTo.trim()}
                        >
                          Forward Message
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default EmailThread;
