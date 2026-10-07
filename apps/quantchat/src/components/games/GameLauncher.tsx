'use client';

import React, { useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { useGameSdk } from '../../hooks/useGameSdk';
import { useMicroInteractions } from '../../providers/MicroInteractionProvider';
import {
  awardGameXp,
  gameXpForScore,
  formatGameScoreMessage,
  type GameDefinition,
  type GameOverPayload,
} from '../../lib/games-sdk';

// ============================================================================
// Task 14.4 / 14.5 / 14.6: GameLauncher
//
// 14.4 — Game list + full-screen iframe overlay for mini-games.
// 14.5 — On game end: post scores to chat as a system message + award XP.
// 14.6 — Game load timeout (10s) → error message + retry option.
//
// Requirements: 17.1, 17.2, 17.3, 17.5
// ============================================================================

/** Built-in demo games (third-party games register via the SDK). */
export const DEFAULT_GAMES: GameDefinition[] = [
  {
    id: 'cosmic-tictactoe',
    name: 'Cosmic Tic-Tac-Toe',
    description: 'Classic 3-in-a-row, alien edition',
    icon: '🛸',
    url: '/games/cosmic-tictactoe/index.html',
    minPlayers: 2,
    maxPlayers: 2,
  },
  {
    id: 'nebula-trivia',
    name: 'Nebula Trivia',
    description: 'Race to answer the most questions',
    icon: '🌌',
    url: '/games/nebula-trivia/index.html',
    minPlayers: 2,
    maxPlayers: 8,
  },
  {
    id: 'quantum-pong',
    name: 'Quantum Pong',
    description: 'Reflex-based paddle duel',
    icon: '🪐',
    url: '/games/quantum-pong/index.html',
    minPlayers: 2,
    maxPlayers: 2,
  },
];

export interface GameLauncherProps {
  /** Conversation the game session belongs to. */
  conversationId: string;
  /** Participant user IDs invited to the game. */
  participantIds: string[];
  /** Games available in this conversation (defaults to {@link DEFAULT_GAMES}). */
  games?: GameDefinition[];
  /**
   * The local user's id. When provided, the local user is awarded XP
   * proportional to THEIR own score on game over (Property 37 / Req 17.3).
   */
  currentUserId?: string;
  /**
   * Posts a system message to the conversation (Requirement 17.3). Typically
   * wired to the messages API with `type: 'system'`.
   */
  onPostSystemMessage: (text: string) => void | Promise<void>;
  /** Optional close handler for the whole launcher panel. */
  onClose?: () => void;
}

export const GameLauncher: React.FC<GameLauncherProps> = ({
  conversationId,
  participantIds,
  games = DEFAULT_GAMES,
  currentUserId,
  onPostSystemMessage,
  onClose,
}) => {
  const { awardXP } = useMicroInteractions();

  const handleGameOver = useCallback(
    (payload: GameOverPayload) => {
      const game = games.find((g) => g.id === payload.gameId);
      const text = game ? formatGameScoreMessage(game, payload.scores) : `Game finished.`;

      // 14.5: post final scores to chat as a system message.
      void onPostSystemMessage(text);

      // 14.5 / Property 37 / Req 17.3: award XP PROPORTIONAL to each
      // participant's score (floor(score / 10)), never a flat constant.
      // The MicroInteractions provider only tracks the LOCAL user's XP, so we
      // award the local user the proportional XP for THEIR own score. When the
      // local participant is unknown we fall back to the proportional XP of the
      // top score (still proportional, never flat).
      const awards = awardGameXp(payload.scores);
      const localXp =
        currentUserId !== undefined && currentUserId in awards
          ? awards[currentUserId]
          : gameXpForScore(payload.scores.reduce((max, s) => Math.max(max, s.score), 0));

      // XPAction has no game-specific entry; award an explicit amount.
      awardXP('send_message', localXp);
    },
    [games, currentUserId, onPostSystemMessage, awardXP],
  );

  const sdk = useGameSdk({
    conversationId,
    participantIds,
    onGameOver: handleGameOver,
  });

  const { activeGame, loadState, launch, close, retry, registerIframe } = sdk;

  return (
    <div className="game-launcher">
      <header
        className="game-launcher__header"
        style={{ display: 'flex', justifyContent: 'space-between' }}
      >
        <h2 className="game-launcher__title">🎮 Games</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="game-launcher__close"
            aria-label="Close games"
          >
            ✕
          </button>
        )}
      </header>

      {/* 14.4: game list */}
      <ul
        className="game-launcher__list"
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}
      >
        {games.map((game) => (
          <li key={game.id}>
            <motion.button
              type="button"
              onClick={() => launch(game)}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className="game-launcher__item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: 12,
                borderRadius: 12,
                border: '1px solid #3a3a3c',
                background: 'rgba(255,255,255,0.04)',
                color: '#fff',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 28 }}>{game.icon}</span>
              <span>
                <span style={{ display: 'block', fontWeight: 700 }}>{game.name}</span>
                <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>
                  {game.description}
                </span>
              </span>
            </motion.button>
          </li>
        ))}
      </ul>

      {/* 14.4: full-screen iframe overlay */}
      <AnimatePresence>
        {activeGame && (
          <motion.div
            className="game-launcher__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: '#000',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              className="game-launcher__overlay-bar"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 12,
                color: '#fff',
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {activeGame.icon} {activeGame.name}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Quit game"
                style={{ color: '#fff' }}
              >
                Quit ✕
              </button>
            </div>

            <div style={{ position: 'relative', flex: 1 }}>
              {/* 14.6: loading + timeout/error states */}
              {(loadState === 'loading' || loadState === 'timeout' || loadState === 'error') && (
                <div
                  className="game-launcher__status"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 16,
                    color: '#fff',
                    background: 'rgba(0,0,0,0.85)',
                    zIndex: 1,
                  }}
                >
                  {loadState === 'loading' && (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        style={{ fontSize: 32 }}
                      >
                        🛸
                      </motion.span>
                      <span>Loading {activeGame.name}…</span>
                    </>
                  )}
                  {(loadState === 'timeout' || loadState === 'error') && (
                    <>
                      <span style={{ fontSize: 32 }}>⚠️</span>
                      <span>
                        {loadState === 'timeout'
                          ? 'The game took too long to load.'
                          : 'The game failed to load.'}
                      </span>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <motion.button
                          type="button"
                          onClick={retry}
                          whileTap={{ scale: 0.95 }}
                          style={{
                            padding: '8px 20px',
                            borderRadius: 999,
                            background: '#fffc00',
                            color: '#000',
                            fontWeight: 700,
                          }}
                        >
                          Retry
                        </motion.button>
                        <button type="button" onClick={close} style={{ color: '#fff' }}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <iframe
                ref={registerIframe}
                title={activeGame.name}
                src={activeGame.url}
                style={{ width: '100%', height: '100%', border: 'none' }}
                allow="autoplay; fullscreen"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GameLauncher;
