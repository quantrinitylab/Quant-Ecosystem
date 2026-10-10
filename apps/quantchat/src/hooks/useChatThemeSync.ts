'use client';

import { useCallback, useEffect, useState } from 'react';
import { chatSocket } from '../services/chat-socket';
import { getAuthHeadersWithContent } from '../lib/auth';
import { getChatTheme, type ChatTheme } from '../lib/chat-themes';

// ============================================================================
// Task 14.3: useChatThemeSync
//
// Persists a conversation's theme to the backend and syncs the selection to
// all participants in real time via a `theme_changed` event. Subscribers
// update their local theme immediately when a participant changes it.
//
// Backend: POST /conversations/:id/theme
// Requirements: 14.3 (persist per-conversation + sync to all participants)
//
// QM-UIUX-060: migrated from the dead RealtimeProvider (`/ws`) to the working
// `chatSocket` singleton (`/ws/chat`), joining the conversation room exactly
// like useRealtimeChat. Honest transport note: the durable sync path is the
// REST persist above — the backend `/ws/chat` handler has no theme channel
// today, so the `theme_changed` frame is a best-effort realtime hint carried
// on the single real connection (the old provider's `/ws` socket had the
// same limitation); it is delivered to local consumers if a peer frame with
// that shape arrives over the singleton.
// ============================================================================

/** Shape of the realtime `theme_changed` event. */
export interface ThemeChangedEvent {
  type: 'theme_changed';
  conversationId: string;
  themeId: string;
}

function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return 'http://localhost:3002';
}

export interface UseChatThemeSyncResult {
  /** The currently applied theme for this conversation. */
  theme: ChatTheme;
  /** True while a theme change is being persisted. */
  isSaving: boolean;
  /** Error from the last persist attempt, if any. */
  error: string | null;
  /**
   * Select a new theme: applies locally, persists to the backend, and
   * broadcasts a `theme_changed` event to all participants.
   */
  setTheme: (themeId: string) => Promise<void>;
}

export function useChatThemeSync(
  conversationId: string,
  initialThemeId?: string | null,
): UseChatThemeSyncResult {
  const [theme, setLocalTheme] = useState<ChatTheme>(() => getChatTheme(initialThemeId));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to theme_changed events for this conversation (Req 14.3 sync)
  // over the shared chatSocket singleton, joining the conversation room so
  // room-scoped frames for this conversation reach this consumer.
  useEffect(() => {
    if (!conversationId) return;

    chatSocket.acquire();
    chatSocket.subscribe(conversationId);

    const unsubscribeMessage = chatSocket.onMessage((event: any) => {
      // Normalized events carry their payload in `data`; legacy passthrough
      // frames carry the fields flat.
      const source = event?.data ?? event;
      const type = event?.type ?? source?.type;
      if (type !== 'theme_changed') return;
      const eventConversationId: string | undefined =
        source?.conversationId ?? event?.conversationId;
      const themeId: string | undefined = source?.themeId ?? event?.themeId;
      if (eventConversationId === conversationId && themeId) {
        setLocalTheme(getChatTheme(themeId));
      }
    });

    return () => {
      unsubscribeMessage();
      chatSocket.unsubscribe(conversationId);
      chatSocket.release();
    };
  }, [conversationId]);

  const setTheme = useCallback(
    async (themeId: string) => {
      const next = getChatTheme(themeId);
      // Apply optimistically so the local view updates within budget.
      setLocalTheme(next);
      setIsSaving(true);
      setError(null);

      // Broadcast to other participants immediately over the shared socket.
      chatSocket.send({
        type: 'theme_changed',
        conversationId,
        themeId: next.id,
      });

      try {
        const response = await fetch(`${getApiBaseUrl()}/conversations/${conversationId}/theme`, {
          method: 'POST',
          headers: getAuthHeadersWithContent(),
          body: JSON.stringify({ themeId: next.id }),
        });
        if (!response.ok) {
          throw new Error(`Failed to save theme (${response.status})`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save theme');
      } finally {
        setIsSaving(false);
      }
    },
    [conversationId],
  );

  return { theme, isSaving, error, setTheme };
}

export default useChatThemeSync;
