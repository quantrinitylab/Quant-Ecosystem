// ============================================================================
// QuantNeon - Individual Game Player Page
// ============================================================================

import { PageTransition } from '@quant/shared-ui';
import type { Game, GameSession } from '../../types';

interface GamePlayerProps {
  game: Game | null;
  session: GameSession | null;
  isPlaying: boolean;
}

export function GamePlayerPage({ game, session, isPlaying }: GamePlayerProps) {
  if (!game) {
    return (
      <PageTransition>
        <div
          className="flex items-center justify-center h-screen bg-gray-900 dark:bg-[#0F0F14]"
          aria-label="Loading game"
        >
          <p className="text-gray-400 text-lg animate-pulse">Loading game...</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div
        className="flex flex-col h-screen bg-gray-900 dark:bg-[#0F0F14] text-white"
        aria-label={`Playing ${game.title}`}
      >
        {/* HUD */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <span className="text-yellow-400 font-bold text-sm">Score: {session?.score || 0}</span>
          <span className="text-blue-400 font-bold text-sm">Level: {session?.level || 1}</span>
          <span className="text-red-400 font-bold text-sm">Lives: {session?.lives || 3}</span>
        </div>

        {/* Game Canvas */}
        <div
          className="relative flex-1 flex items-center justify-center"
          data-game-id={game.id}
          data-playing={isPlaying}
        >
          <div className="w-full h-full bg-gray-900 dark:bg-[#0F0F14]" aria-label="Game area" />

          {/* Start Overlay */}
          {!isPlaying && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <div className="text-center p-6">
                <h2 className="text-white text-2xl font-bold mb-3">{game.title}</h2>
                <p className="text-gray-300 text-sm mb-6 max-w-xs">{game.description}</p>
                <button
                  className="min-h-[44px] px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
                  aria-label={`Start playing ${game.title}`}
                >
                  Start Game
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

export default GamePlayerPage;
