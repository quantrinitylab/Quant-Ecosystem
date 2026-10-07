'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRealtime } from '../providers/realtime-context';
import { getAuthHeadersWithContent } from '../lib/auth';
import { getChatTheme, type ChatTheme } from '../lib/chat-themes';

// ============================================================================
// Task 14.3: useChatThemeSync
//
// Persists a conversation's theme to the backend and syncs the selection to
// all participants in real time over the 'chat' channel via a `theme_changed`
// event. Subscribers update their local theme immediately when a participant
// changes it.
//
// Backend: POST /conversations/:id/theme
// Requirements: 14.3 (persist per-conversation + sync to all participants)
// ============================================================================

/** Shape of the realtime `theme_changed` event payload. */
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
  const { subscribe, publish } = useRealtime();
  const [theme, setLocalTheme] = useState<ChatTheme>(() => getChatTheme(initialThemeId));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to theme_changed events for this conversation (Req 14.3 sync).
  useEffect(() => {
    const unsubscribe = subscribe(
      'chat',
      (event: ThemeChangedEvent & { conversationId?: string }) => {
        if (event?.type === 'theme_changed' && event.conversationId === conversationId) {
          setLocalTheme(getChatTheme(event.themeId));
        }
      },
    );
    return unsubscribe;
  }, [subscribe, conversationId]);

  const setTheme = useCallback(
    async (themeId: string) => {
      const next = getChatTheme(themeId);
      // Apply optimistically so the local view updates within budget.
      setLocalTheme(next);
      setIsSaving(true);
      setError(null);

      // Broadcast to other participants immediately.
      publish('chat', {
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
    [conversationId, publish],
  );

  return { theme, isSaving, error, setTheme };
}

export default useChatThemeSync;
