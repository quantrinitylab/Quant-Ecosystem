// ============================================================================
// QuantAI - useAIChat Hook
// Streaming chat state, message history, context window, model switching
// ============================================================================

import { useState, useCallback, useRef, useMemo } from 'react';
import { getAuthToken } from '../lib/auth';
import type { ToolCall } from '../types/tool-calls';

interface ChatMessage {
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
}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: string;
  updatedAt: string;
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
}

const API_BASE = '/api';

export function useAIChat(options: UseAIChatOptions = {}): UseAIChatReturn {
  const { defaultModel = 'gpt-4', maxContextTokens = 128000, streamingEnabled = true } = options;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string>(defaultModel);

  const abortControllerRef = useRef<AbortController | null>(null);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return null;
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const messages = useMemo(() => {
    return activeConversation?.messages || [];
  }, [activeConversation]);

  const tokenCount = useMemo(() => {
    return messages.reduce(
      (sum, msg) => sum + (msg.tokens || Math.ceil(msg.content.length / 4)),
      0,
    );
  }, [messages]);

  const createConversation = useCallback(() => {
    const newConv: ChatConversation = {
      id: `conv-${Date.now()}`,
      title: 'New Chat',
      messages: [],
      model: currentModel,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setError(null);
  }, [currentModel]);

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setError(null);
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
    [activeConversationId],
  );

  const addMessageToConversation = useCallback(
    (message: ChatMessage) => {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== activeConversationId) return conv;
          const updatedMessages = [...conv.messages, message];
          const title =
            conv.messages.length === 0 && message.role === 'user'
              ? message.content.slice(0, 40)
              : conv.title;
          return { ...conv, messages: updatedMessages, title, updatedAt: new Date().toISOString() };
        }),
      );
    },
    [activeConversationId],
  );

  const updateLastAssistantMessage = useCallback(
    (content: string, isComplete: boolean) => {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== activeConversationId) return conv;
          const msgs = [...conv.messages];
          const lastIdx = msgs.length - 1;
          if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
            msgs[lastIdx] = { ...msgs[lastIdx], content, isStreaming: !isComplete };
            if (isComplete) {
              msgs[lastIdx].tokens = Math.ceil(content.length / 4);
            }
          }
          return { ...conv, messages: msgs };
        }),
      );
    },
    [activeConversationId],
  );

  const updateLastAssistantToolCalls = useCallback(
    (toolCalls: ToolCall[]) => {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== activeConversationId) return conv;
          const msgs = [...conv.messages];
          const lastIdx = msgs.length - 1;
          if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
            msgs[lastIdx] = { ...msgs[lastIdx], toolCalls: [...toolCalls] };
          }
          return { ...conv, messages: msgs };
        }),
      );
    },
    [activeConversationId],
  );

  const processSSEStream = useCallback(
    async (response: Response, signal: AbortSignal) => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let streamDone = false;
      const toolCalls: ToolCall[] = [];

      try {
        while (true) {
          if (signal.aborted || streamDone) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                streamDone = true;
                break;
              }
              try {
                const parsed = JSON.parse(data);

                // Handle tool_call events
                if (parsed.type === 'tool_call' || parsed.tool_calls) {
                  const calls = parsed.tool_calls || [parsed];
                  for (const tc of calls) {
                    const existing = toolCalls.find((t) => t.id === tc.id);
                    if (existing) {
                      existing.status = tc.status || existing.status;
                      existing.result = tc.result ?? existing.result;
                      existing.duration = tc.duration ?? existing.duration;
                      existing.error = tc.error ?? existing.error;
                    } else {
                      toolCalls.push({
                        id: tc.id || `tc-${Date.now()}-${toolCalls.length}`,
                        name: tc.name || 'unknown',
                        status: tc.status || 'running',
                        arguments: tc.arguments || {},
                        result: tc.result,
                        duration: tc.duration,
                        error: tc.error,
                      });
                    }
                  }
                  updateLastAssistantToolCalls(toolCalls);
                  continue;
                }

                const token = parsed.content || parsed.token || parsed.delta?.content || '';
                if (token) {
                  accumulated += token;
                  updateLastAssistantMessage(accumulated, false);
                }
              } catch {
                // skip non-JSON lines
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      updateLastAssistantMessage(accumulated || '', true);
      if (toolCalls.length > 0) {
        updateLastAssistantToolCalls(toolCalls);
      }
      return accumulated;
    },
    [updateLastAssistantMessage, updateLastAssistantToolCalls],
  );

  const processJSONResponse = useCallback(
    async (response: Response) => {
      const data = await response.json();
      const content =
        data?.data?.response?.content || data?.response?.content || data?.content || '';
      updateLastAssistantMessage(content || 'I received your message.', true);
      return content;
    },
    [updateLastAssistantMessage],
  );

  const sendMessage = useCallback(
    (content: string, attachments?: string[]) => {
      if (!content.trim() || isStreaming) return;

      if (!activeConversationId) {
        createConversation();
      }

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
        tokens: Math.ceil(content.length / 4),
        attachments,
      };
      addMessageToConversation(userMessage);

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        model: currentModel,
        isStreaming: true,
      };

      setTimeout(() => {
        addMessageToConversation(assistantMessage);

        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsStreaming(true);
        setError(null);

        const token = getAuthToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        fetch(`${API_BASE}/assistant/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: content.trim(),
            model: currentModel,
            conversationId: activeConversationId || undefined,
            attachments,
            stream: streamingEnabled,
          }),
          signal: controller.signal,
        })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`Server error: ${response.status}`);
            }

            const contentType = response.headers.get('Content-Type') || '';
            const isSSE = contentType.includes('text/event-stream');
            const isNDJSON = contentType.includes('application/x-ndjson');

            if ((isSSE || isNDJSON) && response.body && streamingEnabled) {
              await processSSEStream(response, controller.signal);
            } else {
              await processJSONResponse(response);
            }
          })
          .catch((err) => {
            if (err instanceof Error && err.name === 'AbortError') {
              // User cancelled - mark as complete with current content
              return;
            }
            const message = err instanceof Error ? err.message : 'Failed to get response';
            setError(message);
            updateLastAssistantMessage('Sorry, I encountered an error.', true);
          })
          .finally(() => {
            setIsStreaming(false);
            abortControllerRef.current = null;
          });
      }, 200);
    },
    [
      activeConversationId,
      isStreaming,
      currentModel,
      streamingEnabled,
      createConversation,
      addMessageToConversation,
      updateLastAssistantMessage,
      processSSEStream,
      processJSONResponse,
    ],
  );

  const switchModel = useCallback((modelId: string) => {
    setCurrentModel(modelId);
  }, []);

  const clearMessages = useCallback(() => {
    if (!activeConversationId) return;
    setConversations((prev) =>
      prev.map((conv) => (conv.id === activeConversationId ? { ...conv, messages: [] } : conv)),
    );
  }, [activeConversationId]);

  const retryLastMessage = useCallback(() => {
    if (!activeConversation || activeConversation.messages.length < 2) return;
    const lastUserMsg = [...activeConversation.messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== activeConversationId) return conv;
          const msgs = conv.messages.slice(0, -1);
          return { ...conv, messages: msgs };
        }),
      );
      setTimeout(() => sendMessage(lastUserMsg.content), 100);
    }
  }, [activeConversation, activeConversationId, sendMessage]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    updateLastAssistantMessage(messages[messages.length - 1]?.content || '', true);
  }, [messages, updateLastAssistantMessage]);

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
    createConversation,
    selectConversation,
    deleteConversation,
    switchModel,
    clearMessages,
    retryLastMessage,
    stopStreaming,
  };
}

export default useAIChat;
