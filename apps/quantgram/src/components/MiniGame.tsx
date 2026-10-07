// ============================================================================
// QuantNeon - MiniGame Component (game container/engine)
// ============================================================================

import type { Game, GameSession } from '../types';

interface MiniGameProps {
  game: Game;
  session: GameSession | null;
  onAction: (action: string, data: unknown) => void;
}

export function MiniGame({ game, session, onAction }: MiniGameProps) {
  return (
    <div
      className="flex flex-col h-full bg-gray-900 rounded-xl overflow-hidden"
      aria-label={`Mini game: ${game.title}`}
    >
      {/* Game Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <h3 className="text-white font-bold text-lg">{game.title}</h3>
        {session && (
          <span className="text-yellow-400 font-semibold text-sm">Score: {session.score}</span>
        )}
      </div>

      {/* Game Board */}
      <div className="flex-1 flex items-center justify-center p-4" data-type={game.type}>
        {session?.state?.board ? (
          <div className="grid gap-1" role="grid" aria-label="Game board">
            {(session.state.board as unknown[][]).map((row, y) => (
              <div key={y} className="flex gap-1" role="row">
                {row.map((cell, x) => (
                  <div
                    key={x}
                    className={`w-8 h-8 rounded-sm flex items-center justify-center text-xs font-bold ${
                      cell ? 'bg-blue-500 text-white' : 'bg-gray-700'
                    }`}
                    data-x={x}
                    data-y={y}
                    role="gridcell"
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 text-center">
            <p className="text-4xl mb-2">🎮</p>
            <p className="text-sm">Ready to play</p>
          </div>
        )}
      </div>

      {/* Game Actions (for casual type) */}
      {game.type === 'casual' && (
        <div
          className="flex items-center justify-center gap-4 px-4 py-4 bg-gray-800 border-t border-gray-700"
          role="toolbar"
          aria-label="Game controls"
        >
          <button
            className="min-w-[44px] min-h-[44px] px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium text-sm transition-colors"
            onClick={() => onAction('left', {})}
            aria-label="Move left"
          >
            Left
          </button>
          <button
            className="min-w-[44px] min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-colors"
            onClick={() => onAction('jump', {})}
            aria-label="Jump"
          >
            Jump
          </button>
          <button
            className="min-w-[44px] min-h-[44px] px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium text-sm transition-colors"
            onClick={() => onAction('right', {})}
            aria-label="Move right"
          >
            Right
          </button>
        </div>
      )}
    </div>
  );
}

export default MiniGame;
