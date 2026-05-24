// ============================================================================
// QuantTube - Podcasts Hub
// Podcast discovery, subscriptions, episodes queue, RSS import
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Podcast {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  description: string;
  category: string;
  episodeCount: number;
  rating: number;
  isFeatured: boolean;
  isSubscribed: boolean;
}

interface Episode {
  id: string;
  podcastId: string;
  podcastTitle: string;
  title: string;
  description: string;
  duration: number;
  publishedAt: string;
  coverUrl: string;
  isPlayed: boolean;
  progress: number;
}

type PodcastCategory = 'Technology' | 'Comedy' | 'True Crime' | 'Business' | 'Health' | 'Education';

interface PodcastsPageState {
  podcasts: Podcast[];
  subscriptions: Podcast[];
  queue: Episode[];
  playingEpisodeId: string | null;
  activeCategory: PodcastCategory;
  rssUrl: string;
  importing: boolean;
  loading: boolean;
  error: string | null;
  featuredIndex: number;
  newEpisodes: Episode[];
  searchQuery: string;
}

const CATEGORIES: PodcastCategory[] = ['Technology', 'Comedy', 'True Crime', 'Business', 'Health', 'Education'];

const MOCK_PODCASTS: Podcast[] = [
  { id: 'p1', title: 'Tech Deep Dive', author: 'Sarah Chen', coverUrl: '/covers/tech-deep.jpg', description: 'Weekly deep dives into the latest technology trends, startups, and innovations shaping our world.', category: 'Technology', episodeCount: 245, rating: 4.8, isFeatured: true, isSubscribed: true },
  { id: 'p2', title: 'Laugh Factory Live', author: 'Mike Johnson', coverUrl: '/covers/laugh.jpg', description: 'Live recordings from the best comedy clubs across the country.', category: 'Comedy', episodeCount: 180, rating: 4.6, isFeatured: true, isSubscribed: false },
  { id: 'p3', title: 'Cold Cases Reopened', author: 'Detective Sara', coverUrl: '/covers/cold-cases.jpg', description: 'Investigating unsolved cold cases with new evidence and expert analysis.', category: 'True Crime', episodeCount: 89, rating: 4.9, isFeatured: true, isSubscribed: true },
  { id: 'p4', title: 'Startup Grind', author: 'Alex Rivera', coverUrl: '/covers/startup.jpg', description: 'Interviews with founders, VCs, and builders creating the next big thing.', category: 'Business', episodeCount: 312, rating: 4.7, isFeatured: false, isSubscribed: true },
  { id: 'p5', title: 'Mind & Body', author: 'Dr. Lisa Park', coverUrl: '/covers/mind-body.jpg', description: 'Science-based wellness, mental health, and fitness strategies.', category: 'Health', episodeCount: 156, rating: 4.5, isFeatured: false, isSubscribed: false },
  { id: 'p6', title: 'Code Academy FM', author: 'Dev Team', coverUrl: '/covers/code-fm.jpg', description: 'Learn programming concepts explained in simple, bite-sized episodes.', category: 'Education', episodeCount: 420, rating: 4.8, isFeatured: true, isSubscribed: false },
  { id: 'p7', title: 'AI Revolution', author: 'Neural Networks Inc', coverUrl: '/covers/ai-rev.jpg', description: 'Exploring artificial intelligence breakthroughs and their impact on society.', category: 'Technology', episodeCount: 67, rating: 4.9, isFeatured: false, isSubscribed: true },
  { id: 'p8', title: 'True Crime Weekly', author: 'Investigative Media', coverUrl: '/covers/tc-weekly.jpg', description: 'A new true crime story every week with detailed investigations.', category: 'True Crime', episodeCount: 204, rating: 4.7, isFeatured: false, isSubscribed: false },
];

const MOCK_EPISODES: Episode[] = [
  { id: 'ep1', podcastId: 'p1', podcastTitle: 'Tech Deep Dive', title: 'The Future of Quantum Computing', description: 'We explore recent breakthroughs in quantum computing and what they mean for the industry.', duration: 3420, publishedAt: '2024-01-15T08:00:00Z', coverUrl: '/covers/tech-deep.jpg', isPlayed: false, progress: 0 },
  { id: 'ep2', podcastId: 'p3', podcastTitle: 'Cold Cases Reopened', title: 'The Missing Hiker - Part 1', description: 'A hiker vanished on a well-known trail. New DNA evidence sheds light on what happened.', duration: 2880, publishedAt: '2024-01-14T10:00:00Z', coverUrl: '/covers/cold-cases.jpg', isPlayed: false, progress: 0 },
  { id: 'ep3', podcastId: 'p4', podcastTitle: 'Startup Grind', title: 'From Garage to IPO: A Founders Journey', description: 'Interview with a founder who took their company from zero to public markets.', duration: 4200, publishedAt: '2024-01-13T12:00:00Z', coverUrl: '/covers/startup.jpg', isPlayed: true, progress: 100 },
  { id: 'ep4', podcastId: 'p7', podcastTitle: 'AI Revolution', title: 'GPT-5 and Beyond', description: 'What to expect from the next generation of large language models.', duration: 2640, publishedAt: '2024-01-12T09:00:00Z', coverUrl: '/covers/ai-rev.jpg', isPlayed: false, progress: 45 },
  { id: 'ep5', podcastId: 'p1', podcastTitle: 'Tech Deep Dive', title: 'Apple Vision Pro First Look', description: 'Our hands-on experience with spatial computing and what it means for developers.', duration: 3060, publishedAt: '2024-01-11T08:00:00Z', coverUrl: '/covers/tech-deep.jpg', isPlayed: false, progress: 0 },
];

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins} min`;
};

const PodcastsPage: React.FC = () => {
  const [state, setState] = useState<PodcastsPageState>({
    podcasts: [],
    subscriptions: [],
    queue: [],
    playingEpisodeId: null,
    activeCategory: 'Technology',
    rssUrl: '',
    importing: false,
    loading: true,
    error: null,
    featuredIndex: 0,
    newEpisodes: [],
    searchQuery: '',
  });

  const carouselRef = useRef<HTMLDivElement>(null);
  const carouselTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const loadPodcasts = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        await new Promise(resolve => setTimeout(resolve, 600));
        const subscriptions = MOCK_PODCASTS.filter(p => p.isSubscribed);
        setState(prev => ({
          ...prev,
          podcasts: MOCK_PODCASTS,
          subscriptions,
          queue: MOCK_EPISODES,
          newEpisodes: MOCK_EPISODES.filter(e => !e.isPlayed),
          loading: false,
        }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load podcasts', loading: false }));
      }
    };
    loadPodcasts();
  }, []);

  useEffect(() => {
    const featured = MOCK_PODCASTS.filter(p => p.isFeatured);
    if (featured.length > 1) {
      carouselTimerRef.current = setInterval(() => {
        setState(prev => ({
          ...prev,
          featuredIndex: (prev.featuredIndex + 1) % featured.length,
        }));
      }, 5000);
    }
    return () => {
      if (carouselTimerRef.current) clearInterval(carouselTimerRef.current);
    };
  }, []);

  const togglePlayEpisode = useCallback((episodeId: string) => {
    setState(prev => ({
      ...prev,
      playingEpisodeId: prev.playingEpisodeId === episodeId ? null : episodeId,
    }));
  }, []);

  const setActiveCategory = useCallback((category: PodcastCategory) => {
    setState(prev => ({ ...prev, activeCategory: category }));
  }, []);

  const handleRssUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setState(prev => ({ ...prev, rssUrl: e.target.value }));
  }, []);

  const importRss = useCallback(async () => {
    if (!state.rssUrl.trim()) return;
    setState(prev => ({ ...prev, importing: true }));
    await new Promise(resolve => setTimeout(resolve, 2000));
    setState(prev => ({ ...prev, importing: false, rssUrl: '' }));
  }, [state.rssUrl]);

  const toggleSubscription = useCallback((podcastId: string) => {
    setState(prev => {
      const updatedPodcasts = prev.podcasts.map(p =>
        p.id === podcastId ? { ...p, isSubscribed: !p.isSubscribed } : p
      );
      return {
        ...prev,
        podcasts: updatedPodcasts,
        subscriptions: updatedPodcasts.filter(p => p.isSubscribed),
      };
    });
  }, []);

  const removeFromQueue = useCallback((episodeId: string) => {
    setState(prev => ({
      ...prev,
      queue: prev.queue.filter(e => e.id !== episodeId),
    }));
  }, []);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading podcasts...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-4xl">⚠</div>
          <p className="text-white text-lg">{state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const featuredPodcasts = state.podcasts.filter(p => p.isFeatured);
  const currentFeatured = featuredPodcasts[state.featuredIndex] || featuredPodcasts[0];
  const filteredPodcasts = state.podcasts.filter(p => p.category === state.activeCategory);

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Podcasts</h1>
          <input
            type="text"
            placeholder="Search podcasts..."
            value={state.searchQuery}
            onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
            className="bg-gray-800 text-white rounded-full px-4 py-2 text-sm w-64 outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </header>

      {/* Featured Carousel */}
      <section className="px-6 py-6">
        <h2 className="text-lg font-semibold mb-4">Featured</h2>
        <div ref={carouselRef} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-900 to-indigo-900 p-6 h-48">
          {currentFeatured && (
            <div className="flex items-center space-x-6 h-full">
              <div className="w-32 h-32 rounded-xl bg-gray-700 overflow-hidden flex-shrink-0">
                <img src={currentFeatured.coverUrl} alt={currentFeatured.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold">{currentFeatured.title}</h3>
                <p className="text-purple-200 text-sm mt-1">by {currentFeatured.author}</p>
                <p className="text-gray-300 text-sm mt-2 line-clamp-2">{currentFeatured.description}</p>
                <div className="flex items-center space-x-3 mt-3">
                  <span className="text-yellow-400 text-sm">★ {currentFeatured.rating}</span>
                  <span className="text-gray-400 text-sm">{currentFeatured.episodeCount} episodes</span>
                </div>
              </div>
            </div>
          )}
          {/* Carousel Dots */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex space-x-2">
            {featuredPodcasts.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setState(prev => ({ ...prev, featuredIndex: idx }))}
                className={`w-2 h-2 rounded-full transition-all ${idx === state.featuredIndex ? 'bg-white w-6' : 'bg-white/40'}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Your Subscriptions */}
      <section className="px-6 py-4">
        <h2 className="text-lg font-semibold mb-4">Your Subscriptions</h2>
        {state.subscriptions.length === 0 ? (
          <div className="text-center py-8 bg-gray-900 rounded-xl">
            <p className="text-gray-400">No subscriptions yet</p>
            <p className="text-gray-500 text-sm mt-1">Browse podcasts below to subscribe</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {state.subscriptions.map(podcast => (
              <div key={podcast.id} className="group cursor-pointer">
                <div className="aspect-square rounded-xl bg-gray-800 overflow-hidden mb-2 group-hover:ring-2 group-hover:ring-purple-500 transition-all">
                  <img src={podcast.coverUrl} alt={podcast.title} className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-medium truncate">{podcast.title}</p>
                <p className="text-xs text-gray-400 truncate">{podcast.author}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Episodes Queue */}
      <section className="px-6 py-4">
        <h2 className="text-lg font-semibold mb-4">Your Queue</h2>
        <div className="space-y-3">
          {state.queue.map(episode => (
            <div key={episode.id} className="flex items-center space-x-4 bg-gray-900 rounded-xl p-4 hover:bg-gray-800 transition-colors">
              <div className="w-14 h-14 rounded-lg bg-gray-700 overflow-hidden flex-shrink-0">
                <img src={episode.coverUrl} alt={episode.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{episode.title}</p>
                <p className="text-xs text-gray-400">{episode.podcastTitle}</p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs text-gray-500">{formatDuration(episode.duration)}</span>
                  {episode.progress > 0 && episode.progress < 100 && (
                    <div className="flex-1 h-1 bg-gray-700 rounded-full max-w-[80px]">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${episode.progress}%` }} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => togglePlayEpisode(episode.id)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    state.playingEpisodeId === episode.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {state.playingEpisodeId === episode.id ? '⏸' : '▶'}
                </button>
                <button
                  onClick={() => removeFromQueue(episode.id)}
                  className="text-gray-500 hover:text-red-400 text-sm p-1"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Browse by Category */}
      <section className="px-6 py-4">
        <h2 className="text-lg font-semibold mb-4">Browse by Category</h2>
        <div className="flex space-x-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
          {CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                state.activeCategory === category
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPodcasts.map(podcast => (
            <div key={podcast.id} className="flex items-center space-x-4 bg-gray-900 rounded-xl p-4 hover:bg-gray-800 transition-colors">
              <div className="w-16 h-16 rounded-xl bg-gray-700 overflow-hidden flex-shrink-0">
                <img src={podcast.coverUrl} alt={podcast.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{podcast.title}</p>
                <p className="text-xs text-gray-400">{podcast.author}</p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-yellow-400 text-xs">★ {podcast.rating}</span>
                  <span className="text-gray-500 text-xs">{podcast.episodeCount} eps</span>
                </div>
              </div>
              <button
                onClick={() => toggleSubscription(podcast.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  podcast.isSubscribed
                    ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {podcast.isSubscribed ? 'Subscribed' : 'Subscribe'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* New Episodes */}
      <section className="px-6 py-4">
        <h2 className="text-lg font-semibold mb-4">New Episodes</h2>
        <div className="space-y-2">
          {state.newEpisodes.map(episode => (
            <div key={episode.id} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-900 transition-colors">
              <div className="w-3 h-3 rounded-full bg-purple-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{episode.title}</p>
                <p className="text-xs text-gray-500">{episode.podcastTitle} - {new Date(episode.publishedAt).toLocaleDateString()}</p>
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">{formatDuration(episode.duration)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* RSS Import */}
      <section className="px-6 py-4">
        <h2 className="text-lg font-semibold mb-4">Import Podcast</h2>
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-3">Add a podcast by its RSS feed URL</p>
          <div className="flex space-x-3">
            <input
              type="url"
              value={state.rssUrl}
              onChange={handleRssUrlChange}
              placeholder="https://example.com/podcast/feed.xml"
              className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={importRss}
              disabled={state.importing || !state.rssUrl.trim()}
              className="px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {state.importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <span>Import</span>
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PodcastsPage;
