'use client';

import { use, useMemo } from 'react';
import { ChatBubble, ChatInput, TypingIndicator, TopBar } from '@quant/shared-ui';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useMessages } from '../../../hooks/useMessages';
import { useSendMessage } from '../../../hooks/useSendMessage';
import { useRealtimeChat } from '../../../hooks/useRealtimeChat';

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error, refetch } = useMessages(id);
  const sendMessage = useSendMessage();
  const { typingUsers, incomingMessages, isConnected } = useRealtimeChat(id);

  const messages = useMemo(() => {
    const restMessages = data ?? [];
    const realtimeIds = new Set(incomingMessages.map((m) => m.id));
    const deduped = restMessages.filter((m: { id: string }) => !realtimeIds.has(m.id));
    return [
      ...deduped.map(
        (msg: {
          id: string;
          message?: string;
          content?: string;
          sender?: string;
          role?: string;
          timestamp?: string;
        }) => ({
          id: msg.id,
          content: msg.message ?? msg.content ?? '',
          sender: (msg.sender ?? msg.role ?? 'other') as string,
          timestamp: msg.timestamp ?? '',
          status: 'read' as const,
        }),
      ),
      ...incomingMessages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.timestamp,
        status: 'sent' as const,
      })),
    ];
  }, [data, incomingMessages]);

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
          messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg.content}
              sender={msg.sender === 'self' ? 'self' : 'other'}
              timestamp={msg.timestamp}
              status={msg.status}
            />
          ))
        )}
        <TypingIndicator users={typingUsers} />
      </div>
      <ChatInput
        onSend={(content) => {
          sendMessage.mutate({ conversationId: id, content, type: 'text' as const });
        }}
        placeholder="Type a message..."
      />
    </div>
  );
}
