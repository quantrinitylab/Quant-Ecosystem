'use client';
import { useState, useCallback, useRef } from 'react';

interface AskQuantMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface UseAskQuantOptions {
  appId?: string;
  apiUrl?: string;
}

interface UseAskQuantReturn {
  messages: AskQuantMessage[];
  isStreaming: boolean;
  error: string | null;
  ask: (query: string) => Promise<void>;
  clear: () => void;
}

export function useAskQuant(options: UseAskQuantOptions = {}): UseAskQuantReturn {
  const { appId = 'unknown', apiUrl = '/api/ai/orchestrate' } = options;
  const [messages, setMessages] = useState<AskQuantMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (query: string) => {
      setError(null);
      setIsStreaming(true);

      const userMessage: AskQuantMessage = { role: 'user', content: query, timestamp: Date.now() };
      setMessages((prev) => [...prev, userMessage]);

      try {
        abortRef.current = new AbortController();
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, context: { appId }, messages }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        let assistantContent = '';
        const decoder = new TextDecoder();

        // Add placeholder assistant message
        setMessages((prev) => [...prev, { role: 'assistant', content: '', timestamp: Date.now() }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: assistantContent,
              timestamp: Date.now(),
            };
            return updated;
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [apiUrl, appId, messages],
  );

  const clear = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, error, ask, clear };
}

export type { AskQuantMessage, UseAskQuantOptions, UseAskQuantReturn };
