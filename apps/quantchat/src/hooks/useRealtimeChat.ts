import { useState, useEffect, useCallback, useRef } from 'react';
import { useRealtime } from '../providers/realtime-context';
import type { RealtimeEvent } from '@quant/realtime';

interface RealtimeMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
}

interface ReadReceipt {
  messageId: string;
  userId: string;
  readAt: string;
}

const MAX_INCOMING_MESSAGES = 200;
const TYPING_TIMEOUT_MS = 5000;

export function useRealtimeChat(conversationId: string) {
  const { subscribe, publish, isConnected } = useRealtime();
  const [incomingMessages, setIncomingMessages] = useState<RealtimeMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [readReceipts, setReadReceipts] = useState<Map<string, ReadReceipt>>(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!conversationId) return;

    const channel = `chat:${conversationId}`;

    const unsubscribe = subscribe(channel, (event: RealtimeEvent) => {
      const ev = event as RealtimeEvent & {
        type: string;
        payload?: any;
        data?: any;
        userId?: string;
        messageId?: string;
        message?: any;
      };
      const type = ev.type;

      if (type === 'message:new' || type === 'message') {
        const msg = ev.payload || ev.data || ev.message;
        if (msg) {
          setIncomingMessages((prev) => {
            const next = [
              ...prev,
              {
                id: msg.id || crypto.randomUUID(),
                content: msg.content || msg.message || '',
                sender: msg.sender || msg.userId || 'other',
                timestamp: msg.timestamp || new Date().toISOString(),
              },
            ];
            // Cap at MAX_INCOMING_MESSAGES to prevent unbounded memory growth
            if (next.length > MAX_INCOMING_MESSAGES) {
              return next.slice(next.length - MAX_INCOMING_MESSAGES);
            }
            return next;
          });
        }
      } else if (type === 'typing:start') {
        const userId = ev.userId || (ev.payload as any)?.userId;
        if (userId) {
          setTypingUsers((prev) => (prev.includes(userId) ? prev : [...prev, userId]));

          // Clear any existing timeout for this user and start a new one
          const existingTimer = typingTimersRef.current.get(userId);
          if (existingTimer) clearTimeout(existingTimer);

          const timer = setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u !== userId));
            typingTimersRef.current.delete(userId);
          }, TYPING_TIMEOUT_MS);
          typingTimersRef.current.set(userId, timer);
        }
      } else if (type === 'typing:stop') {
        const userId = ev.userId || (ev.payload as any)?.userId;
        if (userId) {
          setTypingUsers((prev) => prev.filter((u) => u !== userId));
          // Clear the timeout since we received an explicit stop
          const existingTimer = typingTimersRef.current.get(userId);
          if (existingTimer) {
            clearTimeout(existingTimer);
            typingTimersRef.current.delete(userId);
          }
        }
      } else if (type === 'message:read') {
        const messageId = ev.messageId || (ev.payload as any)?.messageId;
        const userId = ev.userId || (ev.payload as any)?.userId;
        if (messageId && userId) {
          setReadReceipts((prev) => {
            const next = new Map(prev);
            next.set(messageId, {
              messageId,
              userId,
              readAt: (ev.payload as any)?.readAt || new Date().toISOString(),
            });
            return next;
          });
        }
      }
    });

    return () => {
      unsubscribe();
      // Clear all typing timers on cleanup
      typingTimersRef.current.forEach((timer) => clearTimeout(timer));
      typingTimersRef.current.clear();
    };
  }, [conversationId, subscribe]);

  const sendRealtimeMessage = useCallback(
    (content: string) => {
      const channel = `chat:${conversationId}`;
      publish(channel, {
        type: 'message:new',
        content,
        timestamp: new Date().toISOString(),
      });
    },
    [conversationId, publish],
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      const channel = `chat:${conversationId}`;
      publish(channel, {
        type: isTyping ? 'typing:start' : 'typing:stop',
      });
    },
    [conversationId, publish],
  );

  const markRead = useCallback(
    (messageId: string) => {
      const channel = `chat:${conversationId}`;
      publish(channel, {
        type: 'message:read',
        messageId,
      });
    },
    [conversationId, publish],
  );

  return {
    sendRealtimeMessage,
    setTyping,
    markRead,
    typingUsers,
    incomingMessages,
    readReceipts,
    isConnected,
  };
}

export default useRealtimeChat;
