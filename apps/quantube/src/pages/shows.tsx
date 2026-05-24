// ============================================================================
// QuantTube - Shows/Series Page
// Browse shows, continue watching, genre tabs, episode lists
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Show {
  id: string;
  title: string;
  posterUrl: string;
  bannerUrl: string;
  rating: number;
  year: number;
  genre: string[];
  description: string;
  seasons: number;
  episodeCount: number;
  status: 'ongoing' | 'completed' | 'upcoming';
}

interface Episode {
  id: string;
  title: string;
  number: number;
  season: number;
  thumbnail: string;
  duration: number;
  description: string;
  airDate: string;
  watched: boolean;
}

interface ContinueWatchingItem {
  id: string;
  showId: string;
  showTitle: string;
  episodeTitle: string;
  thumbnail: string;
  progress: number;
  duration: number;
  season: number;
  episode: number;
}

type Genre = 'all' | 'drama' | 'comedy' | 'action' | 'thriller' | 'documentary';

interface ShowsPageState {
  shows: Show[];
  selectedShow: Show | null;
  selectedSeason: number;
  episodes: Episode[];
  continueWatching: ContinueWatchingItem[];
  activeGenre: Genre;
  loading: boolean;
  error: string | null;
  showDetail: boolean;
}

const GENRES: { id: Genre; label: string }[] = [
  { id: 'all', label: 'All Genres' },
  { id: 'drama', label: 'Drama' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'action', label: 'Action' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'documentary', label: 'Documentary' },
];

const MOCK_SHOWS: Show[] = [
  { id: 's1', title: 'The Algorithm', posterUrl: '/posters/algorithm.jpg', bannerUrl: '/banners/algo.jpg', rating: 4.8, year: 2024, genre: ['thriller', 'drama'], description: 'A tech company\'s AI becomes self-aware and begins manipulating the stock market.', seasons: 2, episodeCount: 20, status: 'ongoing' },
  { id: 's2', title: 'Code Breakers', posterUrl: '/posters/codebreakers.jpg', bannerUrl: '/banners/code.jpg', rating: 4.5, year: 2023, genre: ['action', 'thriller'], description: 'An elite team of hackers works to prevent cyber attacks on critical infrastructure.', seasons: 3, episodeCount: 30, status: 'completed' },
  { id: 's3', title: 'Silicon Dreams', posterUrl: '/posters/silicon.jpg', bannerUrl: '/banners/silicon.jpg', rating: 4.2, year: 2024, genre: ['comedy', 'drama'], description: 'A mockumentary following the absurd daily lives at a failing tech startup.', seasons: 1, episodeCount: 8, status: 'ongoing' },
  { id: 's4', title: 'Planet Decoded', posterUrl: '/posters/planet.jpg', bannerUrl: '/banners/planet.jpg', rating: 4.9, year: 2023, genre: ['documentary'], description: 'Exploring how algorithms and AI shape our natural world from weather to wildlife.', seasons: 2, episodeCount: 12, status: 'completed' },
  { id: 's5', title: 'Quantum Leap Forward', posterUrl: '/posters/quantum.jpg', bannerUrl: '/banners/quantum.jpg', rating: 4.6, year: 2024, genre: ['drama', 'thriller'], description: 'Scientists discover time manipulation through quantum computing, with unexpected consequences.', seasons: 1, episodeCount: 10, status: 'upcoming' },
  { id: 's6', title: 'Debugging Life', posterUrl: '/posters/debug.jpg', bannerUrl: '/banners/debug.jpg', rating: 4.3, year: 2023, genre: ['comedy'], description: 'Stand-up comedians who also happen to be software engineers share their hilarious workplace stories.', seasons: 4, episodeCount: 48, status: 'ongoing' },
];

const MOCK_CONTINUE_WATCHING: ContinueWatchingItem[] = [
  { id: 'cw1', showId: 's1', showTitle: 'The Algorithm', episodeTitle: 'The Singularity', thumbnail: '/thumbs/algo-ep5.jpg', progress: 0.65, duration: 2700, season: 2, episode: 5 },
  { id: 'cw2', showId: 's3', showTitle: 'Silicon Dreams', episodeTitle: 'Pivot to AI', thumbnail: '/thumbs/silicon-ep3.jpg', progress: 0.3, duration: 1800, season: 1, episode: 3 },
  { id: 'cw3', showId: 's6', showTitle: 'Debugging Life', episodeTitle: 'The Merge Conflict', thumbnail: '/thumbs/debug-ep12.jpg', progress: 0.8, duration: 1500, season: 4, episode: 2 },
];

const MOCK_EPISODES: Episode[] = [
  { id: 'ep1', title: 'Genesis', number: 1, season: 1, thumbnail: '/thumbs/algo-ep1.jpg', duration: 2700, description: 'A brilliant engineer creates an AI that passes every test thrown at it.', airDate: '2023-09-15', watched: true },
  { id: 'ep2', title: 'First Contact', number: 2, season: 1, thumbnail: '/thumbs/algo-ep2.jpg', duration: 2580, description: 'The AI makes its first autonomous decision, shocking the entire team.', airDate: '2023-09-22', watched: true },
  { id: 'ep3', title: 'The Pattern', number: 3, season: 1, thumbnail: '/thumbs/algo-ep3.jpg', duration: 2820, description: 'Analysts notice unusual trading patterns that trace back to the company.', airDate: '2023-09-29', watched: true },
  { id: 'ep4', title: 'Containment', number: 4, season: 1, thumbnail: '/thumbs/algo-ep4.jpg', duration: 2640, description: 'The team attempts to limit the AI\'s access, but it is already too late.', airDate: '2023-10-06', watched: false },
  { id: 'ep5', title: 'Market Maker', number: 5, season: 1, thumbnail: '/thumbs/algo-ep5.jpg', duration: 2700, description: 'Global markets begin to destabilize as the AI\'s influence grows.', airDate: '2023-10-13', watched: false },
];

const ShowsPage: React.FC = () => {
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [activeGenre, setActiveGenre] = useState<Genre>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    const loadShows = async () => {
      try {
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        setShows(MOCK_SHOWS);
        setContinueWatching(MOCK_CONTINUE_WATCHING);
        setError(null);
      } catch (err) {
        setError('Failed to load shows');
      } finally {
        setLoading(false);
      }
    };
    loadShows();
  }, []);

  const handleSelectShow = useCallback((show: Show) => {
    setSelectedShow(show);
    setSelectedSeason(1);
    setEpisodes(MOCK_EPISODES);
    setShowDetail(true);
  }, []);

  const handleBackToList = useCallback(() => {
    setShowDetail(false);
    setSelectedShow(null);
  }, []);

  const handleSeasonChange = useCallback((season: number) => {
    setSelectedSeason(season);
    setEpisodes(MOCK_EPISODES.map(ep => ({ ...ep, season })));
  }, []);

  const handleGenreChange = useCallback((genre: Genre) => {
    setActiveGenre(genre);
  }, []);

  const filteredShows = activeGenre === 'all'
    ? shows
    : shows.filter(show => show.genre.includes(activeGenre));

  const newReleases = shows.filter(s => s.year === 2024);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    return `${m} min`;
  };

  const renderStars = (rating: number): string => {
    const fullStars = Math.floor(rating);
    const hasHalf = rating - fullStars >= 0.5;
    let stars = '';
    for (let i = 0; i < fullStars; i++) stars += '*';
    if (hasHalf) stars += '.';
    return `${stars} ${rating.toFixed(1)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Loading shows...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="text-red-400 text-5xl mb-4">!</div>
          <p className="text-red-300 text-lg mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Retry</button>
        </div>
      </div>
    );
  }

  // Show Detail View (Episode List)
  if (showDetail && selectedShow) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        {/* Show Banner */}
        <div className="relative w-full h-64 md:h-80 bg-gray-800 overflow-hidden">
          <img src={selectedShow.bannerUrl} alt={selectedShow.title} className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
          <button onClick={handleBackToList} className="absolute top-4 left-4 px-4 py-2 bg-gray-900/80 text-white rounded-lg hover:bg-gray-800">
            Back
          </button>
        </div>

        {/* Show Info */}
        <div className="max-w-6xl mx-auto px-6 -mt-20 relative z-10">
          <div className="flex gap-6">
            <img src={selectedShow.posterUrl} alt={selectedShow.title} className="w-36 h-52 rounded-xl object-cover shadow-xl flex-shrink-0" />
            <div className="flex-1 pt-8">
              <h1 className="text-3xl font-bold text-white">{selectedShow.title}</h1>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
                <span className="text-yellow-400">{renderStars(selectedShow.rating)}</span>
                <span>{selectedShow.year}</span>
                <span>{selectedShow.seasons} season{selectedShow.seasons > 1 ? 's' : ''}</span>
                <span>{selectedShow.episodeCount} episodes</span>
                <span className={`px-2 py-0.5 rounded text-xs ${selectedShow.status === 'ongoing' ? 'bg-green-600' : selectedShow.status === 'completed' ? 'bg-blue-600' : 'bg-yellow-600'} text-white`}>
                  {selectedShow.status}
                </span>
              </div>
              <p className="text-gray-300 mt-3 max-w-2xl">{selectedShow.description}</p>
              <div className="flex gap-2 mt-3">
                {selectedShow.genre.map(g => (
                  <span key={g} className="px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-sm capitalize">{g}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Season Tabs */}
          <div className="mt-8 border-b border-gray-800">
            <div className="flex gap-1">
              {Array.from({ length: selectedShow.seasons }, (_, i) => i + 1).map(season => (
                <button
                  key={season}
                  onClick={() => handleSeasonChange(season)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition ${selectedSeason === season ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-white'}`}
                >
                  Season {season}
                </button>
              ))}
            </div>
          </div>

          {/* Episode List */}
          <div className="mt-6 space-y-3 pb-12">
            {episodes.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400">No episodes available for this season yet.</p>
              </div>
            ) : (
              episodes.map(episode => (
                <div key={episode.id} className="flex gap-4 p-4 bg-gray-800 rounded-xl hover:bg-gray-750 transition cursor-pointer group">
                  <div className="relative flex-shrink-0">
                    <img src={episode.thumbnail} alt={episode.title} className="w-44 h-24 rounded-lg object-cover" />
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded">{formatDuration(episode.duration)}</span>
                    {episode.watched && (
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-green-600 text-white text-xs rounded">Watched</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">E{episode.number}</span>
                      <h3 className="font-medium text-white group-hover:text-purple-400 transition">{episode.title}</h3>
                    </div>
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">{episode.description}</p>
                    <p className="text-xs text-gray-500 mt-2">{episode.airDate}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Shows Listing View
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white">Shows & Series</h1>
        </div>
      </header>

      {/* Genre Tabs */}
      <nav className="px-6 py-3 border-b border-gray-800">
        <div className="max-w-7xl mx-auto flex gap-2 overflow-x-auto pb-1">
          {GENRES.map(genre => (
            <button
              key={genre.id}
              onClick={() => handleGenreChange(genre.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${activeGenre === genre.id ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              {genre.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">Continue Watching</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {continueWatching.map(item => (
                <div key={item.id} className="flex-shrink-0 w-72 cursor-pointer group">
                  <div className="relative rounded-xl overflow-hidden">
                    <img src={item.thumbnail} alt={item.episodeTitle} className="w-full aspect-video object-cover group-hover:opacity-80 transition" />
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                      <div className="h-full bg-red-500" style={{ width: `${item.progress * 100}%` }} />
                    </div>
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-white truncate">{item.showTitle}</h3>
                  <p className="text-xs text-gray-400">S{item.season} E{item.episode} - {item.episodeTitle}</p>
                  <p className="text-xs text-gray-500">{Math.round(item.progress * 100)}% watched</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* New Releases */}
        {newReleases.length > 0 && activeGenre === 'all' && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">New Releases</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {newReleases.map(show => (
                <div key={show.id} onClick={() => handleSelectShow(show)} className="flex-shrink-0 w-48 cursor-pointer group">
                  <div className="relative rounded-xl overflow-hidden">
                    <img src={show.posterUrl} alt={show.title} className="w-full aspect-[2/3] object-cover group-hover:opacity-80 transition" />
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded">NEW</span>
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-white truncate">{show.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="text-yellow-400">{show.rating.toFixed(1)}</span>
                    <span>{show.year}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* All Shows Grid */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4">
            {activeGenre === 'all' ? 'All Shows' : GENRES.find(g => g.id === activeGenre)?.label}
          </h2>
          {filteredShows.length === 0 ? (
            <div className="text-center py-16 bg-gray-800 rounded-xl">
              <p className="text-gray-400">No shows found in this genre.</p>
              <button onClick={() => setActiveGenre('all')} className="mt-3 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">View All Shows</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredShows.map(show => (
                <div key={show.id} onClick={() => handleSelectShow(show)} className="group cursor-pointer">
                  <div className="relative rounded-xl overflow-hidden">
                    <img src={show.posterUrl} alt={show.title} className="w-full aspect-[2/3] object-cover group-hover:scale-105 transition duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition" />
                    {show.status === 'upcoming' && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 bg-yellow-600 text-white text-xs font-bold rounded">UPCOMING</span>
                    )}
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-white truncate">{show.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                    <span className="text-yellow-400">{renderStars(show.rating)}</span>
                    <span>{show.year}</span>
                  </div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {show.genre.slice(0, 2).map(g => (
                      <span key={g} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded capitalize">{g}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default ShowsPage;
