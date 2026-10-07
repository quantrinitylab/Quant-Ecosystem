// ============================================================================
// QuantTube - Shows/Series Page
// Browse shows, continue watching, genre tabs, episode lists
// ============================================================================

import React, { useState, useCallback } from 'react';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useShows, useShow } from '../hooks/useShows';
import type { Show } from '../types';

type Genre = 'all' | 'drama' | 'comedy' | 'action' | 'thriller' | 'documentary';

const GENRES: { id: Genre; label: string }[] = [
  { id: 'all', label: 'All Genres' },
  { id: 'drama', label: 'Drama' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'action', label: 'Action' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'documentary', label: 'Documentary' },
];

const ShowsPage: React.FC = () => {
  const [activeGenre, setActiveGenre] = useState<Genre>('all');
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);

  const showsQuery = useShows(activeGenre === 'all' ? undefined : activeGenre);
  const showDetailQuery = useShow(selectedShowId ?? '');

  const shows = showsQuery.data ?? [];
  const selectedShow = showDetailQuery.data;
  const showDetail = selectedShowId !== null;

  const handleSelectShow = useCallback((show: Show) => {
    setSelectedShowId(show.id);
    setSelectedSeason(1);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedShowId(null);
  }, []);

  const handleSeasonChange = useCallback((season: number) => {
    setSelectedSeason(season);
  }, []);

  const handleGenreChange = useCallback((genre: Genre) => {
    setActiveGenre(genre);
  }, []);

  const newReleases = shows.filter((s) => s.year === new Date().getFullYear());

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    return `${m} min`;
  };

  const renderStars = (rating: string): string => {
    const numRating = parseFloat(rating);
    if (isNaN(numRating)) return rating;
    const fullStars = Math.floor(numRating);
    const hasHalf = numRating - fullStars >= 0.5;
    let stars = '';
    for (let i = 0; i < fullStars; i++) stars += '*';
    if (hasHalf) stars += '.';
    return `${stars} ${numRating.toFixed(1)}`;
  };

  if (showsQuery.isLoading) {
    return <LoadingState variant="spinner" text="Loading shows..." />;
  }

  if (showsQuery.error) {
    return <ErrorState message={showsQuery.error.message} onRetry={() => showsQuery.refetch()} />;
  }

  if (shows.length === 0 && !showDetail) {
    return <EmptyState title="No shows available" description="Check back later for new content" />;
  }

  // Show Detail View (Episode List)
  if (showDetail && selectedShow) {
    const episodes = selectedShow.seasons?.[selectedSeason - 1]?.episodes ?? [];

    return (
      <div className="min-h-screen bg-gray-900 text-white">
        {/* Show Banner */}
        <div className="relative w-full h-64 md:h-80 bg-gray-800 overflow-hidden">
          <img
            src={selectedShow.bannerUrl}
            alt={selectedShow.title}
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
          <button
            onClick={handleBackToList}
            className="absolute top-4 left-4 px-4 py-2 bg-gray-900/80 text-white rounded-lg hover:bg-gray-800"
          >
            Back
          </button>
        </div>

        {/* Show Info */}
        <div className="max-w-6xl mx-auto px-6 -mt-20 relative z-10">
          <div className="flex gap-6">
            <img
              src={selectedShow.posterUrl}
              alt={selectedShow.title}
              className="w-36 h-52 rounded-xl object-cover shadow-xl flex-shrink-0"
            />
            <div className="flex-1 pt-8">
              <h1 className="text-3xl font-bold text-white">{selectedShow.title}</h1>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
                <span className="text-yellow-400">{renderStars(selectedShow.rating)}</span>
                <span>{selectedShow.year}</span>
                <span>
                  {selectedShow.seasons?.length ?? 0} season
                  {(selectedShow.seasons?.length ?? 0) > 1 ? 's' : ''}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs ${selectedShow.status === 'ongoing' ? 'bg-green-600' : selectedShow.status === 'completed' ? 'bg-blue-600' : 'bg-yellow-600'} text-white`}
                >
                  {selectedShow.status}
                </span>
              </div>
              <p className="text-gray-300 mt-3 max-w-2xl">{selectedShow.description}</p>
              <div className="flex gap-2 mt-3">
                {selectedShow.genre.map((g) => (
                  <span
                    key={g}
                    className="px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-sm capitalize"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Season Tabs */}
          <div className="mt-8 border-b border-gray-800">
            <div className="flex gap-1">
              {(selectedShow.seasons ?? []).map((season) => (
                <button
                  key={season.number}
                  onClick={() => handleSeasonChange(season.number)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition ${selectedSeason === season.number ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-white'}`}
                >
                  Season {season.number}
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
              episodes.map((episode) => (
                <div
                  key={episode.id}
                  className="flex gap-4 p-4 bg-gray-800 rounded-xl hover:bg-gray-750 transition cursor-pointer group"
                >
                  <div className="relative flex-shrink-0">
                    <img
                      src={episode.thumbnailUrl}
                      alt={episode.title}
                      className="w-44 h-24 rounded-lg object-cover"
                    />
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded">
                      {formatDuration(episode.duration)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">E{episode.number}</span>
                      <h3 className="font-medium text-white group-hover:text-purple-400 transition">
                        {episode.title}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">{episode.description}</p>
                    <p className="text-xs text-gray-500 mt-2">{episode.releaseDate}</p>
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
          {GENRES.map((genre) => (
            <button
              key={genre.id}
              onClick={() => handleGenreChange(genre.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition ${activeGenre === genre.id ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              title={genre.label}
            >
              {genre.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* New Releases */}
        {newReleases.length > 0 && activeGenre === 'all' && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">New Releases</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {newReleases.map((show) => (
                <div
                  key={show.id}
                  onClick={() => handleSelectShow(show)}
                  className="flex-shrink-0 w-48 cursor-pointer group"
                >
                  <div className="relative rounded-xl overflow-hidden">
                    <img
                      src={show.posterUrl}
                      alt={show.title}
                      className="w-full aspect-[2/3] object-cover group-hover:opacity-80 transition"
                    />
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded">
                      NEW
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-white truncate">{show.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="text-yellow-400">{parseFloat(show.rating).toFixed(1)}</span>
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
            {activeGenre === 'all' ? 'All Shows' : GENRES.find((g) => g.id === activeGenre)?.label}
          </h2>
          {shows.length === 0 ? (
            <div className="text-center py-16 bg-gray-800 rounded-xl">
              <p className="text-gray-400">No shows found in this genre.</p>
              <button
                onClick={() => setActiveGenre('all')}
                className="mt-3 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
              >
                View All Shows
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {shows.map((show) => (
                <div
                  key={show.id}
                  onClick={() => handleSelectShow(show)}
                  className="group cursor-pointer"
                >
                  <div className="relative rounded-xl overflow-hidden">
                    <img
                      src={show.posterUrl}
                      alt={show.title}
                      className="w-full aspect-[2/3] object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition" />
                    {show.status === 'upcoming' && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 bg-yellow-600 text-white text-xs font-bold rounded">
                        UPCOMING
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-white truncate">{show.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                    <span className="text-yellow-400">{renderStars(show.rating)}</span>
                    <span>{show.year}</span>
                  </div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {show.genre.slice(0, 2).map((g) => (
                      <span
                        key={g}
                        className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded capitalize"
                      >
                        {g}
                      </span>
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
