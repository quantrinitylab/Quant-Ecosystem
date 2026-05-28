// ============================================================================
// QuantMail - Email Thread Component
// Email conversation thread view
// ============================================================================

import React, { useState } from 'react';
import { sanitizeHtmlContent } from '@quant/shared-ui';
import type { Email, EmailThread as EmailThreadType, EmailAddress } from '../types';

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
    onAddLabel,
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
    const result = await onAISummarize(emailId);
    setSummary(result);
    setActiveEmailId(emailId);
  };

  const handleSuggestReplies = async (emailId: string) => {
    const suggestions = await onAISuggestReplies(emailId);
    setReplySuggestions(suggestions);
    setActiveEmailId(emailId);
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
    <div className="email-thread">
      {/* Thread Header */}
      <div className="thread-header">
        <button className="btn btn-sm btn-icon" onClick={onBack}>
          Back
        </button>
        <h2 className="thread-subject">{thread.subject}</h2>
        <div className="thread-meta">
          <span>{thread.messageCount} messages</span>
          <span>{thread.participants.length} participants</span>
        </div>
        <div className="thread-actions">
          <button
            className="btn btn-sm btn-outline"
            onClick={() => onArchive(thread.messages[0]?.id)}
          >
            Archive
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => onDelete(thread.messages[0]?.id)}
          >
            Delete
          </button>
        </div>
      </div>

      {/* AI Summary */}
      {summary && activeEmailId && (
        <div className="ai-summary-banner">
          <span className="ai-badge">AI Summary</span>
          <p>{summary}</p>
          <button className="btn-link btn-sm" onClick={() => setSummary(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="thread-messages">
        {thread.messages.map((email, index) => {
          const isExpanded = expandedMessages.has(email.id);
          const isLast = index === thread.messages.length - 1;

          return (
            <div key={email.id} className={`message-card ${isExpanded ? 'expanded' : 'collapsed'}`}>
              {/* Message Header */}
              <div className="message-header" onClick={() => toggleExpanded(email.id)}>
                <div className="sender-avatar">
                  <span>{(email.from.name || email.from.email).charAt(0).toUpperCase()}</span>
                </div>
                <div className="sender-info">
                  <span className="sender-name">{email.from.name || email.from.email}</span>
                  <span className="sender-email">&lt;{email.from.email}&gt;</span>
                </div>
                <div className="message-date">{formatDate(email.receivedAt)}</div>
                <button
                  className={`star-btn ${email.isStarred ? 'starred' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(email.id);
                  }}
                >
                  {email.isStarred ? '\u2605' : '\u2606'}
                </button>
              </div>

              {/* Message Body */}
              {isExpanded && (
                <div className="message-body">
                  <div className="message-recipients">
                    <span>To: {email.to.map((r) => r.name || r.email).join(', ')}</span>
                    {email.cc.length > 0 && (
                      <span>Cc: {email.cc.map((r) => r.email).join(', ')}</span>
                    )}
                  </div>
                  <div
                    className="message-content"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtmlContent(
                        email.bodyHtml || email.bodyText.replace(/\n/g, '<br>'),
                      ),
                    }}
                  />

                  {/* Attachments */}
                  {email.attachments.length > 0 && (
                    <div className="message-attachments">
                      <h5>Attachments ({email.attachments.length})</h5>
                      {email.attachments.map((att) => (
                        <div key={att.id} className="attachment-item">
                          <span className="attachment-icon">📎</span>
                          <span className="attachment-name">{att.filename}</span>
                          <span className="attachment-size">
                            ({Math.round(att.size / 1024)} KB)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message Actions */}
                  <div className="message-actions">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => {
                        setReplyingTo(email.id);
                        setReplyAll(false);
                      }}
                    >
                      Reply
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => {
                        setReplyingTo(email.id);
                        setReplyAll(true);
                      }}
                    >
                      Reply All
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => setForwardingId(email.id)}
                    >
                      Forward
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleSummarize(email.id)}
                    >
                      AI Summarize
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handleSuggestReplies(email.id)}
                    >
                      AI Suggest Reply
                    </button>
                  </div>

                  {/* Reply Suggestions */}
                  {replySuggestions.length > 0 && activeEmailId === email.id && (
                    <div className="reply-suggestions">
                      <h5>Suggested Replies:</h5>
                      {replySuggestions.map((suggestion, i) => (
                        <button
                          key={i}
                          className="suggestion-btn"
                          onClick={() => useSuggestion(suggestion, email.id)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Reply Form */}
                  {replyingTo === email.id && (
                    <div className="reply-form">
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder={`Reply to ${email.from.name || email.from.email}...`}
                        rows={5}
                        autoFocus
                      />
                      <div className="reply-form-actions">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={replyAll}
                            onChange={(e) => setReplyAll(e.target.checked)}
                          />
                          Reply All
                        </label>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyBody('');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={handleReply}
                          disabled={!replyBody.trim()}
                        >
                          Send Reply
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Forward Form */}
                  {forwardingId === email.id && (
                    <div className="forward-form">
                      <div className="form-group">
                        <label>Forward to:</label>
                        <input
                          type="text"
                          value={forwardTo}
                          onChange={(e) => setForwardTo(e.target.value)}
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="form-group">
                        <label>Additional message:</label>
                        <textarea
                          value={forwardMessage}
                          onChange={(e) => setForwardMessage(e.target.value)}
                          rows={3}
                        />
                      </div>
                      <div className="forward-form-actions">
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            setForwardingId(null);
                            setForwardTo('');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={handleForward}
                          disabled={!forwardTo.trim()}
                        >
                          Forward
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Collapsed preview */}
              {!isExpanded && <p className="message-snippet">{email.snippet}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default EmailThread;
