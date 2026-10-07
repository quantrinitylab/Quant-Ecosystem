'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GAME_LOAD_TIMEOUT_MS,
  isGameMessage,
  type GameDefinition,
  type GameLoadState,
  type GameSdk,
  type UseGameSdkOptions,
} from '../lib/games-sdk';

// ============================================================================
// Task 14.6 / 14.7: useGameSdk
//
// React hook implementing the games SDK hook interface defined in
// `lib/games-sdk.ts`. Manages the embedded-game lifecycle:
//   - launch a game and start a 10s load-timeout countdown (Req 17.5)
//   - listen for `ready` / `game_over` / `error` postMessages from the iframe
//   - expose retry() to relaunch after timeout/error
//
// Requirements: 17.1, 17.3, 17.5
// ============================================================================

export function useGameSdk(options: UseGameSdkOptions): GameSdk {
  const {
    participantIds,
    loadTimeoutMs = GAME_LOAD_TIMEOUT_MS,
    onReady,
    onGameOver,
    onError,
  } = options;

  const [activeGame, setActiveGame] = useState<GameDefinition | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<GameLoadState>('idle');

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadStateRef = useRef<GameLoadState>('idle');
  loadStateRef.current = loadState;

  const clearLoadTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startLoadTimer = useCallback(() => {
    clearLoadTimer();
    timeoutRef.current = setTimeout(() => {
      // Only time out if the game never became ready.
      if (loadStateRef.current === 'loading') {
        setLoadState('timeout');
        onError?.('The game took too long to load. Please try again.');
      }
    }, loadTimeoutMs);
  }, [clearLoadTimer, loadTimeoutMs, onError]);

  const generateSessionId = useCallback(
    (gameId: string) =>
      `gs_${gameId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  const launch = useCallback(
    (game: GameDefinition) => {
      const newSession = generateSessionId(game.id);
      setActiveGame(game);
      setSessionId(newSession);
      setLoadState('loading');
      startLoadTimer();
    },
    [generateSessionId, startLoadTimer],
  );

  const retry = useCallback(() => {
    if (!activeGame) return;
    setLoadState('loading');
    startLoadTimer();
    // Force iframe reload by re-assigning its src.
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.src = iframe.src;
    }
  }, [activeGame, startLoadTimer]);

  const close = useCallback(() => {
    clearLoadTimer();
    setActiveGame(null);
    setSessionId(null);
    setLoadState('idle');
  }, [clearLoadTimer]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!isGameMessage(event.data)) return;
      const msg = event.data;

      switch (msg.type) {
        case 'ready': {
          clearLoadTimer();
          setLoadState('ready');
          onReady?.(msg.gameId);
          break;
        }
        case 'game_over': {
          clearLoadTimer();
          onGameOver?.(msg.payload);
          break;
        }
        case 'error': {
          clearLoadTimer();
          setLoadState('error');
          onError?.(msg.message);
          break;
        }
      }
    },
    [clearLoadTimer, onReady, onGameOver, onError],
  );

  const registerIframe = useCallback((iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe;
  }, []);

  // Listen for postMessages from the embedded game.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Clean up the timer on unmount.
  useEffect(() => clearLoadTimer, [clearLoadTimer]);

  // Referenced so the participant list is part of the hook contract surface.
  void participantIds;

  return {
    loadState,
    activeGame,
    sessionId,
    launch,
    close,
    retry,
    registerIframe,
    handleMessage,
  };
}

export default useGameSdk;
