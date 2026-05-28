// ============================================================================
// QuantMail - Email Thread View
// Conversation with reply collapsing, reply/forward, attachments, quoted text
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sanitizeHtmlContent } from '@quant/shared-ui';

interface EmailAddress {
  name?: string;
  email: string;
  avatarUrl?: string;
}

interface ThreadAttachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  url: string;
}

interface ThreadMessage {
  id: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  body: string;
  htmlBody: string;
  attachments: ThreadAttachment[];
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  replyTo?: string;
  inReplyTo?: string;
}

interface ThreadData {
  id: string;
  subject: string;
  messages: ThreadMessage[];
  participants: EmailAddress[];
  labels: string[];
  isArchived: boolean;
  isMuted: boolean;
  lastActivityAt: string;
}

interface ThreadPageProps {
  threadId: string;
}

export const ThreadPage: React.FC<ThreadPageProps> = ({ threadId }) => {
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [replyMode, setReplyMode] = useState<'none' | 'reply' | 'reply-all' | 'forward'>('none');
  const [replyBody, setReplyBody] = useState<string>('');
  const [replyTo, setReplyTo] = useState<string[]>([]);
  const [replyCc, setReplyCc] = useState<string[]>([]);
  const [forwardTo, setForwardTo] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [showQuoted, setShowQuoted] = useState<Set<string>>(new Set());
  const [selectedAttachment, setSelectedAttachment] = useState<ThreadAttachment | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/emails/threads/${threadId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch thread');
      const data = await response.json();
      setThread(data);
      if (data.messages.length > 0) {
        const lastId = data.messages[data.messages.length - 1].id;
        setExpandedMessages(new Set([lastId]));
      }
      await fetch(`/api/emails/threads/${threadId}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [thread]);

  const toggleMessage = useCallback((messageId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const toggleQuoted = useCallback((messageId: string) => {
    setShowQuoted((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const handleReply = useCallback(
    (message: ThreadMessage, mode: 'reply' | 'reply-all' | 'forward') => {
      setReplyMode(mode);
      if (mode === 'reply') {
        setReplyTo([message.from.email]);
        setReplyCc([]);
      } else if (mode === 'reply-all') {
        setReplyTo([message.from.email, ...message.to.map((t) => t.email)]);
        setReplyCc(message.cc.map((c) => c.email));
      } else {
        setReplyTo([]);
        setReplyCc([]);
      }
      setReplyBody('');
    },
    [],
  );

  const handleSendReply = useCallback(async () => {
    if (!thread) return;
    const recipients =
      replyMode === 'forward'
        ? forwardTo
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean)
        : replyTo;
    if (recipients.length === 0 || !replyBody.trim()) return;
    setSending(true);
    try {
      const lastMessage = thread.messages[thread.messages.length - 1];
      const payload = {
        threadId: thread.id,
        inReplyTo: lastMessage.id,
        to: recipients,
        cc: replyCc,
        subject: replyMode === 'forward' ? `Fwd: ${thread.subject}` : `Re: ${thread.subject}`,
        body: replyBody,
        isForward: replyMode === 'forward',
      };
      const response = await fetch('/api/emails/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to send reply');
      const sentMessage = await response.json();
      setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, sentMessage] } : prev));
      setReplyMode('none');
      setReplyBody('');
      setReplyTo([]);
      setReplyCc([]);
      setForwardTo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }, [thread, replyMode, replyTo, replyCc, replyBody, forwardTo]);

  const handleStarThread = useCallback(async () => {
    if (!thread) return;
    try {
      await fetch(`/api/emails/threads/${threadId}/star`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
    } catch (err) {
      console.error('Failed to star thread:', err);
    }
  }, [thread, threadId]);

  const handleArchiveThread = useCallback(async () => {
    if (!thread) return;
    try {
      await fetch(`/api/emails/threads/${threadId}/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setThread((prev) => (prev ? { ...prev, isArchived: true } : prev));
    } catch (err) {
      console.error('Failed to archive:', err);
    }
  }, [thread, threadId]);

  const handleMuteThread = useCallback(async () => {
    if (!thread) return;
    try {
      await fetch(`/api/emails/threads/${threadId}/mute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setThread((prev) => (prev ? { ...prev, isMuted: !prev.isMuted } : prev));
    } catch (err) {
      console.error('Failed to mute:', err);
    }
  }, [thread, threadId]);

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const extractQuotedText = (body: string): { main: string; quoted: string } => {
    const quoteMarkers = ['On ', '---', '> '];
    let splitIndex = -1;
    for (const marker of quoteMarkers) {
      const idx = body.lastIndexOf(marker);
      if (idx > body.length * 0.3) {
        splitIndex = idx;
        break;
      }
    }
    if (splitIndex > 0) {
      return { main: body.slice(0, splitIndex).trim(), quoted: body.slice(splitIndex).trim() };
    }
    return { main: body, quoted: '' };
  };

  if (loading) {
    return (
      <div className="thread-loading">
        <div className="skeleton-subject"></div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="message-skeleton">
            <div className="skeleton-header"></div>
            <div className="skeleton-body"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="thread-error">
        <h2>Thread Not Found</h2>
        <p>{error || 'This thread could not be loaded.'}</p>
        <button onClick={fetchThread}>Retry</button>
      </div>
    );
  }

  return (
    <div className="thread-page">
      <header className="thread-header">
        <h1 className="thread-subject">{thread.subject}</h1>
        <div className="thread-meta">
          <span className="message-count">{thread.messages.length} messages</span>
          <span className="participants-count">{thread.participants.length} participants</span>
          {thread.labels.map((l) => (
            <span key={l} className="thread-label">
              {l}
            </span>
          ))}
        </div>
        <div className="thread-actions">
          <button onClick={handleStarThread} title="Star">
            &#9733;
          </button>
          <button onClick={handleArchiveThread} title="Archive">
            &#x1F4E6;
          </button>
          <button onClick={handleMuteThread} title={thread.isMuted ? 'Unmute' : 'Mute'}>
            {thread.isMuted ? '&#x1F514;' : '&#x1F515;'}
          </button>
        </div>
      </header>

      <div className="thread-messages">
        {thread.messages.map((message, index) => {
          const isExpanded = expandedMessages.has(message.id);
          const isLast = index === thread.messages.length - 1;
          const { main, quoted } = extractQuotedText(message.body);

          return (
            <div
              key={message.id}
              className={`thread-message ${isExpanded ? 'expanded' : 'collapsed'}`}
            >
              <div className="message-header" onClick={() => toggleMessage(message.id)}>
                <div className="sender-info">
                  <div className="sender-avatar">
                    {message.from.avatarUrl ? (
                      <img src={message.from.avatarUrl} alt="" />
                    ) : (
                      <span>
                        {(message.from.name || message.from.email).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="sender-details">
                    <span className="sender-name">{message.from.name || message.from.email}</span>
                    {isExpanded && (
                      <span className="sender-email">&lt;{message.from.email}&gt;</span>
                    )}
                  </div>
                </div>
                <div className="message-time">{formatDate(message.receivedAt)}</div>
                {!isExpanded && (
                  <div className="message-snippet">{message.body.slice(0, 100)}...</div>
                )}
              </div>

              {isExpanded && (
                <div className="message-content">
                  {message.to.length > 0 && (
                    <div className="recipients-line">
                      <span className="label">To:</span>{' '}
                      {message.to.map((t) => t.name || t.email).join(', ')}
                      {message.cc.length > 0 && (
                        <>
                          <span className="label"> Cc:</span>{' '}
                          {message.cc.map((c) => c.name || c.email).join(', ')}
                        </>
                      )}
                    </div>
                  )}

                  <div className="message-body">
                    {message.htmlBody ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(message.htmlBody) }}
                        className="html-body"
                      />
                    ) : (
                      <div className="text-body">
                        <p>{main}</p>
                        {quoted && (
                          <div className="quoted-section">
                            <button
                              onClick={() => toggleQuoted(message.id)}
                              className="toggle-quoted"
                            >
                              {showQuoted.has(message.id)
                                ? 'Hide quoted text'
                                : '... Show quoted text'}
                            </button>
                            {showQuoted.has(message.id) && (
                              <blockquote className="quoted-text">{quoted}</blockquote>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {message.attachments.length > 0 && (
                    <div className="message-attachments">
                      <h4>Attachments ({message.attachments.length})</h4>
                      <div className="attachment-grid">
                        {message.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="attachment-card"
                            onClick={() => setSelectedAttachment(att)}
                          >
                            <div className="attachment-icon">
                              {att.mimeType.startsWith('image/')
                                ? '&#x1F5BC;'
                                : att.mimeType.includes('pdf')
                                  ? '&#x1F4C4;'
                                  : '&#x1F4CE;'}
                            </div>
                            <div className="attachment-details">
                              <span className="attachment-name">{att.filename}</span>
                              <span className="attachment-size">{formatFileSize(att.size)}</span>
                            </div>
                            <a
                              href={att.url}
                              download
                              className="download-btn"
                              onClick={(e) => e.stopPropagation()}
                            >
                              &#x2B07;
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="message-actions">
                    <button onClick={() => handleReply(message, 'reply')} className="reply-btn">
                      &#x21A9; Reply
                    </button>
                    <button
                      onClick={() => handleReply(message, 'reply-all')}
                      className="reply-all-btn"
                    >
                      &#x21A9;&#x21A9; Reply All
                    </button>
                    <button onClick={() => handleReply(message, 'forward')} className="forward-btn">
                      &#x21AA; Forward
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {replyMode !== 'none' && (
        <div className="reply-composer">
          <div className="reply-header">
            <h3>
              {replyMode === 'forward'
                ? 'Forward'
                : replyMode === 'reply-all'
                  ? 'Reply All'
                  : 'Reply'}
            </h3>
            <button onClick={() => setReplyMode('none')} className="close-reply">
              &#x2715;
            </button>
          </div>
          {replyMode === 'forward' ? (
            <div className="reply-recipients">
              <label>To:</label>
              <input
                type="text"
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
                placeholder="recipient@example.com"
              />
            </div>
          ) : (
            <div className="reply-recipients">
              <div>
                <label>To:</label> <span>{replyTo.join(', ')}</span>
              </div>
              {replyCc.length > 0 && (
                <div>
                  <label>Cc:</label> <span>{replyCc.join(', ')}</span>
                </div>
              )}
            </div>
          )}
          <textarea
            className="reply-textarea"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write your reply..."
            rows={6}
            autoFocus
          />
          <div className="reply-actions">
            <button
              onClick={handleSendReply}
              disabled={sending || !replyBody.trim()}
              className="send-reply-btn"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
            <button onClick={() => setReplyMode('none')} className="discard-reply">
              Discard
            </button>
          </div>
        </div>
      )}

      {selectedAttachment && (
        <div className="attachment-preview-modal" onClick={() => setSelectedAttachment(null)}>
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
            <h3>{selectedAttachment.filename}</h3>
            {selectedAttachment.mimeType.startsWith('image/') ? (
              <img
                src={selectedAttachment.url}
                alt={selectedAttachment.filename}
                className="preview-image"
              />
            ) : (
              <div className="no-preview">
                <p>Preview not available for this file type.</p>
              </div>
            )}
            <div className="preview-actions">
              <a href={selectedAttachment.url} download className="download-full-btn">
                Download ({formatFileSize(selectedAttachment.size)})
              </a>
              <button onClick={() => setSelectedAttachment(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThreadPage;
