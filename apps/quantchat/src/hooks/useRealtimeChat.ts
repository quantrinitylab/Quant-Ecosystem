import { useState, useEffect, useCallback, useRef } from 'react';
import { chatSocket } from '../services/chat-socket';

// ============================================================================
// useRealtimeChat — realtime chat state for a conversation (QM-UIUX-055)
//
// Previously this hook spoke a private protocol over RealtimeProvider's `/ws`
// socket: it published `{type:'typing:start'}` frames the backend silently
// ignores (backend only handles `{type:'typing', conversationId, isTyping}`)
// and subscribed to a `chat:<id>` channel the backend never sends to — so
// `typingUsers` was always empty and indicators never rendered.
//
// It now rides the working `chatSocket` singleton (`/ws/chat`), whose wire
// protocol matches `backend/routes/websocket.ts`:
//   client -> server: { type: 'typing', conversationId, isTyping }
//                      { type: 'chat_message', conversationId, ... }
//                      { type: 'message:read', messageId, conversationId }
//   server -> client: normalized { type: 'typing_indicator' | 'new_message' |
//                      'message:read' | 'message:delivered', data, envelope }
// ============================================================================

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
  const [incomingMessages, setIncomingMessages] = useState<RealtimeMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [readReceipts, setReadReceipts] = useState<Map<string, ReadReceipt>>(new Map());
  const [isConnected, setIsConnected] = useState(() => chatSocket.getState() === 'open');
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTypingUser = useCallback((userId: string) => {
    setTypingUsers((prev) => prev.filter((u) => u !== userId));
    const existingTimer = typingTimersRef.current.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      typingTimersRef.current.delete(userId);
    }
  }, []);

  const markUserTyping = useCallback((userId: string) => {
    setTypingUsers((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    // Safety net: auto-clear after TYPING_TIMEOUT_MS in case the peer's
    // explicit stop frame is lost (matches the previous behavior).
    const existingTimer = typingTimersRef.current.get(userId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      setTypingUsers((prev) => prev.filter((u) => u !== userId));
      typingTimersRef.current.delete(userId);
    }, TYPING_TIMEOUT_MS);
    typingTimersRef.current.set(userId, timer);
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    chatSocket.acquire();
    chatSocket.subscribe(conversationId);
    const unsubscribeState = chatSocket.onStateChange((state) => {
      setIsConnected(state === 'open');
    });
    setIsConnected(chatSocket.getState() === 'open');

    const unsubscribeMessage = chatSocket.onMessage((event: any) => {
      const type = event?.type;
      const data = event?.data ?? {};

      if (type === 'typing_indicator') {
        const userId: string | undefined = data.userId;
        if (!userId) return;
        if (data.isTyping) {
          markUserTyping(userId);
        } else {
          clearTypingUser(userId);
        }
      } else if (type === 'new_message') {
        const msg = data;
        if (msg && (msg.content || msg.message)) {
          setIncomingMessages((prev) => {
            const next = [
              ...prev,
              {
                id: msg.id || crypto.randomUUID(),
                content: msg.content || msg.message || '',
                sender: msg.sender || msg.senderId || msg.userId || 'other',
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
      } else if (type === 'message:read') {
        const messageId: string | undefined = data.messageId;
        const userId: string | undefined = data.userId;
        if (messageId && userId) {
          setReadReceipts((prev) => {
            const next = new Map(prev);
            next.set(messageId, {
              messageId,
              userId,
              readAt: data.readAt || new Date().toISOString(),
            });
            return next;
          });
        }
      }
    });

    return () => {
      unsubscribeMessage();
      unsubscribeState();
      chatSocket.unsubscribe(conversationId);
      chatSocket.release();
      // Clear all typing timers on cleanup
      typingTimersRef.current.forEach((timer) => clearTimeout(timer));
      typingTimersRef.current.clear();
    };
  }, [conversationId, markUserTyping, clearTypingUser]);

  const sendRealtimeMessage = useCallback(
    (content: string) => {
      chatSocket.send({
        type: 'chat_message',
        conversationId,
        content,
        timestamp: new Date().toISOString(),
      });
    },
    [conversationId],
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      chatSocket.send({
        type: 'typing',
        conversationId,
        isTyping,
      });
    },
    [conversationId],
  );

  const markRead = useCallback(
    (messageId: string) => {
      chatSocket.send({
        type: 'message:read',
        messageId,
        conversationId,
      });
    },
    [conversationId],
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
