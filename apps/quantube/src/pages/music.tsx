// ============================================================================
// QuantTube - Music Streaming Page
// Full music player with albums, artists, playlists, radio, charts, lyrics
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Track {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  albumCover: string;
  duration: number;
  explicit: boolean;
}

interface Album {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  year: number;
  trackCount: number;
}

interface Artist {
  id: string;
  name: string;
  imageUrl: string;
  monthlyListeners: number;
  verified: boolean;
}

interface PlaylistItem {
  id: string;
  title: string;
  coverUrl: string;
  trackCount: number;
  creator: string;
  isOwn: boolean;
}

type BrowseTab = 'albums' | 'artists' | 'playlists' | 'radio' | 'charts';
type RepeatMode = 'off' | 'all' | 'one';

interface MusicPageState {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  volume: number;
  progress: number;
  shuffle: boolean;
  repeat: RepeatMode;
  browseTab: BrowseTab;
  searchQuery: string;
  searchResults: Track[];
  queuePanelOpen: boolean;
  lyricsPanelOpen: boolean;
  recentlyPlayed: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: PlaylistItem[];
  loading: boolean;
  error: string | null;
  libraryOpen: boolean;
}

const MOCK_TRACKS: Track[] = [
  { id: 't1', title: 'Midnight City', artist: 'M83', artistId: 'a1', album: 'Hurry Up, We\'re Dreaming', albumId: 'al1', albumCover: '/covers/midnight.jpg', duration: 243, explicit: false },
  { id: 't2', title: 'Blinding Lights', artist: 'The Weeknd', artistId: 'a2', album: 'After Hours', albumId: 'al2', albumCover: '/covers/blinding.jpg', duration: 200, explicit: false },
  { id: 't3', title: 'Levitating', artist: 'Dua Lipa', artistId: 'a3', album: 'Future Nostalgia', albumId: 'al3', albumCover: '/covers/levitating.jpg', duration: 203, explicit: false },
  { id: 't4', title: 'Save Your Tears', artist: 'The Weeknd', artistId: 'a2', album: 'After Hours', albumId: 'al2', albumCover: '/covers/tears.jpg', duration: 215, explicit: false },
  { id: 't5', title: 'Heat Waves', artist: 'Glass Animals', artistId: 'a4', album: 'Dreamland', albumId: 'al4', albumCover: '/covers/heatwaves.jpg', duration: 238, explicit: false },
];

const MOCK_ALBUMS: Album[] = [
  { id: 'al1', title: 'Hurry Up, We\'re Dreaming', artist: 'M83', coverUrl: '/covers/hurryup.jpg', year: 2011, trackCount: 22 },
  { id: 'al2', title: 'After Hours', artist: 'The Weeknd', coverUrl: '/covers/afterhours.jpg', year: 2020, trackCount: 14 },
  { id: 'al3', title: 'Future Nostalgia', artist: 'Dua Lipa', coverUrl: '/covers/future.jpg', year: 2020, trackCount: 11 },
  { id: 'al4', title: 'Dreamland', artist: 'Glass Animals', coverUrl: '/covers/dreamland.jpg', year: 2020, trackCount: 16 },
];

const MOCK_ARTISTS: Artist[] = [
  { id: 'a1', name: 'M83', imageUrl: '/artists/m83.jpg', monthlyListeners: 8500000, verified: true },
  { id: 'a2', name: 'The Weeknd', imageUrl: '/artists/weeknd.jpg', monthlyListeners: 75000000, verified: true },
  { id: 'a3', name: 'Dua Lipa', imageUrl: '/artists/dualipa.jpg', monthlyListeners: 62000000, verified: true },
  { id: 'a4', name: 'Glass Animals', imageUrl: '/artists/glass.jpg', monthlyListeners: 25000000, verified: true },
];

const MOCK_PLAYLISTS: PlaylistItem[] = [
  { id: 'p1', title: 'Daily Mix 1', coverUrl: '/playlists/mix1.jpg', trackCount: 50, creator: 'QuantTube', isOwn: false },
  { id: 'p2', title: 'Chill Vibes', coverUrl: '/playlists/chill.jpg', trackCount: 120, creator: 'You', isOwn: true },
  { id: 'p3', title: 'Workout Energy', coverUrl: '/playlists/workout.jpg', trackCount: 75, creator: 'You', isOwn: true },
  { id: 'p4', title: 'Discover Weekly', coverUrl: '/playlists/discover.jpg', trackCount: 30, creator: 'QuantTube', isOwn: false },
];

const MusicPage: React.FC = () => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(75);
  const [progress, setProgress] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [browseTab, setBrowseTab] = useState<BrowseTab>('albums');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [queuePanelOpen, setQueuePanelOpen] = useState(false);
  const [lyricsPanelOpen, setLyricsPanelOpen] = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const loadMusicData = async () => {
      try {
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 600));
        setAlbums(MOCK_ALBUMS);
        setArtists(MOCK_ARTISTS);
        setPlaylists(MOCK_PLAYLISTS);
        setRecentlyPlayed(MOCK_TRACKS.slice(0, 3));
        setQueue(MOCK_TRACKS);
        setError(null);
      } catch (err) {
        setError('Failed to load music library');
      } finally {
        setLoading(false);
      }
    };
    loadMusicData();
  }, []);

  useEffect(() => {
    if (isPlaying && currentTrack) {
      progressRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= currentTrack.duration) {
            handleNext();
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [isPlaying, currentTrack]);

  const handlePlayTrack = useCallback((track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
    setRecentlyPlayed(prev => [track, ...prev.filter(t => t.id !== track.id)].slice(0, 10));
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (!currentTrack && queue.length > 0) {
      handlePlayTrack(queue[0]);
    } else {
      setIsPlaying(prev => !prev);
    }
  }, [currentTrack, queue, handlePlayTrack]);

  const handleNext = useCallback(() => {
    if (queue.length === 0) return;
    const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
    let nextIndex: number;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (repeat === 'one') {
      nextIndex = currentIndex;
    } else {
      nextIndex = (currentIndex + 1) % queue.length;
    }
    handlePlayTrack(queue[nextIndex]);
  }, [queue, currentTrack, shuffle, repeat, handlePlayTrack]);

  const handlePrev = useCallback(() => {
    if (progress > 5) {
      setProgress(0);
      return;
    }
    const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
    handlePlayTrack(queue[prevIndex]);
  }, [queue, currentTrack, progress, handlePlayTrack]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const results = MOCK_TRACKS.filter(t =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.artist.toLowerCase().includes(query.toLowerCase())
      );
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, []);

  const handleRemoveFromQueue = useCallback((trackId: string) => {
    setQueue(prev => prev.filter(t => t.id !== trackId));
  }, []);

  const handleRepeatToggle = useCallback(() => {
    setRepeat(prev => prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off');
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatListeners = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Loading your music...</p>
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
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header with Search */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-purple-400">QuantTube Music</h1>
          <div className="flex-1 max-w-md mx-8">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search songs, artists, albums..."
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-full text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setLibraryOpen(!libraryOpen)} className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white border border-gray-700 rounded-lg">
              Your Library
            </button>
            <button onClick={() => setQueuePanelOpen(!queuePanelOpen)} className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white border border-gray-700 rounded-lg">
              Queue ({queue.length})
            </button>
          </div>
        </div>
      </header>

      {/* Search Results Overlay */}
      {searchQuery && searchResults.length > 0 && (
        <div className="absolute z-30 top-20 left-1/2 -translate-x-1/2 w-full max-w-md bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4">
          {searchResults.map(track => (
            <div key={track.id} onClick={() => handlePlayTrack(track)} className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded-lg cursor-pointer">
              <img src={track.albumCover} alt={track.album} className="w-10 h-10 rounded" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{track.title}</p>
                <p className="text-xs text-gray-400">{track.artist}</p>
              </div>
              <span className="text-xs text-gray-500">{formatTime(track.duration)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Browse Tabs */}
      <nav className="px-6 py-3 border-b border-gray-800 max-w-7xl mx-auto">
        <div className="flex gap-2">
          {(['albums', 'artists', 'playlists', 'radio', 'charts'] as BrowseTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setBrowseTab(tab)}
              className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${browseTab === tab ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6 flex gap-6">
        <div className={`flex-1 ${queuePanelOpen || lyricsPanelOpen ? 'mr-80' : ''}`}>
          {/* Recently Played */}
          {recentlyPlayed.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xl font-bold text-white mb-4">Recently Played</h2>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {recentlyPlayed.map(track => (
                  <div key={track.id} onClick={() => handlePlayTrack(track)} className="flex-shrink-0 w-40 cursor-pointer group">
                    <img src={track.albumCover} alt={track.album} className="w-40 h-40 rounded-lg object-cover group-hover:opacity-80 transition" />
                    <p className="mt-2 text-sm font-medium text-white truncate">{track.title}</p>
                    <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Browse Content */}
          {browseTab === 'albums' && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Albums</h2>
              {albums.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-4xl mb-2">No albums found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {albums.map(album => (
                    <div key={album.id} className="group cursor-pointer">
                      <img src={album.coverUrl} alt={album.title} className="w-full aspect-square rounded-lg object-cover group-hover:opacity-80 transition" />
                      <h3 className="mt-2 font-medium text-white truncate">{album.title}</h3>
                      <p className="text-sm text-gray-400">{album.artist} - {album.year}</p>
                      <p className="text-xs text-gray-500">{album.trackCount} tracks</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {browseTab === 'artists' && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Artists</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {artists.map(artist => (
                  <div key={artist.id} className="text-center group cursor-pointer">
                    <img src={artist.imageUrl} alt={artist.name} className="w-32 h-32 rounded-full mx-auto object-cover group-hover:opacity-80 transition" />
                    <h3 className="mt-3 font-medium text-white">{artist.name}</h3>
                    {artist.verified && <span className="text-xs text-blue-400">Verified</span>}
                    <p className="text-sm text-gray-400">{formatListeners(artist.monthlyListeners)} listeners</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {browseTab === 'playlists' && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Playlists</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {playlists.map(pl => (
                  <div key={pl.id} className="group cursor-pointer">
                    <img src={pl.coverUrl} alt={pl.title} className="w-full aspect-square rounded-lg object-cover group-hover:opacity-80 transition" />
                    <h3 className="mt-2 font-medium text-white truncate">{pl.title}</h3>
                    <p className="text-sm text-gray-400">{pl.creator} - {pl.trackCount} tracks</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {browseTab === 'radio' && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Radio Stations</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {['Chill Beats', 'Indie Rock Radio', 'Pop Hits', 'Electronic', 'Jazz Lounge', 'Classical Focus'].map(station => (
                  <div key={station} className="p-4 bg-gradient-to-br from-purple-900 to-gray-800 rounded-xl cursor-pointer hover:from-purple-800 transition">
                    <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center mb-3 text-lg">R</div>
                    <h3 className="font-medium text-white">{station}</h3>
                    <p className="text-sm text-gray-400">Curated by QuantTube</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {browseTab === 'charts' && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Top Charts</h2>
              <div className="space-y-2">
                {MOCK_TRACKS.map((track, i) => (
                  <div key={track.id} onClick={() => handlePlayTrack(track)} className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 cursor-pointer">
                    <span className="w-8 text-center font-bold text-gray-400">{i + 1}</span>
                    <img src={track.albumCover} alt={track.album} className="w-12 h-12 rounded" />
                    <div className="flex-1">
                      <p className="font-medium text-white">{track.title}</p>
                      <p className="text-sm text-gray-400">{track.artist}</p>
                    </div>
                    <span className="text-sm text-gray-500">{formatTime(track.duration)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Queue Panel */}
        {queuePanelOpen && (
          <aside className="fixed right-0 top-20 bottom-24 w-80 bg-gray-850 border-l border-gray-800 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Queue</h3>
              <button onClick={() => setQueuePanelOpen(false)} className="text-gray-400 hover:text-white">X</button>
            </div>
            {queue.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Queue is empty</p>
            ) : (
              <div className="space-y-2">
                {queue.map((track, i) => (
                  <div key={`${track.id}-${i}`} className={`flex items-center gap-3 p-2 rounded-lg ${currentTrack?.id === track.id ? 'bg-purple-900/50' : 'hover:bg-gray-800'}`}>
                    <span className="text-xs text-gray-500 w-5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{track.title}</p>
                      <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                    </div>
                    <button onClick={() => handleRemoveFromQueue(track.id)} className="text-gray-500 hover:text-red-400 text-xs">X</button>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}

        {/* Lyrics Panel */}
        {lyricsPanelOpen && currentTrack && (
          <aside className="fixed right-0 top-20 bottom-24 w-80 bg-gray-850 border-l border-gray-800 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Lyrics</h3>
              <button onClick={() => setLyricsPanelOpen(false)} className="text-gray-400 hover:text-white">X</button>
            </div>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>Lyrics for "{currentTrack.title}" by {currentTrack.artist}</p>
              <p className="text-gray-500 italic">Lyrics sync coming soon...</p>
            </div>
          </aside>
        )}
      </main>

      {/* Now Playing Bar */}
      {currentTrack && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-6 py-3 z-50">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            {/* Track Info */}
            <div className="flex items-center gap-3 w-64">
              <img src={currentTrack.albumCover} alt={currentTrack.album} className="w-14 h-14 rounded-lg" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{currentTrack.title}</p>
                <p className="text-xs text-gray-400 truncate">{currentTrack.artist}</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex-1 flex flex-col items-center">
              <div className="flex items-center gap-4 mb-1">
                <button onClick={() => setShuffle(!shuffle)} className={`text-sm ${shuffle ? 'text-purple-400' : 'text-gray-400'} hover:text-white`}>
                  Shuffle
                </button>
                <button onClick={handlePrev} className="w-8 h-8 flex items-center justify-center text-white hover:text-purple-400">
                  Prev
                </button>
                <button onClick={handleTogglePlay} className="w-10 h-10 bg-white text-gray-900 rounded-full flex items-center justify-center font-bold hover:scale-105 transition">
                  {isPlaying ? '||' : '>'}
                </button>
                <button onClick={handleNext} className="w-8 h-8 flex items-center justify-center text-white hover:text-purple-400">
                  Next
                </button>
                <button onClick={handleRepeatToggle} className={`text-sm ${repeat !== 'off' ? 'text-purple-400' : 'text-gray-400'} hover:text-white`}>
                  {repeat === 'one' ? 'Rep1' : 'Rep'}
                </button>
              </div>
              <div className="flex items-center gap-2 w-full max-w-md">
                <span className="text-xs text-gray-400 w-10 text-right">{formatTime(progress)}</span>
                <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden cursor-pointer">
                  <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${currentTrack.duration > 0 ? (progress / currentTrack.duration) * 100 : 0}%` }} />
                </div>
                <span className="text-xs text-gray-400 w-10">{formatTime(currentTrack.duration)}</span>
              </div>
            </div>

            {/* Volume and Extras */}
            <div className="flex items-center gap-3 w-48">
              <button onClick={() => setLyricsPanelOpen(!lyricsPanelOpen)} className={`text-sm ${lyricsPanelOpen ? 'text-purple-400' : 'text-gray-400'} hover:text-white`}>
                Lyrics
              </button>
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-gray-400">Vol</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full h-1 bg-gray-700 rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicPage;
