// ============================================================================
// QuantTube - Shorts (Vertical Short-Form Video Feed)
// Full-screen swipe navigation with like, comment, share, sound info
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ShortVideo {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  title: string;
  channelName: string;
  channelAvatar: string;
  channelId: string;
  isSubscribed: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  soundName: string;
  soundArtist: string;
  soundId: string;
  description: string;
  tags: string[];
  createdAt: string;
  duration: number;
}

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

const MOCK_SHORTS: ShortVideo[] = [
  { id: 'sh1', videoUrl: '/videos/short1.mp4', thumbnailUrl: '/thumbs/short1.jpg', title: '60-second coding tutorial #react', channelName: 'CodeSnippets', channelAvatar: '/avatars/code.jpg', channelId: 'ch1', isSubscribed: false, likeCount: 45200, commentCount: 892, shareCount: 2340, soundName: 'Lo-fi Coding Beats', soundArtist: 'ChillHop', soundId: 'snd1', description: 'Learn React hooks in 60 seconds! #coding #react #tutorial', tags: ['coding', 'react', 'tutorial'], createdAt: '2024-01-14T10:00:00Z', duration: 58 },
  { id: 'sh2', videoUrl: '/videos/short2.mp4', thumbnailUrl: '/thumbs/short2.jpg', title: 'Insane basketball trick shot', channelName: 'TrickShots', channelAvatar: '/avatars/tricks.jpg', channelId: 'ch2', isSubscribed: true, likeCount: 128000, commentCount: 3400, shareCount: 15600, soundName: 'Original Sound', soundArtist: 'TrickShots', soundId: 'snd2', description: 'You wont believe this shot! #basketball #trickshot', tags: ['basketball', 'trickshot', 'sports'], createdAt: '2024-01-13T15:30:00Z', duration: 32 },
  { id: 'sh3', videoUrl: '/videos/short3.mp4', thumbnailUrl: '/thumbs/short3.jpg', title: 'Making the perfect latte art', channelName: 'CoffeeArtist', channelAvatar: '/avatars/coffee.jpg', channelId: 'ch3', isSubscribed: false, likeCount: 67300, commentCount: 1200, shareCount: 8900, soundName: 'Morning Vibes', soundArtist: 'LoFi Records', soundId: 'snd3', description: 'Satisfying latte art pour #coffee #art #satisfying', tags: ['coffee', 'art', 'satisfying'], createdAt: '2024-01-12T08:00:00Z', duration: 45 },
  { id: 'sh4', videoUrl: '/videos/short4.mp4', thumbnailUrl: '/thumbs/short4.jpg', title: 'Drone footage of Iceland glaciers', channelName: 'NatureViews', channelAvatar: '/avatars/nature.jpg', channelId: 'ch4', isSubscribed: true, likeCount: 234000, commentCount: 5600, shareCount: 42000, soundName: 'Epic Cinematic', soundArtist: 'SoundScapes', soundId: 'snd4', description: 'Iceland from above - breathtaking glaciers #travel #nature #iceland', tags: ['travel', 'nature', 'iceland', 'drone'], createdAt: '2024-01-11T12:00:00Z', duration: 55 },
  { id: 'sh5', videoUrl: '/videos/short5.mp4', thumbnailUrl: '/thumbs/short5.jpg', title: 'Dog learns to open door', channelName: 'PetLife', channelAvatar: '/avatars/pets.jpg', channelId: 'ch5', isSubscribed: false, likeCount: 890000, commentCount: 12000, shareCount: 67000, soundName: 'Funny Moments', soundArtist: 'Meme Sounds', soundId: 'snd5', description: 'My golden retriever figured out how to open the door! #dogs #funny #pets', tags: ['dogs', 'funny', 'pets'], createdAt: '2024-01-10T20:00:00Z', duration: 28 },
];

const MOCK_COMMENTS: Comment[] = [
  { id: 'c1', author: 'UserOne', avatar: '/avatars/u1.jpg', text: 'This is incredible! How do you even do that?', likeCount: 234, createdAt: '2024-01-14T12:00:00Z', isLiked: false },
  { id: 'c2', author: 'CoolDude42', avatar: '/avatars/u2.jpg', text: 'First time seeing something this cool today', likeCount: 89, createdAt: '2024-01-14T12:30:00Z', isLiked: true },
  { id: 'c3', author: 'ReactFan', avatar: '/avatars/u3.jpg', text: 'Subscribed immediately after watching this', likeCount: 567, createdAt: '2024-01-14T13:00:00Z', isLiked: false },
  { id: 'c4', author: 'ViewerX', avatar: '/avatars/u4.jpg', text: 'Please make a longer version of this!!', likeCount: 1200, createdAt: '2024-01-14T14:00:00Z', isLiked: false },
  { id: 'c5', author: 'MusicLover', avatar: '/avatars/u5.jpg', text: 'The sound choice is perfect', likeCount: 45, createdAt: '2024-01-14T15:00:00Z', isLiked: true },
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
    isMuted: false,
    isPlaying: true,
    shareMenuOpen: false,
    commentsLoading: false,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchEndY = useRef<number>(0);

  useEffect(() => {
    const loadShorts = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        await new Promise(resolve => setTimeout(resolve, 800));
        setState(prev => ({ ...prev, shorts: MOCK_SHORTS, loading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load shorts', loading: false }));
      }
    };
    loadShorts();
  }, []);

  const navigateToShort = useCallback((direction: 'up' | 'down') => {
    setState(prev => {
      const newIndex = direction === 'up'
        ? Math.min(prev.currentIndex + 1, prev.shorts.length - 1)
        : Math.max(prev.currentIndex - 1, 0);
      return { ...prev, currentIndex: newIndex, commentDrawerOpen: false, shareMenuOpen: false };
    });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    touchEndY.current = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY.current;
    if (Math.abs(diff) > 50) {
      navigateToShort(diff > 0 ? 'up' : 'down');
    }
  }, [navigateToShort]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') navigateToShort('down');
    if (e.key === 'ArrowDown') navigateToShort('up');
  }, [navigateToShort]);

  const toggleLike = useCallback((shortId: string) => {
    setState(prev => {
      const newLiked = new Set(prev.likedSet);
      if (newLiked.has(shortId)) {
        newLiked.delete(shortId);
      } else {
        newLiked.add(shortId);
      }
      return { ...prev, likedSet: newLiked, animatingLike: shortId };
    });
    setTimeout(() => {
      setState(prev => ({ ...prev, animatingLike: null }));
    }, 600);
  }, []);

  const toggleCommentDrawer = useCallback(() => {
    setState(prev => {
      if (!prev.commentDrawerOpen) {
        return { ...prev, commentDrawerOpen: true, commentsLoading: true, shareMenuOpen: false };
      }
      return { ...prev, commentDrawerOpen: false };
    });
    setTimeout(() => {
      setState(prev => ({ ...prev, comments: MOCK_COMMENTS, commentsLoading: false }));
    }, 500);
  }, []);

  const toggleSubscribe = useCallback((channelId: string) => {
    setState(prev => ({
      ...prev,
      shorts: prev.shorts.map(s =>
        s.channelId === channelId ? { ...s, isSubscribed: !s.isSubscribed } : s
      ),
    }));
  }, []);

  const toggleMute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const togglePlay = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const openShareMenu = useCallback(() => {
    setState(prev => ({ ...prev, shareMenuOpen: !prev.shareMenuOpen }));
  }, []);

  const startCreating = useCallback(() => {
    setState(prev => ({ ...prev, creating: true }));
  }, []);

  const cancelCreating = useCallback(() => {
    setState(prev => ({ ...prev, creating: false }));
  }, []);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-sm">Loading shorts...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-4xl">!</div>
          <p className="text-white text-lg">{state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (state.shorts.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-center space-y-4">
          <div className="text-6xl">🎬</div>
          <p className="text-white text-xl font-semibold">No Shorts Available</p>
          <p className="text-gray-400 text-sm">Be the first to create a short!</p>
          <button
            onClick={startCreating}
            className="px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
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
      {/* Video Background */}
      <div className="absolute inset-0 flex items-center justify-center" onClick={togglePlay}>
        <div className="relative w-full h-full bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
          <img
            src={currentShort.thumbnailUrl}
            alt={currentShort.title}
            className="w-full h-full object-cover opacity-90"
          />
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

      {/* Navigation Buttons */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col space-y-2 z-10 pr-2">
        <button
          onClick={() => navigateToShort('down')}
          disabled={state.currentIndex === 0}
          className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/30 transition-colors"
        >
          ▲
        </button>
        <button
          onClick={() => navigateToShort('up')}
          disabled={state.currentIndex === state.shorts.length - 1}
          className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/30 transition-colors"
        >
          ▼
        </button>
      </div>

      {/* Right Side Actions */}
      <div className="absolute right-4 bottom-32 flex flex-col items-center space-y-6 z-10">
        {/* Like */}
        <button onClick={() => toggleLike(currentShort.id)} className="flex flex-col items-center">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isLiked ? 'bg-red-500 scale-110' : 'bg-white/20 hover:bg-white/30'}`}>
            <span className="text-white text-xl">{isLiked ? '♥' : '♡'}</span>
          </div>
          <span className="text-white text-xs mt-1">{formatCount(currentShort.likeCount + (isLiked ? 1 : 0))}</span>
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
            <img src={currentShort.channelAvatar} alt={currentShort.channelName} className="w-full h-full object-cover" />
          </div>
          <span className="text-white font-semibold text-sm">@{currentShort.channelName}</span>
          <button
            onClick={() => toggleSubscribe(currentShort.channelId)}
            className={`px-4 py-1 rounded-full text-xs font-semibold transition-all ${
              currentShort.isSubscribed
                ? 'bg-white/20 text-white border border-white/30'
                : 'bg-red-600 text-white hover:bg-red-700'
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
        <div className="h-full bg-white transition-all duration-300" style={{ width: `${((state.currentIndex + 1) / state.shorts.length) * 100}%` }} />
      </div>

      {/* Comment Drawer */}
      {state.commentDrawerOpen && (
        <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gray-900 rounded-t-2xl z-30 flex flex-col animate-slide-up">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 className="text-white font-semibold">Comments ({formatCount(currentShort.commentCount)})</h3>
            <button onClick={toggleCommentDrawer} className="text-white text-xl hover:text-gray-300">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {state.commentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              state.comments.map(comment => (
                <div key={comment.id} className="flex space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gray-600 flex-shrink-0 overflow-hidden">
                    <img src={comment.avatar} alt={comment.author} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-white text-sm font-semibold">{comment.author}</span>
                      <span className="text-gray-400 text-xs">{new Date(comment.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-gray-300 text-sm mt-1">{comment.text}</p>
                    <button className={`text-xs mt-1 ${comment.isLiked ? 'text-red-400' : 'text-gray-500'}`}>
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
              className="w-full bg-gray-800 text-white rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      )}

      {/* Share Menu */}
      {state.shareMenuOpen && (
        <div className="absolute bottom-20 right-4 bg-gray-800 rounded-xl p-3 z-30 shadow-xl space-y-2 min-w-[160px]">
          <button className="w-full text-left text-white text-sm px-3 py-2 hover:bg-gray-700 rounded-lg">Copy Link</button>
          <button className="w-full text-left text-white text-sm px-3 py-2 hover:bg-gray-700 rounded-lg">Share to Chat</button>
          <button className="w-full text-left text-white text-sm px-3 py-2 hover:bg-gray-700 rounded-lg">Post to Feed</button>
          <button className="w-full text-left text-white text-sm px-3 py-2 hover:bg-gray-700 rounded-lg">Embed</button>
          <button className="w-full text-left text-white text-sm px-3 py-2 hover:bg-gray-700 rounded-lg">Report</button>
        </div>
      )}

      {/* Create Short FAB */}
      <button
        onClick={startCreating}
        className="absolute bottom-20 left-4 w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-lg z-10 hover:bg-red-700 transition-colors hover:scale-110"
      >
        <span className="text-white text-2xl">+</span>
      </button>

      {/* Create Short Modal */}
      {state.creating && (
        <div className="absolute inset-0 bg-black/90 z-40 flex items-center justify-center">
          <div className="bg-gray-900 rounded-2xl p-6 w-80 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Create Short</h3>
              <button onClick={cancelCreating} className="text-gray-400 hover:text-white">✕</button>
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
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex items-center space-x-2">
              <button className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600">
                🎵 Add Sound
              </button>
              <button className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600">
                ✨ Effects
              </button>
            </div>
            <button className="w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors">
              Upload Short
            </button>
          </div>
        </div>
      )}

      {/* Short Counter */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10">
        <span className="text-white/60 text-xs font-medium bg-black/40 px-3 py-1 rounded-full">
          {state.currentIndex + 1} / {state.shorts.length}
        </span>
      </div>
    </div>
  );
};

export default ShortsPage;
