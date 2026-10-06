// ============================================================================
// QuantTube - Shorts (Vertical Short-Form Video Feed)
// Full-screen swipe navigation with like, comment, share, sound info
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { SAMPLE_SHORTS, type SampleShort } from '../data/sample-shorts';

// Local alias kept so the rest of the page reads unchanged.
type ShortVideo = SampleShort;

interface Comment {
  id: string;
  author: string;
  avatar: string;
  text: string;
  likeCount: number;
  createdAt: string;
  isLiked: boolean;
}

interface ShortsPageState {
  shorts: ShortVideo[];
  currentIndex: number;
  likedSet: Set<string>;
  commentDrawerOpen: boolean;
  comments: Comment[];
  creating: boolean;
  loading: boolean;
  error: string | null;
  animatingLike: string | null;
  isMuted: boolean;
  isPlaying: boolean;
  shareMenuOpen: boolean;
  commentsLoading: boolean;
}

const MOCK_COMMENTS: Comment[] = [
  {
    id: 'c1',
    author: 'UserOne',
    avatar: '/avatars/u1.jpg',
    text: 'This is incredible! How do you even do that?',
    likeCount: 234,
    createdAt: '2024-01-14T12:00:00Z',
    isLiked: false,
  },
  {
    id: 'c2',
    author: 'CoolDude42',
    avatar: '/avatars/u2.jpg',
    text: 'First time seeing something this cool today',
    likeCount: 89,
    createdAt: '2024-01-14T12:30:00Z',
    isLiked: true,
  },
  {
    id: 'c3',
    author: 'ReactFan',
    avatar: '/avatars/u3.jpg',
    text: 'Subscribed immediately after watching this',
    likeCount: 567,
    createdAt: '2024-01-14T13:00:00Z',
    isLiked: false,
  },
  {
    id: 'c4',
    author: 'ViewerX',
    avatar: '/avatars/u4.jpg',
    text: 'Please make a longer version of this!!',
    likeCount: 1200,
    createdAt: '2024-01-14T14:00:00Z',
    isLiked: false,
  },
  {
    id: 'c5',
    author: 'MusicLover',
    avatar: '/avatars/u5.jpg',
    text: 'The sound choice is perfect',
    likeCount: 45,
    createdAt: '2024-01-14T15:00:00Z',
    isLiked: true,
  },
];

const formatCount = (count: number): string => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

const ShortsPage: React.FC = () => {
  const [state, setState] = useState<ShortsPageState>({
    shorts: [],
    currentIndex: 0,
    likedSet: new Set(),
    commentDrawerOpen: false,
    comments: [],
    creating: false,
    loading: true,
    error: null,
    animatingLike: null,
    // P0-3: start muted so autoplay is not blocked by the browser; the user
    // unmutes explicitly via the top-bar toggle.
    isMuted: true,
    isPlaying: true,
    shareMenuOpen: false,
    commentsLoading: false,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);
  const touchStartY = useRef<number>(0);
  const touchEndY = useRef<number>(0);

  // Keep the real <video> element in sync with play/pause + short changes.
  useEffect(() => {
    setVideoError(false);
    const el = videoElRef.current;
    if (!el) return;
    if (state.isPlaying) {
      el.play().catch(() => {
        /* autoplay blocked — user taps to play */
      });
    } else {
      el.pause();
    }
  }, [state.isPlaying, state.currentIndex]);

  useEffect(() => {
    const loadShorts = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        await new Promise((resolve) => setTimeout(resolve, 800));
        // P0-3: real sample shorts with playable video URLs (no more dead
        // /videos/shortN.mp4 paths). Labeled SAMPLE in the UI — not real uploads.
        setState((prev) => ({ ...prev, shorts: SAMPLE_SHORTS, loading: false }));
      } catch (err) {
        setState((prev) => ({ ...prev, error: 'Failed to load shorts', loading: false }));
      }
    };
    loadShorts();
  }, []);

  const navigateToShort = useCallback((direction: 'up' | 'down') => {
    setState((prev) => {
      const newIndex =
        direction === 'up'
          ? Math.min(prev.currentIndex + 1, prev.shorts.length - 1)
          : Math.max(prev.currentIndex - 1, 0);
      return { ...prev, currentIndex: newIndex, commentDrawerOpen: false, shareMenuOpen: false };
    });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      touchEndY.current = e.changedTouches[0].clientY;
      const diff = touchStartY.current - touchEndY.current;
      if (Math.abs(diff) > 50) {
        navigateToShort(diff > 0 ? 'up' : 'down');
      }
    },
    [navigateToShort],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') navigateToShort('down');
      if (e.key === 'ArrowDown') navigateToShort('up');
    },
    [navigateToShort],
  );

  const toggleLike = useCallback((shortId: string) => {
    setState((prev) => {
      const newLiked = new Set(prev.likedSet);
      if (newLiked.has(shortId)) {
        newLiked.delete(shortId);
      } else {
        newLiked.add(shortId);
      }
      return { ...prev, likedSet: newLiked, animatingLike: shortId };
    });
    setTimeout(() => {
      setState((prev) => ({ ...prev, animatingLike: null }));
    }, 600);
  }, []);

  const toggleCommentDrawer = useCallback(() => {
    setState((prev) => {
      if (!prev.commentDrawerOpen) {
        return { ...prev, commentDrawerOpen: true, commentsLoading: true, shareMenuOpen: false };
      }
      return { ...prev, commentDrawerOpen: false };
    });
    setTimeout(() => {
      setState((prev) => ({ ...prev, comments: MOCK_COMMENTS, commentsLoading: false }));
    }, 500);
  }, []);

  const toggleSubscribe = useCallback((channelId: string) => {
    setState((prev) => ({
      ...prev,
      shorts: prev.shorts.map((s) =>
        s.channelId === channelId ? { ...s, isSubscribed: !s.isSubscribed } : s,
      ),
    }));
  }, []);

  const toggleMute = useCallback(() => {
    setState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const togglePlay = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const openShareMenu = useCallback(() => {
    setState((prev) => ({ ...prev, shareMenuOpen: !prev.shareMenuOpen }));
  }, []);

  const startCreating = useCallback(() => {
    setState((prev) => ({ ...prev, creating: true }));
  }, []);

  const cancelCreating = useCallback(() => {
    setState((prev) => ({ ...prev, creating: false }));
  }, []);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--quant-background)]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--quant-foreground)] text-sm">Loading shorts...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--quant-background)]">
        <div className="text-center space-y-4">
          <div className="text-[var(--quant-destructive)] text-4xl">!</div>
          <p className="text-[var(--quant-foreground)] text-lg">{state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-[var(--brand-primary)] text-white rounded-full hover:bg-[var(--brand-primary-hover)] transition-colors min-h-[44px]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (state.shorts.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--quant-background)]">
        <div className="text-center space-y-4">
          <div className="text-6xl">🎬</div>
          <p className="text-[var(--quant-foreground)] text-xl font-semibold">
            No Shorts Available
          </p>
          <p className="text-[var(--quant-muted-foreground)] text-sm">
            Be the first to create a short!
          </p>
          <button
            onClick={startCreating}
            className="px-6 py-2 bg-[var(--brand-primary)] text-white rounded-full hover:bg-[var(--brand-primary-hover)] transition-colors min-h-[44px]"
          >
            Create Short
          </button>
        </div>
      </div>
    );
  }

  const currentShort = state.shorts[state.currentIndex];
  const isLiked = state.likedSet.has(currentShort.id);

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-full bg-black overflow-hidden select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Video Background — P0-3: a REAL <video> element. The old build rendered
          only a thumbnail <img> pointing at a 404, so shorts were a black screen. */}
      <div className="absolute inset-0 flex items-center justify-center" onClick={togglePlay}>
        <div className="relative w-full h-full bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
          {!videoError ? (
            <video
              key={currentShort.id}
              ref={videoElRef}
              src={currentShort.videoUrl}
              poster={currentShort.thumbnailUrl}
              className="w-full h-full object-cover"
              autoPlay
              muted={state.isMuted}
              loop
              playsInline
              preload="auto"
              aria-label={currentShort.title}
              onError={() => setVideoError(true)}
            />
          ) : (
            <>
              <img
                src={currentShort.thumbnailUrl}
                alt={currentShort.title}
                className="w-full h-full object-cover opacity-90"
              />
              <div className="absolute inset-x-0 bottom-24 flex justify-center">
                <span className="text-white/80 text-xs bg-black/60 px-3 py-1 rounded-full">
                  Video failed to load — showing thumbnail
                </span>
              </div>
            </>
          )}
          {!state.isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 bg-black/50 rounded-full flex items-center justify-center">
                <span className="text-white text-3xl ml-1">▶</span>
              </div>
            </div>
          )}
          {state.animatingLike === currentShort.id && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-red-500 text-7xl animate-ping">♥</span>
            </div>
          )}
        </div>
      </div>

      {/* Top Controls */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/60 to-transparent">
        <h1 className="text-white font-bold text-lg">Shorts</h1>
        <div className="flex items-center space-x-3">
          <button onClick={toggleMute} className="text-white p-2 rounded-full hover:bg-white/10">
            {state.isMuted ? '🔇' : '🔊'}
          </button>
          <button className="text-white p-2 rounded-full hover:bg-white/10">⋮</button>
        </div>
      </div>

      {/* Navigation Buttons — P0-3: moved to the LEFT edge. They used to sit at
          right-0 top-1/2, directly on top of the action rail on mobile. */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col space-y-2 z-10">
        <button
          onClick={() => navigateToShort('down')}
          disabled={state.currentIndex === 0}
          aria-label="Previous short"
          className="w-10 h-10 bg-black/40 backdrop-blur rounded-full flex items-center justify-center text-white disabled:opacity-30 hover:bg-black/60 transition-colors"
        >
          ▲
        </button>
        <button
          onClick={() => navigateToShort('up')}
          disabled={state.currentIndex === state.shorts.length - 1}
          aria-label="Next short"
          className="w-10 h-10 bg-black/40 backdrop-blur rounded-full flex items-center justify-center text-white disabled:opacity-30 hover:bg-black/60 transition-colors"
        >
          ▼
        </button>
      </div>

      {/* Right Side Actions — P0-3: pinned right edge above the bottom info
          panel; no longer colliding with the nav buttons. */}
      <div className="absolute right-3 bottom-44 flex flex-col items-center space-y-5 z-10">
        {/* Like */}
        <button onClick={() => toggleLike(currentShort.id)} className="flex flex-col items-center">
          <motion.div
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all min-h-[44px] min-w-[44px] ${isLiked ? 'bg-[var(--brand-primary)] scale-110' : 'bg-white/20 hover:bg-white/30'}`}
            whileTap={{ scale: 0.9, transition: { type: 'spring', ...spring.stiff } }}
          >
            <span className="text-white text-xl">{isLiked ? '\u2665' : '\u2661'}</span>
          </motion.div>
          <span className="text-white text-xs mt-1">
            {formatCount(currentShort.likeCount + (isLiked ? 1 : 0))}
          </span>
        </button>

        {/* Comment */}
        <button onClick={toggleCommentDrawer} className="flex flex-col items-center">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
            <span className="text-white text-xl">💬</span>
          </div>
          <span className="text-white text-xs mt-1">{formatCount(currentShort.commentCount)}</span>
        </button>

        {/* Share */}
        <button onClick={openShareMenu} className="flex flex-col items-center">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
            <span className="text-white text-xl">↗</span>
          </div>
          <span className="text-white text-xs mt-1">{formatCount(currentShort.shareCount)}</span>
        </button>

        {/* Sound */}
        <button className="flex flex-col items-center">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors animate-spin-slow">
            <span className="text-white text-lg">♫</span>
          </div>
        </button>
      </div>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-16 p-4 z-10 bg-gradient-to-t from-black/80 to-transparent">
        {/* Channel Info */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gray-600 overflow-hidden">
            <img
              src={currentShort.channelAvatar}
              alt={currentShort.channelName}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-white font-semibold text-sm">@{currentShort.channelName}</span>
          <button
            onClick={() => toggleSubscribe(currentShort.channelId)}
            className={`px-4 py-1 rounded-full text-xs font-semibold transition-all min-h-[44px] ${
              currentShort.isSubscribed
                ? 'bg-white/20 text-white border border-white/30'
                : 'bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)]'
            }`}
          >
            {currentShort.isSubscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>

        {/* Description */}
        <p className="text-white text-sm mb-2 line-clamp-2">{currentShort.description}</p>

        {/* Sound Bar */}
        <div className="flex items-center space-x-2 bg-white/10 rounded-full px-3 py-1.5">
          <span className="text-white text-xs">♫</span>
          <marquee className="text-white text-xs flex-1">
            {currentShort.soundName} - {currentShort.soundArtist}
          </marquee>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-20">
        <motion.div
          className="h-full bg-[var(--brand-primary)]"
          animate={{ width: `${((state.currentIndex + 1) / state.shorts.length) * 100}%` }}
          transition={{ type: 'spring', ...spring.snappy }}
        />
      </div>

      {/* Comment Drawer */}
      {state.commentDrawerOpen && (
        <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gray-900 rounded-t-2xl z-30 flex flex-col animate-slide-up">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 className="text-white font-semibold">
              Comments ({formatCount(currentShort.commentCount)})
            </h3>
            <button
              onClick={toggleCommentDrawer}
              className="text-white text-xl hover:text-gray-300"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {state.commentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              state.comments.map((comment) => (
                <div key={comment.id} className="flex space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gray-600 flex-shrink-0 overflow-hidden">
                    <img
                      src={comment.avatar}
                      alt={comment.author}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-white text-sm font-semibold">{comment.author}</span>
                      <span className="text-gray-400 text-xs">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm mt-1">{comment.text}</p>
                    <button
                      className={`text-xs mt-1 ${comment.isLiked ? 'text-red-400' : 'text-gray-500'}`}
                    >
                      ♥ {comment.likeCount}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-700">
            <input
              type="text"
              placeholder="Add a comment..."
              className="w-full bg-gray-800 text-white rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
          </div>
        </div>
      )}

      {/* Share Menu */}
      {state.shareMenuOpen && (
        <div className="absolute bottom-20 right-4 bg-gray-800 rounded-xl p-3 z-30 shadow-xl space-y-2 min-w-[160px]">
          <button className="w-full text-left text-white text-sm px-3 py-2 hover:bg-gray-700 rounded-lg">
            Copy Link
          </button>
          <button className="w-full text-left text-white text-sm px-3 py-2 hover:bg-gray-700 rounded-lg">
            Share to Chat
          </button>
          <button className="w-full text-left text-white text-sm px-3 py-2 hover:bg-gray-700 rounded-lg">
            Post to Feed
          </button>
          <button className="w-full text-left text-white text-sm px-3 py-2 hover:bg-gray-700 rounded-lg">
            Embed
          </button>
          <button className="w-full text-left text-white text-sm px-3 py-2 hover:bg-gray-700 rounded-lg">
            Report
          </button>
        </div>
      )}

      {/* Create Short FAB — P0-3: parked top-left under the header. It used to sit
          at bottom-20 left-4, overlapping the channel avatar + caption. */}
      <motion.button
        onClick={startCreating}
        aria-label="Create short"
        className="absolute left-4 top-24 w-14 h-14 bg-[var(--brand-primary)] rounded-full flex items-center justify-center shadow-lg z-10 hover:bg-[var(--brand-primary-hover)] transition-colors min-h-[44px] min-w-[44px]"
        whileHover={{ scale: 1.1, transition: { type: 'spring', ...spring.bouncy } }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="text-white text-2xl">+</span>
      </motion.button>

      {/* Create Short Modal */}
      {state.creating && (
        <div className="absolute inset-0 bg-black/90 z-40 flex items-center justify-center">
          <div className="bg-gray-900 rounded-2xl p-6 w-80 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Create Short</h3>
              <button onClick={cancelCreating} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>
            <div className="border-2 border-dashed border-gray-600 rounded-xl h-48 flex items-center justify-center">
              <div className="text-center">
                <span className="text-4xl">📱</span>
                <p className="text-gray-400 text-sm mt-2">Record or upload video</p>
                <p className="text-gray-500 text-xs mt-1">Up to 60 seconds</p>
              </div>
            </div>
            <input
              type="text"
              placeholder="Add a description..."
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
            <div className="flex items-center space-x-2">
              <button className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600">
                🎵 Add Sound
              </button>
              <button className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600">
                ✨ Effects
              </button>
            </div>
            <button className="w-full py-3 bg-[var(--brand-primary)] text-white rounded-lg font-semibold hover:bg-[var(--brand-primary-hover)] transition-colors min-h-[44px]">
              Upload Short
            </button>
          </div>
        </div>
      )}

      {/* Short Counter + Sample badge (P0-2 honesty: never pass samples off as real) */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        <span className="text-white/60 text-xs font-medium bg-black/40 px-3 py-1 rounded-full">
          {state.currentIndex + 1} / {state.shorts.length}
        </span>
        {currentShort.isSample && (
          <span className="text-[10px] font-bold bg-amber-500/90 text-black px-2 py-1 rounded-full">
            SAMPLE
          </span>
        )}
      </div>
    </div>
  );
};

export default ShortsPage;
