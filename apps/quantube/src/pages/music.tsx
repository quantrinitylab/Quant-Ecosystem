// ============================================================================
// QuantTube - Music Page
// ----------------------------------------------------------------------------
// Music catalog browser + player backed by the REAL music backend
// (MusicService over Prisma: MusicAlbum + MusicTrack). All data flows through
// the Layer-5 hooks in features/music/useMusic.ts over the same-origin proxy
// paths — no mock artists, tracks, albums, or listener counts anywhere.
//
// Tabs without a backend endpoint (artists, playlists, radio, charts) are
// intentionally absent: the page only shows what the API actually returns.
// An empty catalog renders an honest empty state, never invented content.
// ============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import {
  useMusicTracks,
  useMusicAlbums,
  getMusicAlbum,
  getTrackStream,
} from '../features/music/useMusic';

// --- Response contracts (single authoritative source; imported by the hooks) ---

export interface ApiTrack {
  id: string;
  title: string;
  artistName: string;
  albumId: string | null;
  audioUrl: string;
  artworkUrl: string | null;
  durationSec: number;
  genre: string | null;
  playCount: number;
  createdAt: string;
}

export interface ApiAlbum {
  id: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  releaseDate: string | null;
  createdAt: string;
  tracks?: ApiTrack[];
}

export interface MusicHomeResponse {
  tracks: ApiTrack[];
  albums: ApiAlbum[];
}

export interface MusicTracksResponse {
  tracks: ApiTrack[];
  page: number;
  pageSize: number;
}

export interface MusicAlbumsResponse {
  albums: ApiAlbum[];
  page: number;
  pageSize: number;
}

export interface MusicAlbumDetailResponse {
  album: ApiAlbum;
}

export interface TrackStreamResponse {
  trackId: string;
  streamUrl: string;
  mimeType: string;
  durationSec: number;
}

type BrowseTab = 'tracks' | 'albums';
type RepeatMode = 'off' | 'all' | 'one';
type StreamStatus = 'idle' | 'loading' | 'ready' | 'error';

const MusicPage: React.FC = () => {
  const [browseTab, setBrowseTab] = useState<BrowseTab>('tracks');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTrack, setCurrentTrack] = useState<ApiTrack | null>(null);
  const [queue, setQueue] = useState<ApiTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(75);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [recentlyPlayed, setRecentlyPlayed] = useState<ApiTrack[]>([]);
  const [queuePanelOpen, setQueuePanelOpen] = useState(false);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [albumLoadingId, setAlbumLoadingId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Real data: tracks + albums from the backend (react-query, cached) ---
  const tracksQuery = useMusicTracks({ pageSize: 100 });
  const albumsQuery = useMusicAlbums({ pageSize: 100 });

  const tracks = tracksQuery.data?.data.tracks ?? [];
  const albums = albumsQuery.data?.data.albums ?? [];
  const loading = tracksQuery.isLoading || albumsQuery.isLoading;
  const loadError = tracksQuery.isError || albumsQuery.isError;

  const searchResults =
    searchQuery.trim().length > 0
      ? tracks.filter(
          (t) =>
            t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.artistName.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : [];

  // --- Playback (real <audio> element; stream URL comes from the backend) ---

  const playTrack = useCallback(async (track: ApiTrack, contextList: ApiTrack[]) => {
    setCurrentTrack(track);
    setQueue(contextList);
    setProgress(0);
    setStreamStatus('loading');
    setStreamError(null);
    try {
      const res = await getTrackStream(track.id);
      const streamUrl = res.success ? res.data?.streamUrl : undefined;
      if (!streamUrl) {
        throw new Error('empty stream url');
      }
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = streamUrl;
      setDuration(res.data?.durationSec ?? track.durationSec ?? 0);
      await audio.play();
      setStreamStatus('ready');
      setRecentlyPlayed((prev) => [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 10));
    } catch {
      setStreamStatus('error');
      setStreamError('Could not load audio for this track.');
      setIsPlaying(false);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (queue.length === 0) return;
    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);
    let nextIndex: number;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (repeat === 'one') {
      nextIndex = currentIndex;
    } else {
      nextIndex = (currentIndex + 1) % queue.length;
    }
    void playTrack(queue[nextIndex], queue);
  }, [queue, currentTrack, shuffle, repeat, playTrack]);

  const handlePrev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 5) {
      audio.currentTime = 0;
      return;
    }
    if (queue.length === 0) return;
    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
    void playTrack(queue[prevIndex], queue);
  }, [queue, currentTrack, playTrack]);

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentTrack) {
      if (tracks.length > 0) void playTrack(tracks[0], tracks);
      return;
    }
    if (streamStatus === 'loading') return;
    if (audio.paused) {
      void audio.play().catch(() => setStreamError('Could not play this track.'));
    } else {
      audio.pause();
    }
  }, [currentTrack, tracks, streamStatus, playTrack]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      audio.currentTime = ratio * duration;
      setProgress(audio.currentTime);
    },
    [duration],
  );

  const handleRepeatToggle = useCallback(() => {
    setRepeat((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  }, []);

  const handlePlayAlbum = useCallback(
    async (album: ApiAlbum) => {
      setAlbumLoadingId(album.id);
      try {
        const res = await getMusicAlbum(album.id);
        const albumTracks = res.success ? (res.data?.album.tracks ?? []) : [];
        if (albumTracks.length > 0) {
          void playTrack(albumTracks[0], albumTracks);
        } else {
          setStreamError('This album has no playable tracks yet.');
        }
      } catch {
        setStreamError('Could not load this album.');
      } finally {
        setAlbumLoadingId(null);
      }
    },
    [playTrack],
  );

  const handleRetry = () => {
    void tracksQuery.refetch();
    void albumsQuery.refetch();
  };

  // Keep element volume in sync with the slider.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--quant-background)] p-6">
        <div className="max-w-7xl mx-auto">
          <div className="h-8 w-48 bg-[var(--surface-elevated)] animate-shimmer rounded mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <LoadingSkeleton variant="music-track" count={8} />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--quant-background)]">
        <div className="text-center">
          <p className="text-[var(--quant-foreground)] text-lg mb-2">Couldn&apos;t load the music catalog.</p>
          <p className="text-[var(--quant-muted-foreground)] text-sm mb-4">
            Check your connection and try again.
          </p>
          <button
            onClick={handleRetry}
            className="px-6 py-2 bg-[var(--brand-primary)] text-white rounded-lg hover:bg-[var(--brand-primary-hover)] min-h-[44px] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)] pb-24">
      {/* Hidden real audio element */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (e.currentTarget.duration && Number.isFinite(e.currentTarget.duration)) {
            setDuration(e.currentTarget.duration);
          }
        }}
        onEnded={handleNext}
        onError={() => {
          setStreamStatus('error');
          setStreamError('Could not play this track.');
          setIsPlaying(false);
        }}
      />

      {/* Header with Search */}
      <header className="sticky top-0 z-40 bg-[var(--quant-background)]/95 backdrop-blur border-b border-[var(--quant-border)] px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-[var(--brand-primary)]">QuantTube Music</h1>
          <div className="flex-1 max-w-md mx-8">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search songs and artists..."
              className="w-full px-4 py-2 bg-[var(--surface-elevated)] border border-[var(--quant-border)] rounded-full text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--brand-primary)]"
            />
          </div>
          <button
            onClick={() => setQueuePanelOpen(!queuePanelOpen)}
            className="px-4 py-2 text-sm font-medium text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] border border-[var(--quant-border)] rounded-lg min-h-[44px]"
          >
            Queue ({queue.length})
          </button>
        </div>
      </header>

      {/* Browse Tabs — only surfaces the backend actually serves */}
      {!isSearching && (
        <nav className="px-6 py-3 border-b border-[var(--quant-border)] max-w-7xl mx-auto">
          <div className="flex gap-2">
            {(['tracks', 'albums'] as BrowseTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setBrowseTab(tab)}
                className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors min-h-[44px] ${browseTab === tab ? 'bg-[var(--brand-primary)] text-white' : 'bg-[var(--surface-elevated)] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {streamError && !currentTrack && (
          <p className="mb-4 text-sm text-[var(--quant-destructive)]">{streamError}</p>
        )}

        {isSearching ? (
          <section>
            <h2 className="text-xl font-bold text-white mb-4">
              Results ({searchResults.length})
            </h2>
            {searchResults.length === 0 ? (
              <p className="text-center py-12 text-gray-500">
                No tracks match &ldquo;{searchQuery.trim()}&rdquo;.
              </p>
            ) : (
              <div className="space-y-2">
                {searchResults.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    active={currentTrack?.id === track.id}
                    onPlay={() => void playTrack(track, searchResults)}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Recently Played — this session only */}
            {recentlyPlayed.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xl font-bold text-white mb-4">Recently Played</h2>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {recentlyPlayed.map((track) => (
                    <div
                      key={track.id}
                      onClick={() => void playTrack(track, recentlyPlayed)}
                      className="flex-shrink-0 w-40 cursor-pointer group"
                    >
                      <Artwork
                        src={track.artworkUrl}
                        alt={track.title}
                        className="w-40 h-40 rounded-lg"
                      />
                      <p className="mt-2 text-sm font-medium text-white truncate">{track.title}</p>
                      <p className="text-xs text-gray-400 truncate">{track.artistName}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {browseTab === 'tracks' && (
              <section>
                <h2 className="text-xl font-bold text-white mb-4">Tracks</h2>
                {tracks.length === 0 ? (
                  <p className="text-center py-12 text-gray-500">No tracks yet.</p>
                ) : (
                  <div className="space-y-2">
                    {tracks.map((track) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        active={currentTrack?.id === track.id}
                        onPlay={() => void playTrack(track, tracks)}
                        formatTime={formatTime}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {browseTab === 'albums' && (
              <section>
                <h2 className="text-xl font-bold text-white mb-4">Albums</h2>
                {albums.length === 0 ? (
                  <p className="text-center py-12 text-gray-500">No albums yet.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {albums.map((album) => (
                      <div
                        key={album.id}
                        onClick={() => void handlePlayAlbum(album)}
                        className="group cursor-pointer"
                      >
                        <div className="relative">
                          <Artwork
                            src={album.artworkUrl}
                            alt={album.title}
                            className="w-full aspect-square rounded-lg"
                          />
                          {albumLoadingId === album.id && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>
                        <h3 className="mt-2 font-medium text-white truncate">{album.title}</h3>
                        <p className="text-sm text-gray-400 truncate">{album.artistName}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Queue Panel */}
      {queuePanelOpen && (
        <aside className="fixed right-0 top-20 bottom-24 w-80 bg-gray-850 border-l border-gray-800 p-4 overflow-y-auto z-40">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Queue</h3>
            <button
              onClick={() => setQueuePanelOpen(false)}
              className="text-gray-400 hover:text-white min-h-[44px] min-w-[44px]"
            >
              X
            </button>
          </div>
          {queue.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Queue is empty</p>
          ) : (
            <div className="space-y-2">
              {queue.map((track, i) => (
                <div
                  key={`${track.id}-${i}`}
                  onClick={() => void playTrack(track, queue)}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${currentTrack?.id === track.id ? 'bg-purple-900/50' : 'hover:bg-gray-800'}`}
                >
                  <span className="text-xs text-gray-500 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{track.title}</p>
                    <p className="text-xs text-gray-400 truncate">{track.artistName}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}

      {/* Now Playing Bar */}
      {currentTrack && (
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', ...spring.stiff }}
          className="fixed bottom-0 left-0 right-0 bg-[var(--quant-background)] border-t border-[var(--quant-border)] px-6 py-3 z-50"
        >
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            {/* Track Info */}
            <div className="flex items-center gap-3 w-64">
              <Artwork
                src={currentTrack.artworkUrl}
                alt={currentTrack.title}
                className="w-14 h-14 rounded-lg"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--quant-foreground)] truncate">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
                  {currentTrack.artistName}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex-1 flex flex-col items-center">
              <div className="flex items-center gap-4 mb-1">
                <button
                  onClick={() => setShuffle(!shuffle)}
                  className={`text-sm min-h-[44px] ${shuffle ? 'text-[var(--brand-primary)]' : 'text-[var(--quant-muted-foreground)]'} hover:text-[var(--quant-foreground)]`}
                >
                  Shuffle
                </button>
                <button
                  onClick={handlePrev}
                  className="w-8 h-8 flex items-center justify-center text-[var(--quant-foreground)] hover:text-[var(--brand-primary)] min-h-[44px]"
                >
                  Prev
                </button>
                <button
                  onClick={handleTogglePlay}
                  disabled={streamStatus === 'loading'}
                  className="w-10 h-10 bg-[var(--brand-primary)] text-white rounded-full flex items-center justify-center font-bold hover:scale-105 transition min-h-[44px] min-w-[44px] disabled:opacity-50"
                >
                  {streamStatus === 'loading' ? '...' : isPlaying ? '||' : '>'}
                </button>
                <button
                  onClick={handleNext}
                  className="w-8 h-8 flex items-center justify-center text-[var(--quant-foreground)] hover:text-[var(--brand-primary)] min-h-[44px]"
                >
                  Next
                </button>
                <button
                  onClick={handleRepeatToggle}
                  className={`text-sm min-h-[44px] ${repeat !== 'off' ? 'text-[var(--brand-primary)]' : 'text-[var(--quant-muted-foreground)]'} hover:text-[var(--quant-foreground)]`}
                >
                  {repeat === 'one' ? 'Rep1' : 'Rep'}
                </button>
              </div>
              <div className="flex items-center gap-2 w-full max-w-md">
                <span className="text-xs text-[var(--quant-muted-foreground)] w-10 text-right">
                  {formatTime(progress)}
                </span>
                <div
                  className="flex-1 h-1 bg-[var(--quant-muted)] rounded-full overflow-hidden cursor-pointer"
                  onClick={handleSeek}
                >
                  <div
                    className="h-full bg-[var(--brand-primary)] rounded-full transition-all"
                    style={{
                      width: `${duration > 0 ? (progress / duration) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-[var(--quant-muted-foreground)] w-10">
                  {formatTime(duration)}
                </span>
              </div>
              {streamStatus === 'error' && streamError && (
                <p className="text-xs text-[var(--quant-destructive)] mt-1">{streamError}</p>
              )}
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 w-48">
              <span className="text-xs text-[var(--quant-muted-foreground)]">Vol</span>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer accent-[var(--brand-primary)]"
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

// --- Small presentational pieces (real data only) ---

const TrackRow: React.FC<{
  track: ApiTrack;
  active: boolean;
  onPlay: () => void;
  formatTime: (s: number) => string;
}> = ({ track, active, onPlay, formatTime }) => (
  <div
    onClick={onPlay}
    className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer ${
      active ? 'bg-purple-900/50' : 'bg-gray-800 hover:bg-gray-750'
    }`}
  >
    <Artwork src={track.artworkUrl} alt={track.title} className="w-12 h-12 rounded" />
    <div className="flex-1 min-w-0">
      <p className="font-medium text-white truncate">{track.title}</p>
      <p className="text-sm text-gray-400 truncate">{track.artistName}</p>
    </div>
    <span className="text-sm text-gray-500">{formatTime(track.durationSec)}</span>
  </div>
);

/** Artwork image with an honest placeholder when the catalog has no artwork. */
const Artwork: React.FC<{ src: string | null; alt: string; className?: string }> = ({
  src,
  alt,
  className,
}) =>
  src ? (
    <img src={src} alt={alt} className={`${className ?? ''} object-cover`} />
  ) : (
    <div
      className={`${className ?? ''} bg-gray-700 flex items-center justify-center text-gray-500 text-xs`}
      aria-label={alt}
    >
      No artwork
    </div>
  );

export default MusicPage;
