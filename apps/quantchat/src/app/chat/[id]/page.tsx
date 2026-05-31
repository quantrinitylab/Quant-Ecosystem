'use client';

import { use, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { ChatBubble, ChatInput, TypingIndicator, TopBar } from '@quant/shared-ui';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useMessages } from '../../../hooks/useMessages';
import { useSendMessage } from '../../../hooks/useSendMessage';
import { useRealtimeChat } from '../../../hooks/useRealtimeChat';
import { messageListVariants, messageVariants } from '../../../lib/motion-variants';
import { ReactionPicker } from '../../../components/ReactionPicker';
import { VoiceNoteRecorder } from '../../../components/VoiceNoteRecorder';
import { LinkPreviewCard } from '../../../components/LinkPreviewCard';

type DeliveryStatus = 'sent' | 'delivered' | 'read';

interface EnhancedMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  status: DeliveryStatus;
  reactions: string[];
  replyTo?: { id: string; content: string; sender: string } | null;
  imageUrl?: string;
  linkPreview?: { url: string; title: string; description?: string; imageUrl?: string } | null;
  type: 'text' | 'image' | 'voice';
  voiceDurationMs?: number;
}

function DeliveryIndicator({ status }: { status: DeliveryStatus }) {
  if (status === 'sent') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[var(--quant-muted-foreground)]"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === 'delivered') {
    return (
      <svg
        width="16"
        height="14"
        viewBox="0 0 28 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[var(--quant-muted-foreground)]"
      >
        <polyline points="20 6 9 17 4 12" />
        <polyline points="24 6 13 17 10 14" />
      </svg>
    );
  }
  return (
    <svg
      width="16"
      height="14"
      viewBox="0 0 28 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-blue-500"
    >
      <polyline points="20 6 9 17 4 12" />
      <polyline points="24 6 13 17 10 14" />
    </svg>
  );
}

function detectLink(text: string): { url: string; title: string; description?: string } | null {
  const urlRegex = /https?:\/\/[^\s]+/;
  const match = text.match(urlRegex);
  if (match) {
    const url = match[0];
    let hostname = url;
    try {
      hostname = new URL(url).hostname;
    } catch {
      /* use raw */
    }
    return {
      url,
      title: `Link from ${hostname}`,
      description: `Shared content from ${hostname}`,
    };
  }
  return null;
}

function getStatusForMessage(idx: number, total: number): DeliveryStatus {
  if (idx === total - 1) return 'sent';
  if (idx === total - 2) return 'delivered';
  return 'read';
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error, refetch } = useMessages(id);
  const sendMessage = useSendMessage();
  const { typingUsers, incomingMessages, isConnected } = useRealtimeChat(id);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; content: string; sender: string } | null>(
    null,
  );

  const messages: EnhancedMessage[] = useMemo(() => {
    const restMessages = data ?? [];
    const realtimeIds = new Set(incomingMessages.map((m) => m.id));
    const deduped = restMessages.filter((m: { id: string }) => !realtimeIds.has(m.id));

    const allMsgs = [
      ...deduped.map(
        (
          msg: {
            id: string;
            message?: string;
            content?: string;
            sender?: string;
            role?: string;
            timestamp?: string;
            type?: string;
            imageUrl?: string;
            voiceDurationMs?: number;
          },
          idx: number,
        ) => {
          const content = msg.message ?? msg.content ?? '';
          const linkPreview = detectLink(content);
          return {
            id: msg.id,
            content,
            sender: (msg.sender ?? msg.role ?? 'other') as string,
            timestamp: msg.timestamp ?? '',
            status: getStatusForMessage(idx, deduped.length) as DeliveryStatus,
            reactions: reactions[msg.id] || [],
            replyTo: null,
            imageUrl: msg.imageUrl,
            linkPreview,
            type: (msg.type || 'text') as 'text' | 'image' | 'voice',
            voiceDurationMs: msg.voiceDurationMs,
          };
        },
      ),
      ...incomingMessages.map((msg) => {
        const linkPreview = detectLink(msg.content);
        return {
          id: msg.id,
          content: msg.content,
          sender: msg.sender,
          timestamp: msg.timestamp,
          status: 'sent' as DeliveryStatus,
          reactions: reactions[msg.id] || [],
          replyTo: null,
          linkPreview,
          type: 'text' as const,
        };
      }),
    ];

    return allMsgs;
  }, [data, incomingMessages, reactions]);

  const handleReaction = useCallback((msgId: string, emoji: string) => {
    setReactions((prev) => ({
      ...prev,
      [msgId]: [...(prev[msgId] || []), emoji],
    }));
  }, []);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage.mutate({ conversationId: id, content, type: 'text' as const });
      setReplyTo(null);
    },
    [id, sendMessage],
  );

  const handleVoiceRecording = useCallback(
    (durationMs: number) => {
      sendMessage.mutate({
        conversationId: id,
        content: `Voice note (${Math.ceil(durationMs / 1000)}s)`,
        type: 'text' as const,
      });
    },
    [id, sendMessage],
  );

  if (isLoading) return <LoadingState variant="skeleton" text="Loading messages..." />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refetch()} />;

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        title={`Chat ${id}`}
        onBack={() => {
          window.location.href = '/';
        }}
        rightActions={[
          <div key="status" className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-gray-400'}`}
            />
            <span className="text-xs text-[var(--quant-muted-foreground)]">
              {isConnected ? 'Online' : 'Offline'}
            </span>
          </div>,
        ]}
      />
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Send a message to start the conversation"
          />
        ) : (
          <motion.div
            variants={messageListVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                variants={messageVariants}
                className="relative group"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setReactionPickerMsgId(msg.id);
                }}
              >
                {/* Reply-to preview */}
                {msg.replyTo && (
                  <div className="ml-10 mb-1 px-3 py-1 rounded-lg bg-[var(--quant-muted)] border-l-2 border-emerald-500 text-xs text-[var(--quant-muted-foreground)]">
                    <span className="font-medium">{msg.replyTo.sender}</span>:{' '}
                    {msg.replyTo.content.slice(0, 60)}
                  </div>
                )}

                {/* Image message */}
                {msg.type === 'image' && msg.imageUrl && (
                  <div
                    className={`flex ${msg.sender === 'self' ? 'justify-end' : 'justify-start'} mb-1`}
                  >
                    <div className="rounded-2xl overflow-hidden max-w-[200px] border border-[var(--quant-border)]">
                      <img
                        src={msg.imageUrl}
                        alt="Shared image"
                        className="w-full h-auto object-cover"
                      />
                    </div>
                  </div>
                )}

                {/* Voice note */}
                {msg.type === 'voice' && (
                  <div
                    className={`flex ${msg.sender === 'self' ? 'justify-end' : 'justify-start'} mb-1`}
                  >
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[var(--quant-surface)] border border-[var(--quant-border)]">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-emerald-500"
                      >
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </svg>
                      <div className="flex items-center gap-0.5">
                        {[3, 5, 8, 4, 7, 6, 3, 5, 8, 4].map((h, i) => (
                          <div
                            key={i}
                            className="w-0.5 bg-emerald-500 rounded-full"
                            style={{ height: `${h * 2}px` }}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-[var(--quant-muted-foreground)]">
                        {msg.voiceDurationMs ? `${Math.ceil(msg.voiceDurationMs / 1000)}s` : ''}
                      </span>
                    </div>
                  </div>
                )}

                {/* Regular message bubble */}
                {msg.type === 'text' && (
                  <ChatBubble
                    message={msg.content}
                    sender={msg.sender === 'self' ? 'self' : 'other'}
                    timestamp={msg.timestamp}
                    status={msg.status}
                  />
                )}

                {/* Link preview */}
                {msg.linkPreview && (
                  <div
                    className={`mt-1 ${msg.sender === 'self' ? 'flex justify-end' : 'flex justify-start'}`}
                  >
                    <LinkPreviewCard
                      url={msg.linkPreview.url}
                      title={msg.linkPreview.title}
                      description={msg.linkPreview.description}
                      imageUrl={msg.linkPreview.imageUrl}
                    />
                  </div>
                )}

                {/* Delivery status */}
                {msg.sender === 'self' && (
                  <div className="flex justify-end mt-0.5 pr-1">
                    <DeliveryIndicator status={msg.status} />
                  </div>
                )}

                {/* Reactions display */}
                {msg.reactions.length > 0 && (
                  <div
                    className={`flex gap-0.5 mt-1 ${msg.sender === 'self' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-[var(--quant-muted)] border border-[var(--quant-border)] text-sm">
                      {msg.reactions.slice(0, 5).map((r, i) => (
                        <span key={i}>{r}</span>
                      ))}
                      {msg.reactions.length > 1 && (
                        <span className="text-xs text-[var(--quant-muted-foreground)] ml-1">
                          {msg.reactions.length}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Reply button (visible on hover/tap) */}
                <div
                  className={`absolute top-1 ${msg.sender === 'self' ? 'left-0' : 'right-0'} opacity-0 group-hover:opacity-100 transition-opacity`}
                >
                  <button
                    className="min-w-touch min-h-touch flex items-center justify-center text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
                    onClick={() =>
                      setReplyTo({ id: msg.id, content: msg.content, sender: msg.sender })
                    }
                    aria-label="Reply"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 17 4 12 9 7" />
                      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                    </svg>
                  </button>
                </div>

                {/* Reaction picker */}
                {reactionPickerMsgId === msg.id && (
                  <div className="relative">
                    <ReactionPicker
                      isOpen={true}
                      onSelect={(emoji) => handleReaction(msg.id, emoji)}
                      onClose={() => setReactionPickerMsgId(null)}
                    />
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
        <TypingIndicator users={typingUsers} />
      </div>

      {/* Reply-to preview above input */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            className="px-4 py-2 bg-[var(--quant-surface)] border-t border-[var(--quant-border)] flex items-center gap-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', ...spring.stiff }}
          >
            <div className="flex-1 border-l-2 border-emerald-500 pl-3">
              <p className="text-xs font-medium text-emerald-500">
                Replying to {replyTo.sender === 'self' ? 'yourself' : replyTo.sender}
              </p>
              <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
                {replyTo.content.slice(0, 80)}
              </p>
            </div>
            <button
              className="min-w-touch min-h-touch flex items-center justify-center text-[var(--quant-muted-foreground)]"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
            >
              &#10005;
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area with voice note */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--quant-border)] bg-[var(--quant-background)]">
        <div className="flex-1">
          <ChatInput
            onSend={handleSend}
            placeholder={replyTo ? 'Type your reply...' : 'Type a message...'}
          />
        </div>
        <VoiceNoteRecorder onRecordingComplete={handleVoiceRecording} />
      </div>
    </div>
  );
}
