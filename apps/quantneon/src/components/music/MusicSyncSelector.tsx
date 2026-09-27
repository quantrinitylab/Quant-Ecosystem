import React, { useState, useRef } from 'react';

export interface MusicTrack {
  trackId: string;
  title: string;
  artist: string;
  category: 'Trending' | 'Pop' | 'Electronic' | 'Cinematic' | 'Original Audio';
  duration: string; // e.g. "0:30"
  durationSeconds: number; // e.g. 30
  audioUrl: string;
  coverUrl: string;
}

export interface MusicSyncSelectorProps {
  tracks?: MusicTrack[];
  onSelectSound: (selection: {
    trackId: string;
    title: string;
    artist: string;
    audioUrl: string;
    startOffset: number; // seconds
    duration: number; // seconds
  }) => void;
  onClose?: () => void;
}

export const DEFAULT_TRACKS: MusicTrack[] = [
  {
    trackId: 'track-1',
    title: 'Neon Nights',
    artist: 'CyberPulse',
    category: 'Trending',
    duration: '0:30',
    durationSeconds: 30,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150',
  },
  {
    trackId: 'track-2',
    title: 'Synthwave Skyline',
    artist: 'RetroRunner',
    category: 'Electronic',
    duration: '0:45',
    durationSeconds: 45,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150',
  },
  {
    trackId: 'track-3',
    title: 'Cinematic Epic Trailer',
    artist: 'OrchestraX',
    category: 'Cinematic',
    duration: '0:30',
    durationSeconds: 30,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=150',
  },
  {
    trackId: 'track-4',
    title: 'Bubblegum Pop Hit',
    artist: 'Starlight',
    category: 'Pop',
    duration: '0:30',
    durationSeconds: 30,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=150',
  },
  {
    trackId: 'track-5',
    title: 'User Original Vocal',
    artist: 'You',
    category: 'Original Audio',
    duration: '0:15',
    durationSeconds: 15,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=150',
  },
];

export const CATEGORIES = ['Trending', 'Pop', 'Electronic', 'Cinematic', 'Original Audio'] as const;

export function filterTracksByCategory(tracks: MusicTrack[], category: string): MusicTrack[] {
  return tracks.filter((t) => t.category === category);
}

export function calculateTrimmedDuration(durationSeconds: number, startOffset: number): number {
  return Math.min(15, durationSeconds - startOffset);
}

export const MusicSyncSelector: React.FC<MusicSyncSelectorProps> = ({
  tracks = DEFAULT_TRACKS,
  onSelectSound,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Trending');
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [startOffset, setStartOffset] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredTracks = filterTracksByCategory(tracks, selectedCategory);

  const handlePreviewToggle = (track: MusicTrack) => {
    if (selectedTrack?.trackId === track.trackId && isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(track.audioUrl);
      audioRef.current = audio;
      audio.currentTime = startOffset;
      audio.play().catch(() => {});
      audio.onended = () => setIsPlaying(false);
      setSelectedTrack(track);
      setIsPlaying(true);
    }
  };

  const handleTrackSelect = (track: MusicTrack) => {
    setSelectedTrack(track);
    setStartOffset(0);
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedTrack) return;
    onSelectSound({
      trackId: selectedTrack.trackId,
      title: selectedTrack.title,
      artist: selectedTrack.artist,
      audioUrl: selectedTrack.audioUrl,
      startOffset,
      duration: calculateTrimmedDuration(selectedTrack.durationSeconds, startOffset),
    });
  };

  return (
    <div className="music-sync-selector bg-slate-900 text-white p-4 rounded-xl max-w-md w-full shadow-2xl border border-slate-700">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">Select Sound & Sync</h2>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">
            ✕
          </button>
        )}
      </div>

      <div className="flex space-x-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-pink-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
        {filteredTracks.map((track) => {
          const isSelected = selectedTrack?.trackId === track.trackId;
          const isTrackPlaying = isSelected && isPlaying;
          return (
            <div
              key={track.trackId}
              onClick={() => handleTrackSelect(track)}
              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-slate-800 border border-pink-500'
                  : 'bg-slate-800/50 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center space-x-3">
                <img
                  src={track.coverUrl}
                  alt={track.title}
                  className="w-12 h-12 rounded-md object-cover"
                />
                <div>
                  <h4 className="font-semibold text-sm">{track.title}</h4>
                  <p className="text-xs text-slate-400">{track.artist}</p>
                  <span className="text-[10px] text-pink-400 bg-pink-950/50 px-1.5 py-0.5 rounded mt-1 inline-block">
                    {track.duration}
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreviewToggle(track);
                }}
                className="w-9 h-9 rounded-full bg-pink-600 flex items-center justify-center hover:bg-pink-500 transition-colors"
                aria-label={isTrackPlaying ? 'Pause preview' : 'Play preview'}
              >
                {isTrackPlaying ? '⏸' : '▶'}
              </button>
            </div>
          );
        })}
      </div>

      {selectedTrack && (
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-slate-300 font-medium">Trim Audio Start Offset</span>
            <span className="text-xs text-pink-400">
              0:{startOffset < 10 ? `0${startOffset}` : startOffset} / 0:45
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.min(45, selectedTrack.durationSeconds - 5)}
            step={1}
            value={startOffset}
            onChange={(e) => setStartOffset(Number(e.target.value))}
            className="w-full accent-pink-600 bg-slate-700 h-1.5 rounded-lg cursor-pointer"
          />
          <div className="mt-4">
            <button
              onClick={handleConfirm}
              className="w-full py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold rounded-lg shadow-md hover:opacity-90 transition-opacity text-sm"
            >
              Use this sound ({selectedTrack.title})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
