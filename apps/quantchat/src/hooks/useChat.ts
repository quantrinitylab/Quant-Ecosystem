// ============================================================================
// QuantChat - useChat Hook
// WebSocket connection, send/receive messages, typing, read receipts, status
// ============================================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthHeaders, getAuthHeadersWithContent, getWsAuthUrl } from '../lib/auth';

interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'sticker';
  timestamp: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  replyTo?: string;
  reactions: { emoji: string; userId: string }[];
  isEdited: boolean;
  disappearsAt?: string;
}
interface TypingIndicator {
  userId: string;
  conversationId: string;
  startedAt: number;
}
interface UseChatOptions {
  conversationId: string;
  userId: string;
  autoConnect?: boolean;
}
interface UseChatReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  typingUsers: string[];
  sendMessage: (content: string, type?: string, replyTo?: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  reactToMessage: (messageId: string, emoji: string) => Promise<void>;
  markAsRead: (messageId: string) => void;
  setTyping: (isTyping: boolean) => void;
  loadMoreMessages: () => Promise<void>;
  hasMore: boolean;
  reconnect: () => void;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const { conversationId, userId, autoConnect = true } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef<number>(0);

  const connect = useCallback(() => {
    const wsUrl = getWsAuthUrl(conversationId);
    try {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setConnected(true);
        reconnectAttempts.current = 0;
        setError(null);
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'message':
            setMessages((prev) => [...prev, data.message]);
            break;
          case 'message_status':
            setMessages((prev) =>
              prev.map((m) => (m.id === data.messageId ? { ...m, status: data.status } : m)),
            );
            break;
          case 'typing_start':
            setTypingUsers((prev) => (prev.includes(data.userId) ? prev : [...prev, data.userId]));
            break;
          case 'typing_stop':
            setTypingUsers((prev) => prev.filter((id) => id !== data.userId));
            break;
          case 'message_edited':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === data.messageId ? { ...m, content: data.content, isEdited: true } : m,
              ),
            );
            break;
          case 'message_deleted':
            setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
            break;
          case 'reaction':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === data.messageId
                  ? {
                      ...m,
                      reactions: [...m.reactions, { emoji: data.emoji, userId: data.userId }],
                    }
                  : m,
              ),
            );
            break;
          case 'read_receipt':
            setMessages((prev) =>
              prev.map((m) => (m.id === data.messageId ? { ...m, status: 'read' } : m)),
            );
            break;
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (reconnectAttempts.current < 5) {
          reconnectTimeoutRef.current = setTimeout(
            () => {
              reconnectAttempts.current++;
              connect();
            },
            Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000),
          );
        }
      };
      ws.onerror = () => {
        setError('Connection error');
      };
      wsRef.current = ws;
    } catch (err) {
      setError('Failed to connect');
    }
  }, [conversationId]);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/messages/${conversationId}?page=${page}&limit=50`, {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) throw new Error('Failed to fetch messages');
      const data = await response.json();
      if (page === 1) setMessages(data.messages || []);
      else setMessages((prev) => [...(data.messages || []), ...prev]);
      setHasMore(data.hasMore || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [conversationId, page]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);
  useEffect(() => {
    if (autoConnect) connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect, autoConnect]);

  const sendMessage = useCallback(
    async (content: string, type: string = 'text', replyTo?: string) => {
      const tempId = `temp_${Date.now()}`;
      const tempMsg: ChatMessage = {
        id: tempId,
        senderId: userId,
        content,
        type: type as ChatMessage['type'],
        timestamp: new Date().toISOString(),
        status: 'sending',
        reactions: [],
        isEdited: false,
        replyTo,
      };
      setMessages((prev) => [...prev, tempMsg]);
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: 'send_message', content, messageType: type, replyTo }),
          );
        } else {
          const response = await fetch(`/api/messages/${conversationId}`, {
            method: 'POST',
            headers: { ...getAuthHeadersWithContent() },
            body: JSON.stringify({ content, type, replyTo }),
          });
          if (!response.ok) throw new Error('Send failed');
          const sent = await response.json();
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...sent, status: 'sent' } : m)),
          );
        }
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m)));
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
      }
    },
    [conversationId, userId],
  );

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'edit_message', messageId, content }));
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content, isEdited: true } : m)),
    );
  }, []);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'delete_message', messageId }));
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'react', messageId, emoji }));
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, reactions: [...m.reactions, { emoji, userId }] } : m,
        ),
      );
    },
    [userId],
  );

  const markAsRead = useCallback((messageId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'read_receipt', messageId }));
    }
  }, []);

  const setTyping = useCallback((isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: isTyping ? 'typing_start' : 'typing_stop' }));
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN)
          wsRef.current.send(JSON.stringify({ type: 'typing_stop' }));
      }, 3000);
    }
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (hasMore) setPage((p) => p + 1);
  }, [hasMore]);
  const reconnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return {
    messages,
    loading,
    error,
    connected,
    typingUsers,
    sendMessage,
    editMessage,
    deleteMessage,
    reactToMessage,
    markAsRead,
    setTyping,
    loadMoreMessages,
    hasMore,
    reconnect,
  };
}

export default useChat;
