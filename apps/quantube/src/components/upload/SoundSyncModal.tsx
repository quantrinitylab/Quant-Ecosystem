// ============================================================================
// QuanTube - Shortzz & Shortie Music Sync & Audio Dubbing Engine
// Component: SoundSyncModal.tsx
// Features: Category picker, album card, waveform scrubber, start offset trim,
//           dual audio volume mixer (Video audio % vs Background track %),
//           and instant play/pause preview
// ============================================================================

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

export type SoundCategory =
  | 'Trending'
  | 'Pop'
  | 'Cinematic'
  | 'Gaming'
  | 'Ambient'
  | 'Original Audio';

export const SOUND_CATEGORIES: SoundCategory[] = [
  'Trending',
  'Pop',
  'Cinematic',
  'Gaming',
  'Ambient',
  'Original Audio',
];

export interface SoundTrack {
  id: string;
  soundId?: string; // compatibility alias
  title: string;
  artist: string;
  category: SoundCategory;
  duration: string; // e.g. "2:15"
  durationSeconds: number; // e.g. 135
  coverUrl: string;
  audioUrl: string;
  waveformData?: number[];
  bpm?: number;
  tags?: string[];
}

export interface VolumeRatio {
  videoAudioPercent: number; // 0 - 100
  backgroundTrackPercent: number; // 0 - 100
}

export interface AppliedSound {
  soundId: string;
  title: string;
  artist: string;
  startOffset: number; // in seconds (0 - 60)
  volumeRatio: VolumeRatio;
}

export interface SoundSyncModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onApplySound: (sound: AppliedSound) => void;
  initialSound?: Partial<AppliedSound>;
  tracks?: SoundTrack[];
  videoDurationSeconds?: number;
}

// ----------------------------------------------------------------------------
// Pure helper functions (exported for Vitest testing & modular reuse)
// ----------------------------------------------------------------------------

export function filterTracksByCategory(
  tracks: SoundTrack[],
  category: SoundCategory | 'All',
): SoundTrack[] {
  if (category === 'All') return tracks;
  return tracks.filter((t) => t.category === category);
}

export function calculateMixingRatio(
  videoVolumePercent: number,
  bgVolumePercent: number,
): {
  videoAudioPercent: number;
  backgroundTrackPercent: number;
  normalizedVideo: number;
  normalizedBg: number;
  ratio: number;
} {
  const videoAudioPercent = Math.max(0, Math.min(100, Math.round(videoVolumePercent)));
  const backgroundTrackPercent = Math.max(0, Math.min(100, Math.round(bgVolumePercent)));
  const normalizedVideo = videoAudioPercent / 100;
  const normalizedBg = backgroundTrackPercent / 100;
  const ratio =
    videoAudioPercent === 0 ? 999 : Number((backgroundTrackPercent / videoAudioPercent).toFixed(3));

  return {
    videoAudioPercent,
    backgroundTrackPercent,
    normalizedVideo,
    normalizedBg,
    ratio,
  };
}

export function clampTrimOffset(
  seconds: number,
  maxTrackDuration: number = 60,
  maxWindowSeconds: number = 60,
): number {
  if (isNaN(seconds) || seconds < 0) return 0;
  const upperCap = Math.max(0, Math.min(maxWindowSeconds, maxTrackDuration));
  return Math.max(0, Math.min(Math.round(seconds), upperCap));
}

export function formatTimeOffset(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function generateWaveform(seed: string | number, count: number = 42): number[] {
  const str = String(seed);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const pseudo = Math.abs(Math.sin((hash + i * 37) * 0.1));
    const height = Math.floor(20 + pseudo * 75); // 20% to 95%
    result.push(height);
  }
  return result;
}

// ----------------------------------------------------------------------------
// Curated Default Audio Catalog for Shortzz & Shortie
// ----------------------------------------------------------------------------

export const DEFAULT_SOUND_TRACKS: SoundTrack[] = [
  {
    id: 'sound-trending-01',
    title: 'Cyber Neon Pulse',
    artist: 'Kavinsky Wave',
    category: 'Trending',
    duration: '2:15',
    durationSeconds: 135,
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    bpm: 128,
    tags: ['viral', 'synth', 'bass'],
  },
  {
    id: 'sound-trending-02',
    title: 'Midnight Euphoria',
    artist: 'MetroQuan & Nova',
    category: 'Trending',
    duration: '1:50',
    durationSeconds: 110,
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    bpm: 132,
    tags: ['electronic', 'hype'],
  },
  {
    id: 'sound-pop-01',
    title: 'Electric Summer Sunset',
    artist: 'Luna Chloe',
    category: 'Pop',
    duration: '1:45',
    durationSeconds: 105,
    coverUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    bpm: 120,
    tags: ['upbeat', 'dance', 'bright'],
  },
  {
    id: 'sound-pop-02',
    title: 'Sugar Glaze',
    artist: 'Starlight Vibe',
    category: 'Pop',
    duration: '2:00',
    durationSeconds: 120,
    coverUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    bpm: 116,
    tags: ['catchy', 'vocals'],
  },
  {
    id: 'sound-cinematic-01',
    title: 'Interstellar Odyssey',
    artist: 'Apex Symphony',
    category: 'Cinematic',
    duration: '3:10',
    durationSeconds: 190,
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    bpm: 90,
    tags: ['epic', 'trailer', 'strings'],
  },
  {
    id: 'sound-cinematic-02',
    title: 'Rising Champion',
    artist: 'Valhalla Brass',
    category: 'Cinematic',
    duration: '2:30',
    durationSeconds: 150,
    coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
    bpm: 100,
    tags: ['dramatic', 'orchestral'],
  },
  {
    id: 'sound-gaming-01',
    title: 'Speedrun 16-Bit Rush',
    artist: 'PixelStorm & 8BitGod',
    category: 'Gaming',
    duration: '1:30',
    durationSeconds: 90,
    coverUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
    bpm: 150,
    tags: ['chiptune', 'fast', 'arcade'],
  },
  {
    id: 'sound-gaming-02',
    title: 'Boss Battle Arena',
    artist: 'GlitchCore',
    category: 'Gaming',
    duration: '2:05',
    durationSeconds: 125,
    coverUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    bpm: 140,
    tags: ['intense', 'cyber'],
  },
  {
    id: 'sound-ambient-01',
    title: 'Rainy Loft Reflection',
    artist: 'Zenith Soundscapes',
    category: 'Ambient',
    duration: '2:50',
    durationSeconds: 170,
    coverUrl: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
    bpm: 72,
    tags: ['lofi', 'peaceful', 'rain'],
  },
  {
    id: 'sound-ambient-02',
    title: 'Crystal Horizons',
    artist: 'Aura Bloom',
    category: 'Ambient',
    duration: '3:00',
    durationSeconds: 180,
    coverUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
    bpm: 65,
    tags: ['meditation', 'pads'],
  },
  {
    id: 'sound-original-01',
    title: 'QuanTube Studio Voice & Mic',
    artist: 'Original Creator',
    category: 'Original Audio',
    duration: '1:00',
    durationSeconds: 60,
    coverUrl: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
    bpm: 110,
    tags: ['voiceover', 'raw', 'dubbing'],
  },
  {
    id: 'sound-original-02',
    title: 'Acoustic Guitar Direct In',
    artist: 'You (Creator Studio)',
    category: 'Original Audio',
    duration: '1:15',
    durationSeconds: 75,
    coverUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=200',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
    bpm: 95,
    tags: ['live', 'instruments'],
  },
];

// ----------------------------------------------------------------------------
// SoundSyncModal Component
// ----------------------------------------------------------------------------

export const SoundSyncModal: React.FC<SoundSyncModalProps> = ({
  isOpen = true,
  onClose,
  onApplySound,
  initialSound,
  tracks = DEFAULT_SOUND_TRACKS,
  videoDurationSeconds = 60,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<SoundCategory>('Trending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTrack, setSelectedTrack] = useState<SoundTrack>(() => {
    if (initialSound?.soundId) {
      const found = tracks.find(
        (t) => t.id === initialSound.soundId || t.soundId === initialSound.soundId,
      );
      if (found) return found;
    }
    return tracks[0] || DEFAULT_SOUND_TRACKS[0];
  });

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [startOffset, setStartOffset] = useState<number>(() => {
    return initialSound?.startOffset ? clampTrimOffset(initialSound.startOffset, 60, 60) : 0;
  });

  // Volume Mixer State: Video audio % vs Background track %
  const [videoAudioPercent, setVideoAudioPercent] = useState<number>(() => {
    return initialSound?.volumeRatio?.videoAudioPercent ?? 80;
  });
  const [backgroundTrackPercent, setBackgroundTrackPercent] = useState<number>(() => {
    return initialSound?.volumeRatio?.backgroundTrackPercent ?? 40;
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    let list = filterTracksByCategory(tracks, selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [tracks, selectedCategory, searchQuery]);

  // Waveform bars for selected track
  const waveformBars = useMemo(() => {
    if (!selectedTrack) return [];
    if (selectedTrack.waveformData && selectedTrack.waveformData.length > 0) {
      return selectedTrack.waveformData;
    }
    return generateWaveform(selectedTrack.id || selectedTrack.title, 48);
  }, [selectedTrack]);

  // Audio Play/Pause Preview
  const handleTogglePreview = useCallback(
    (track: SoundTrack, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();

      const isSameTrack = selectedTrack?.id === track.id;

      if (isSameTrack && isPlaying) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
        return;
      }

      if (audioRef.current) {
        audioRef.current.pause();
      }

      setSelectedTrack(track);

      // Create or update audio element safely (guarded against environments without Audio)
      if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
        const audio = new Audio(track.audioUrl);
        audioRef.current = audio;
        const clampedOffset = clampTrimOffset(startOffset, track.durationSeconds, 60);
        audio.currentTime = clampedOffset;
        audio.volume = Math.max(0, Math.min(1, backgroundTrackPercent / 100));

        audio.play().catch(() => {
          // Auto-play restrictions or test environment guard
        });

        audio.onended = () => {
          setIsPlaying(false);
        };

        setIsPlaying(true);
      } else {
        setIsPlaying(true);
      }
    },
    [selectedTrack, isPlaying, startOffset, backgroundTrackPercent],
  );

  // Track selection
  const handleSelectTrack = useCallback(
    (track: SoundTrack) => {
      setSelectedTrack(track);
      // Reset or clamp offset for new track
      setStartOffset((prev) => clampTrimOffset(prev, track.durationSeconds, 60));
      if (isPlaying && audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    },
    [isPlaying],
  );

  // Offset scrubber change
  const handleOffsetChange = useCallback(
    (newOffset: number) => {
      const maxOffset = selectedTrack
        ? Math.min(60, Math.max(0, selectedTrack.durationSeconds - 5))
        : 60;
      const clamped = clampTrimOffset(newOffset, maxOffset, 60);
      setStartOffset(clamped);

      if (audioRef.current && isPlaying) {
        audioRef.current.currentTime = clamped;
      }
    },
    [selectedTrack, isPlaying],
  );

  // Apply Sound action returning { soundId, title, artist, startOffset, volumeRatio }
  const handleApply = useCallback(() => {
    if (!selectedTrack) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);

    const mix = calculateMixingRatio(videoAudioPercent, backgroundTrackPercent);

    onApplySound({
      soundId: selectedTrack.id,
      title: selectedTrack.title,
      artist: selectedTrack.artist,
      startOffset,
      volumeRatio: {
        videoAudioPercent: mix.videoAudioPercent,
        backgroundTrackPercent: mix.backgroundTrackPercent,
      },
    });
    onClose();
  }, [
    selectedTrack,
    startOffset,
    videoAudioPercent,
    backgroundTrackPercent,
    onApplySound,
    onClose,
  ]);

  if (!isOpen) return null;

  const maxOffsetAvailable = selectedTrack
    ? Math.min(60, Math.max(0, selectedTrack.durationSeconds - 5))
    : 60;

  // Calculate waveform highlight progress (0% - 100%)
  const offsetProgressPercent =
    maxOffsetAvailable > 0 ? (startOffset / maxOffsetAvailable) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sound-sync-modal-title"
    >
      <div className="relative flex flex-col w-full max-w-2xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl text-slate-100 overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 shadow-md">
              <span className="text-lg">🎵</span>
            </div>
            <div>
              <h2
                id="sound-sync-modal-title"
                className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2"
              >
                Music Sync & Audio Dubbing
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  Shortzz Studio
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Sync viral soundtracks, trim starting cues, and master audio levels
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body: Two column / stacked view */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Category Tabs & Search Bar */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div
                className="flex items-center space-x-1.5 overflow-x-auto pb-1 max-w-full no-scrollbar"
                role="tablist"
                aria-label="Sound Categories"
              >
                {SOUND_CATEGORIES.map((cat) => {
                  const isActive = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                        isActive
                          ? 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white shadow-md shadow-rose-900/30 font-semibold'
                          : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {/* Quick Search */}
              <div className="relative min-w-[160px] flex-1 sm:flex-initial">
                <input
                  type="text"
                  placeholder="Search tracks, artists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Sound Cards List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {filteredTracks.length === 0 ? (
                <div className="col-span-full py-8 text-center text-slate-400 text-xs">
                  No sounds found matching "{searchQuery}" in {selectedCategory}.
                </div>
              ) : (
                filteredTracks.map((track) => {
                  const isSelected = selectedTrack?.id === track.id;
                  const isTrackPlaying = isSelected && isPlaying;

                  return (
                    <div
                      key={track.id}
                      onClick={() => handleSelectTrack(track)}
                      className={`group relative flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all duration-150 border ${
                        isSelected
                          ? 'bg-rose-950/20 border-rose-500/80 shadow-md shadow-rose-950/40 ring-1 ring-rose-500/50'
                          : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        {/* Cover Image with Play Overlay */}
                        <div className="relative flex-shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-slate-800 shadow">
                          <img
                            src={track.coverUrl}
                            alt={track.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                          <button
                            type="button"
                            onClick={(e) => handleTogglePreview(track, e)}
                            aria-label={
                              isTrackPlaying
                                ? `Pause ${track.title}`
                                : `Play preview of ${track.title}`
                            }
                            className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                              isTrackPlaying
                                ? 'bg-black/40 opacity-100'
                                : 'bg-black/30 opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <span className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center text-[10px] text-white shadow">
                              {isTrackPlaying ? '⏸' : '▶'}
                            </span>
                          </button>
                        </div>

                        {/* Title and Artist */}
                        <div className="truncate">
                          <h4 className="text-xs font-semibold text-white truncate group-hover:text-rose-300 transition-colors">
                            {track.title}
                          </h4>
                          <p className="text-[11px] text-slate-400 truncate">{track.artist}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-mono px-1.5 py-px rounded bg-slate-900/80 text-slate-400">
                              {track.duration}
                            </span>
                            {track.bpm && (
                              <span className="text-[9px] text-rose-400 font-medium">
                                {track.bpm} BPM
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Play Preview Indicator Button */}
                      <button
                        type="button"
                        onClick={(e) => handleTogglePreview(track, e)}
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors ml-2 ${
                          isTrackPlaying
                            ? 'bg-rose-500 text-white shadow-lg shadow-rose-600/40 animate-pulse'
                            : isSelected
                              ? 'bg-rose-600/30 text-rose-300 hover:bg-rose-600 hover:text-white'
                              : 'bg-slate-700/60 text-slate-300 hover:bg-rose-600 hover:text-white'
                        }`}
                        aria-label={isTrackPlaying ? 'Pause sound preview' : 'Play sound preview'}
                      >
                        {isTrackPlaying ? '⏸' : '▶'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Audio Workbench: Waveform Scrubber & Start Offset Trim */}
          {selectedTrack && (
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-rose-400 text-sm">🎛️</span>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Waveform Scrubber & Start Cue
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Trim starting offset (0:00 - 1:00) to sync beats with video cuts
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400">Start Offset:</span>
                  <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 font-mono font-bold">
                    {formatTimeOffset(startOffset)}
                  </span>
                  <span className="text-slate-500">/ 1:00 max</span>
                </div>
              </div>

              {/* Waveform Scrubber Visualizer */}
              <div className="relative pt-2 pb-1">
                <div
                  className="flex items-end justify-between h-14 w-full px-2 py-1 bg-slate-900/90 rounded-lg border border-slate-800 overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
                    handleOffsetChange(Math.round(fraction * maxOffsetAvailable));
                  }}
                >
                  {waveformBars.map((heightPercent, idx) => {
                    const barFraction = idx / waveformBars.length;
                    const isActive = barFraction >= startOffset / Math.max(1, maxOffsetAvailable);
                    return (
                      <div
                        key={idx}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          isActive
                            ? 'bg-gradient-to-t from-rose-500 to-indigo-400 shadow-sm'
                            : 'bg-slate-700/60'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    );
                  })}
                </div>

                {/* Range Slider for Scrubbing Start Offset (0:00 - 1:00) */}
                <div className="mt-2.5">
                  <input
                    type="range"
                    min={0}
                    max={maxOffsetAvailable}
                    step={1}
                    value={startOffset}
                    onChange={(e) => handleOffsetChange(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                    aria-label="Start offset trim slider"
                  />
                  <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1 font-mono">
                    <span>0:00 (Track start)</span>
                    <span className="text-rose-400 font-semibold">
                      Playing from: {formatTimeOffset(startOffset)}
                    </span>
                    <span>{formatTimeOffset(maxOffsetAvailable)}</span>
                  </div>
                </div>
              </div>

              {/* Audio Volume Mixer: Video Audio % vs Background Track % */}
              <div className="pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🎚️</span> Audio Volume Mixer
                  </span>
                  <div className="text-[11px] text-slate-400">
                    Mix:{' '}
                    <span className="text-indigo-400 font-semibold">
                      {videoAudioPercent}% Video
                    </span>{' '}
                    /{' '}
                    <span className="text-rose-400 font-semibold">
                      {backgroundTrackPercent}% Music
                    </span>
                  </div>
                </div>

                {/* Dual Sliders: Video Original Audio vs Background Dubbing Track */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Video Audio Slider */}
                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                    <div className="flex justify-between items-center mb-1 text-xs">
                      <span className="text-slate-300 font-medium flex items-center gap-1">
                        📹 Video Original Audio
                      </span>
                      <span className="font-mono text-indigo-400 font-bold">
                        {videoAudioPercent}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={videoAudioPercent}
                      onChange={(e) => setVideoAudioPercent(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      aria-label="Video original audio volume percentage"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <button
                        type="button"
                        onClick={() => setVideoAudioPercent(0)}
                        className="hover:text-slate-300"
                      >
                        Mute (0%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoAudioPercent(100)}
                        className="hover:text-slate-300"
                      >
                        Max (100%)
                      </button>
                    </div>
                  </div>

                  {/* Background Music Dub Track Slider */}
                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                    <div className="flex justify-between items-center mb-1 text-xs">
                      <span className="text-slate-300 font-medium flex items-center gap-1">
                        🎵 Background Sound Track
                      </span>
                      <span className="font-mono text-rose-400 font-bold">
                        {backgroundTrackPercent}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={backgroundTrackPercent}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setBackgroundTrackPercent(val);
                        if (audioRef.current) {
                          audioRef.current.volume = Math.max(0, Math.min(1, val / 100));
                        }
                      }}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                      aria-label="Background music track volume percentage"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <button
                        type="button"
                        onClick={() => setBackgroundTrackPercent(0)}
                        className="hover:text-slate-300"
                      >
                        Mute (0%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setBackgroundTrackPercent(100)}
                        className="hover:text-slate-300"
                      >
                        Max (100%)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Mix Presets */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">
                    Presets:
                  </span>
                  {[
                    { label: 'Voice Focus', video: 90, music: 20 },
                    { label: 'Balanced', video: 60, music: 60 },
                    { label: 'Music Hype', video: 20, music: 90 },
                    { label: 'Music Only', video: 0, music: 100 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setVideoAudioPercent(preset.video);
                        setBackgroundTrackPercent(preset.music);
                        if (audioRef.current) {
                          audioRef.current.volume = Math.max(0, Math.min(1, preset.music / 100));
                        }
                      }}
                      className="px-2 py-0.5 rounded text-[10px] bg-slate-800/90 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      {preset.label} ({preset.video}/{preset.music})
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/80">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              Selected: <strong className="text-white">{selectedTrack.title}</strong> (
              {formatTimeOffset(startOffset)})
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-rose-950/50 transition-all active:scale-[0.98]"
            >
              Apply Sound
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default SoundSyncModal;
