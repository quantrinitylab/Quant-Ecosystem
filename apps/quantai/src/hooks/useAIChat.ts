// ============================================================================
// QuantAI - useAIChat Hook (server-persisted)
// Conversations and messages are persisted server-side via the /api/sessions
// endpoints (real AISession / AIMessage rows). This unlocks cross-device
// history, server-side search, and per-message feedback on real message ids.
// ============================================================================

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { getAuthToken, savePreservedChatState, loadPreservedChatState } from '../lib/auth';
import { getGuestToken, clearGuestToken } from '../lib/guest';
import type { ToolCall } from '../types/tool-calls';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  tokens?: number;
  latencyMs?: number;
  isStreaming?: boolean;
  attachments?: string[];
  toolCalls?: ToolCall[];
  reasoning?: string;
  feedback?: 'POSITIVE' | 'NEGATIVE' | null;
  /** True until the message has been persisted server-side (has a real id). */
  pending?: boolean;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: string;
  updatedAt: string;
  /** Whether full message history has been loaded for this conversation. */
  loaded?: boolean;
}

interface UseAIChatOptions {
  defaultModel?: string;
  maxContextTokens?: number;
  streamingEnabled?: boolean;
}

interface UseAIChatReturn {
  conversations: ChatConversation[];
  activeConversation: ChatConversation | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  isLoading: boolean;
  error: string | null;
  currentModel: string;
  tokenCount: number;
  sendMessage: (content: string, attachments?: string[]) => void;
  createConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  switchModel: (modelId: string) => void;
  clearMessages: () => void;
  retryLastMessage: () => void;
  stopStreaming: () => void;
  setFeedback: (messageId: string, value: 'POSITIVE' | 'NEGATIVE') => void;
}

const API_BASE = '/api';

interface ServerSession {
  id: string;
  title: string | null;
  model: string;
  createdAt: string;
  updatedAt: string;
}

interface ServerMessage {
  id: string;
  role: string;
  content: string;
  tokenCount: number | null;
  model: string | null;
  latencyMs: number | null;
  feedback: 'POSITIVE' | 'NEGATIVE' | null;
  createdAt: string;
}

function authHeaders(json = false, token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const t = token ?? getAuthToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  return headers;
}

function mapServerMessage(m: ServerMessage): ChatMessage {
  return {
    id: m.id,
    role: (m.role || 'assistant').toLowerCase() as ChatMessage['role'],
    content: m.content,
    timestamp: m.createdAt,
    model: m.model ?? undefined,
    tokens: m.tokenCount ?? undefined,
    latencyMs: m.latencyMs ?? undefined,
    feedback: m.feedback ?? null,
  };
}

function mapServerSession(s: ServerSession): ChatConversation {
  return {
    id: s.id,
    title: s.title || 'New Chat',
    messages: [],
    model: s.model,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    loaded: false,
  };
}

/**
 * Extract the honest error message from a failed stream response. The stream
 * route relays backend JSON errors as-is and returns its own JSON on 503 —
 * surface that text instead of a bare "Server error: NNN". Never fabricate
 * content here: when the body is unreadable, say so plainly.
 */
async function honestStreamError(res: Response): Promise<string> {
  if (res.status === 401) {
    return 'Authentication failed (401). Please sign in — or start a new guest session — and try again.';
  }
  try {
    const text = await res.text();
    if (text) {
      const parsed = JSON.parse(text) as {
        error?: string | { message?: string };
        message?: string;
      };
      const err: unknown = parsed.error;
      if (typeof err === 'string' && err.trim()) return err;
      if (err && typeof err === 'object' && 'message' in err) {
        const msg = (err as { message?: unknown }).message;
        if (typeof msg === 'string' && msg.trim()) return msg;
      }
      if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message;
    }
  } catch {
    // fall through to the generic message below
  }
  return `Server error: ${res.status}`;
}

export function useAIChat(options: UseAIChatOptions = {}): UseAIChatReturn {
  const { defaultModel = 'muse-spark-1.3' } = options;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string>(defaultModel);
  /**
   * Guest-scoped JWT (POST /api/guest/session) used when no user token
   * exists. It is a REAL credential the backend auth gate accepts, so guest
   * chat runs the real inference path instead of failing 401 on every
   * message. Null while unminted/unavailable.
   */
  const [guestToken, setGuestToken] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Prefetch a guest token for signed-out visitors so the first message
  // doesn't pay the mint latency. No-ops when a user token exists.
  useEffect(() => {
    if (getAuthToken()) return;
    let cancelled = false;
    void getGuestToken().then((token) => {
      if (!cancelled && token) setGuestToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Auth headers for API calls: the user's token when signed in, otherwise
   * the guest token. When neither exists the request goes out unauthenticated
   * and the backend answers 401 — surfaced honestly, never faked.
   */
  const headersWithAuth = useCallback(
    (json = false, token?: string | null): Record<string, string> =>
      authHeaders(json, token ?? getAuthToken() ?? guestToken),
    [guestToken],
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const messages = useMemo(() => activeConversation?.messages ?? [], [activeConversation]);

  const tokenCount = useMemo(
    () => messages.reduce((sum, msg) => sum + (msg.tokens || Math.ceil(msg.content.length / 4)), 0),
    [messages],
  );

  // ---- Initial load: fetch the user's conversations -----------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/sessions?pageSize=50`, { headers: headersWithAuth() });
        const preserved = loadPreservedChatState();
        if (!res.ok) {
          // Unauthenticated or backend offline: restore preserved conversations if available
          if (!cancelled) {
            if (preserved?.conversations && preserved.conversations.length > 0) {
              setConversations(preserved.conversations);
              if (preserved.activeConversationId) {
                setActiveConversationId(preserved.activeConversationId);
              }
            } else {
              setConversations([]);
            }
          }
          return;
        }
        const json = (await res.json()) as { data?: { data?: ServerSession[] } };
        const list = json.data?.data ?? [];
        const serverConvs = list.map(mapServerSession);

        if (!cancelled) {
          if (preserved?.conversations && preserved.conversations.length > 0) {
            // Preserve guest conversations across login by merging
            const missing = preserved.conversations.filter(
              (pc) => !serverConvs.some((sc) => sc.id === pc.id),
            );
            const merged = [...missing, ...serverConvs];
            setConversations(merged);
            if (preserved.activeConversationId) {
              setActiveConversationId(preserved.activeConversationId);
            } else if (merged[0]) {
              setActiveConversationId(merged[0].id);
            }
          } else {
            setConversations(serverConvs);
          }
        }
      } catch {
        const preserved = loadPreservedChatState();
        if (!cancelled) {
          if (preserved?.conversations && preserved.conversations.length > 0) {
            setConversations(preserved.conversations);
            if (preserved.activeConversationId) {
              setActiveConversationId(preserved.activeConversationId);
            }
          } else {
            setConversations([]);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist conversations locally so guest chats and work-in-progress are preserved upon login
  useEffect(() => {
    if (conversations.length > 0) {
      savePreservedChatState({
        conversations,
        activeConversationId,
        savedAt: new Date().toISOString(),
      });
    }
  }, [conversations, activeConversationId]);

  const patchConversation = useCallback(
    (id: string, updater: (c: ChatConversation) => ChatConversation) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
    },
    [],
  );

  const loadMessages = useCallback(
    async (conversationId: string) => {
      try {
        const res = await fetch(`${API_BASE}/sessions/${conversationId}/messages?pageSize=200`, {
          headers: headersWithAuth(),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { data?: ServerMessage[] } };
        const msgs = (json.data?.data ?? []).map(mapServerMessage);
        patchConversation(conversationId, (c) => ({ ...c, messages: msgs, loaded: true }));
      } catch {
        // best-effort; leave existing messages in place
      }
    },
    [patchConversation, headersWithAuth],
  );

  const selectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      setError(null);
      const conv = conversations.find((c) => c.id === id);
      if (conv && !conv.loaded) {
        void loadMessages(id);
      }
    },
    [conversations, loadMessages],
  );

  const createConversation = useCallback(async (): Promise<string | null> => {
    // Guests need a credential before the backend will create a session:
    // mint one on demand (the prefetch effect usually beat us to it). With a
    // guest token the backend creates a REAL session row, so guest chat runs
    // the real inference path instead of failing 401 on every message.
    let token: string | null = getAuthToken() ?? guestToken;
    if (!token) {
      token = await getGuestToken();
      if (token) setGuestToken(token);
    }
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: headersWithAuth(true, token),
        body: JSON.stringify({ model: currentModel }),
      });
      if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
      const json = (await res.json()) as { data?: ServerSession };
      if (!json.data) throw new Error('Malformed create response');
      const conv = { ...mapServerSession(json.data), loaded: true };
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setError(null);
      return conv.id;
    } catch {
      // Offline, or guest sessions unavailable (no secret / rate limited):
      // keep a local-only conversation. Sending from it will surface the
      // honest backend error state — never a fabricated reply.
      const guestId = `guest-conv-${Date.now()}`;
      const localConv: ChatConversation = {
        id: guestId,
        title: 'New Chat',
        messages: [],
        model: currentModel,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        loaded: true,
      };
      setConversations((prev) => [localConv, ...prev]);
      setActiveConversationId(localConv.id);
      setError(null);
      return guestId;
    }
  }, [currentModel, guestToken, headersWithAuth]);

  const deleteConversation = useCallback(
    async (id: string) => {
      // Optimistic removal.
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) setActiveConversationId(null);
      try {
        await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE', headers: headersWithAuth() });
      } catch {
        // ignore — already removed locally
      }
    },
    [activeConversationId, headersWithAuth],
  );

  const appendMessage = useCallback(
    (conversationId: string, message: ChatMessage) => {
      patchConversation(conversationId, (c) => ({
        ...c,
        messages: [...c.messages, message],
        updatedAt: new Date().toISOString(),
      }));
    },
    [patchConversation],
  );

  const sendMessage = useCallback(
    (content: string, attachments?: string[]) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming) return;

      void (async () => {
        let conversationId = activeConversationId;
        if (!conversationId) {
          conversationId = await createConversation();
          if (!conversationId) return;
        }

        const convId = conversationId;
        const tempUserId = `tmp-user-${Date.now()}`;
        const tempAssistantId = `tmp-assistant-${Date.now() + 1}`;

        // Optimistic user message + thinking placeholder.
        appendMessage(convId, {
          id: tempUserId,
          role: 'user',
          content: trimmed,
          timestamp: new Date().toISOString(),
          attachments,
          pending: true,
        });
        appendMessage(convId, {
          id: tempAssistantId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          model: currentModel,
          isStreaming: true,
          pending: true,
        });

        // Title the conversation from the first user message.
        const conv = conversations.find((c) => c.id === convId);
        const isFirstMessage = !conv || conv.messages.length === 0;

        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsStreaming(true);
        setError(null);

        try {
          const res = await fetch(`${API_BASE}/sessions/${convId}/messages/stream`, {
            method: 'POST',
            headers: headersWithAuth(true),
            body: JSON.stringify({ content: trimmed }),
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            throw new Error(await honestStreamError(res));
          }

          // Consume the Server-Sent Events stream, accumulating tokens live.
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let accumulated = '';
          let streamError: string | null = null;

          const applyDelta = (text: string) => {
            patchConversation(convId, (c) => ({
              ...c,
              messages: c.messages.map((m) =>
                m.id === tempAssistantId ? { ...m, content: text, isStreaming: true } : m,
              ),
            }));
          };

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data) as { content?: string; error?: string };
                if (parsed.error) {
                  streamError = parsed.error;
                } else if (parsed.content) {
                  accumulated += parsed.content;
                  applyDelta(accumulated);
                }
              } catch {
                // ignore non-JSON keepalive lines
              }
            }
          }

          if (streamError) throw new Error(streamError);

          // Mark the optimistic pair as settled.
          patchConversation(convId, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === tempAssistantId
                ? { ...m, isStreaming: false, pending: false }
                : m.id === tempUserId
                  ? { ...m, pending: false }
                  : m,
            ),
          }));

          if (isFirstMessage) {
            const title = trimmed.slice(0, 60);
            patchConversation(convId, (c) => ({ ...c, title }));
            void fetch(`${API_BASE}/sessions/${convId}`, {
              method: 'PUT',
              headers: headersWithAuth(true),
              body: JSON.stringify({ title }),
            }).catch(() => undefined);
          }

          // Reconcile with server truth so messages carry real ids (needed for
          // feedback) and the persisted content/token counts.
          await loadMessages(convId);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          const message = err instanceof Error ? err.message : 'Failed to get response';
          // A 401 on a guest credential almost always means the short-lived
          // guest token expired: drop it so the next send mints a fresh one
          // instead of failing the same way forever.
          if (!getAuthToken() && /401/.test(message)) {
            clearGuestToken();
            setGuestToken(null);
          }
          setError(message);
          patchConversation(convId, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === tempAssistantId
                ? {
                    ...m,
                    content: message || 'Sorry, I encountered an error.',
                    isStreaming: false,
                  }
                : m,
            ),
          }));
        } finally {
          setIsStreaming(false);
          abortControllerRef.current = null;
        }
      })();
    },
    [
      activeConversationId,
      isStreaming,
      currentModel,
      conversations,
      createConversation,
      appendMessage,
      patchConversation,
      loadMessages,
      headersWithAuth,
    ],
  );

  const setFeedback = useCallback(
    (messageId: string, value: 'POSITIVE' | 'NEGATIVE') => {
      const convId = activeConversationId;
      if (!convId || messageId.startsWith('tmp-')) return;

      let previous: ChatMessage['feedback'] = null;
      patchConversation(convId, (c) => ({
        ...c,
        messages: c.messages.map((m) => {
          if (m.id !== messageId) return m;
          previous = m.feedback ?? null;
          return { ...m, feedback: previous === value ? null : value };
        }),
      }));

      const next = previous === value ? null : value;
      void fetch(`${API_BASE}/sessions/${convId}/messages/${messageId}/feedback`, {
        method: 'POST',
        headers: headersWithAuth(true),
        body: JSON.stringify({ feedback: next }),
      }).catch(() => {
        // Roll back on failure.
        patchConversation(convId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === messageId ? { ...m, feedback: previous } : m)),
        }));
      });
    },
    [activeConversationId, patchConversation, headersWithAuth],
  );

  const switchModel = useCallback(
    (modelId: string) => {
      setCurrentModel(modelId);
      if (activeConversationId) {
        void fetch(`${API_BASE}/sessions/${activeConversationId}`, {
          method: 'PUT',
          headers: headersWithAuth(true),
          body: JSON.stringify({ model: modelId }),
        }).catch(() => undefined);
        patchConversation(activeConversationId, (c) => ({ ...c, model: modelId }));
      }
    },
    [activeConversationId, patchConversation, headersWithAuth],
  );

  const clearMessages = useCallback(() => {
    if (!activeConversationId) return;
    patchConversation(activeConversationId, (c) => ({ ...c, messages: [] }));
  }, [activeConversationId, patchConversation]);

  const retryLastMessage = useCallback(() => {
    if (!activeConversation) return;
    const lastUser = [...activeConversation.messages].reverse().find((m) => m.role === 'user');
    if (lastUser) sendMessage(lastUser.content);
  }, [activeConversation, sendMessage]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
  }, []);

  return {
    conversations,
    activeConversation,
    messages,
    isStreaming,
    isLoading,
    error,
    currentModel,
    tokenCount,
    sendMessage,
    createConversation: () => void createConversation(),
    selectConversation,
    deleteConversation,
    switchModel,
    clearMessages,
    retryLastMessage,
    stopStreaming,
    setFeedback,
  };
}

export default useAIChat;
