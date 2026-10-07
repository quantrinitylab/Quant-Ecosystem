// ============================================================================
// QuantNeon - Games Hub Page
// ============================================================================

import { PageTransition } from '@quant/shared-ui';
import type { Game } from '../types';

interface GamesPageProps {
  games: Game[];
  featured: Game[];
  rewards: { coins: number; level: number };
}

export function GamesPage({
  games = [],
  featured = [],
  rewards = { coins: 0, level: 0 },
}: Partial<GamesPageProps>) {
  return (
    <PageTransition>
      <div
        className="min-h-screen bg-gray-900 dark:bg-[#0F0F14] text-gray-100 pb-20"
        aria-label="Games hub"
      >
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-gray-900/95 dark:bg-[#0F0F14]/95 backdrop-blur-sm border-b border-gray-800">
          <h1 className="text-white text-xl font-bold">Games</h1>
          <div
            className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-full"
            aria-label={`Rewards: ${rewards.coins} coins, level ${rewards.level}`}
          >
            <span className="text-yellow-400 text-sm font-medium">{rewards.coins} coins</span>
            <span className="text-gray-500 text-sm">|</span>
            <span className="text-blue-400 text-sm font-medium">Level {rewards.level}</span>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4">
          {/* Featured Games Carousel */}
          <section className="mt-6" aria-label="Featured games">
            <h2 className="text-white font-bold text-lg mb-3">Featured</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {featured.map((g) => (
                <div
                  key={g.id}
                  className="flex-shrink-0 w-64 rounded-2xl overflow-hidden bg-gray-800 shadow-lg"
                >
                  <img src={g.thumbnailUrl} alt={g.title} className="w-full h-36 object-cover" />
                  <div className="p-3">
                    <h3 className="text-white font-bold text-sm">{g.title}</h3>
                    <span className="text-gray-400 text-xs">
                      {g.playCount.toLocaleString()} plays
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* All Games Grid */}
          <section className="mt-8" aria-label="All games">
            <h2 className="text-white font-bold text-lg mb-3">All Games</h2>
            <div className="grid grid-cols-2 gap-3">
              {games.map((g) => (
                <div
                  key={g.id}
                  className="rounded-xl overflow-hidden bg-gray-800 shadow-md"
                  data-id={g.id}
                >
                  <img src={g.thumbnailUrl} alt={g.title} className="w-full h-28 object-cover" />
                  <div className="p-3">
                    <h3 className="text-white font-semibold text-sm truncate">{g.title}</h3>
                    <p className="text-gray-400 text-xs line-clamp-2 mt-1">{g.description}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-yellow-400 text-xs font-medium">★ {g.rating}/5</span>
                      <button
                        type="button"
                        className="min-h-[44px] min-w-[44px] px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold transition-colors"
                        aria-label={`Play ${g.title}`}
                      >
                        Play
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PageTransition>
  );
}

export default GamesPage;
