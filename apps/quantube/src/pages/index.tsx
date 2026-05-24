// ============================================================================
// QuantTube - Home Page
// Video platform home with category tabs, video grid, infinite scroll, search
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Video {
  id: string;
  title: string;
  thumbnail: string;
  channelName: string;
  channelAvatar: string;
  channelId: string;
  views: number;
  uploadedAt: string;
  duration: number;
  isLive: boolean;
  isShort: boolean;
  category: string;
}

interface Category {
  id: string;
  label: string;
  icon: string;
}

interface HomePageState {
  videos: Video[];
  loading: boolean;
  error: string | null;
  activeCategory: string;
  searchQuery: string;
  searchResults: Video[];
  isSearching: boolean;
  page: number;
  hasMore: boolean;
  sidebarOpen: boolean;
}

const CATEGORIES: Category[] = [
  { id: 'all', label: 'All', icon: '🏠' },
  { id: 'trending', label: 'Trending', icon: '🔥' },
  { id: 'music', label: 'Music', icon: '🎵' },
  { id: 'gaming', label: 'Gaming', icon: '🎮' },
  { id: 'live', label: 'Live', icon: '🔴' },
  { id: 'shorts', label: 'Shorts', icon: '📱' },
  { id: 'news', label: 'News', icon: '📰' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'learning', label: 'Learning', icon: '📚' },
  { id: 'podcasts', label: 'Podcasts', icon: '🎙️' },
  { id: 'movies', label: 'Movies', icon: '🎬' },
  { id: 'fashion', label: 'Fashion', icon: '👗' },
];

function formatViewCount(views: number): string {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`;
  return `${views} views`;
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;
  return `${Math.floor(seconds / 31536000)} years ago`;
}

function generateMockVideos(category: string, page: number): Video[] {
  const titles = [
    'Building a Full Stack App in 10 Minutes', 'Epic Gaming Montage 2024',
    'Top 10 Travel Destinations', 'Live Coding Session: React Hooks',
    'Official Music Video - Summer Vibes', 'Breaking News: Tech Conference',
    'Workout Routine for Beginners', 'Cooking Italian Pasta from Scratch',
    'How to Start a Business in 2024', 'Machine Learning Explained Simply',
    'Best Budget Smartphones Review', 'Day in My Life as a Developer',
  ];
  const channels = ['TechMaster', 'GamePro', 'TravelWorld', 'CodeStream', 'MusicHub', 'NewsToday'];
  return Array.from({ length: 12 }, (_, i) => ({
    id: `vid-${page}-${i}-${category}`,
    title: titles[(i + page * 3) % titles.length],
    thumbnail: `https://picsum.photos/seed/${page}${i}/640/360`,
    channelName: channels[i % channels.length],
    channelAvatar: `https://picsum.photos/seed/ch${i}/64/64`,
    channelId: `channel-${i % channels.length}`,
    views: Math.floor(Math.random() * 5000000) + 1000,
    uploadedAt: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
    duration: Math.floor(Math.random() * 3600) + 30,
    isLive: category === 'live' || Math.random() < 0.05,
    isShort: category === 'shorts' || (Math.random() < 0.1 && category === 'all'),
    category: category === 'all' ? CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)].id : category,
  }));
}

const VideoCard: React.FC<{ video: Video; onSelect: (id: string) => void }> = ({ video, onSelect }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="video-card relative cursor-pointer group rounded-xl overflow-hidden bg-gray-900 hover:bg-gray-800 transition-all"
      onClick={() => onSelect(video.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(video.id)}
    >
      <div className="thumbnail-container relative aspect-video bg-gray-800">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {video.isLive ? (
          <span className="absolute bottom-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded font-bold">
            LIVE
          </span>
        ) : (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(video.duration)}
          </span>
        )}
        {hovered && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <span className="text-white text-4xl">▶</span>
          </div>
        )}
        {video.isShort && (
          <span className="absolute top-2 left-2 bg-pink-600 text-white text-xs px-2 py-0.5 rounded font-bold">
            SHORT
          </span>
        )}
      </div>
      <div className="video-info flex gap-3 p-3">
        <img
          src={video.channelAvatar}
          alt={video.channelName}
          className="w-9 h-9 rounded-full flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-white line-clamp-2 leading-tight">
            {video.title}
          </h3>
          <p className="text-xs text-gray-400 mt-1 hover:text-gray-300">
            {video.channelName}
          </p>
          <p className="text-xs text-gray-500">
            {formatViewCount(video.views)} · {formatTimeAgo(video.uploadedAt)}
          </p>
        </div>
      </div>
    </div>
  );
};

const SidebarNav: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const navItems = [
    { icon: '🏠', label: 'Home', path: '/' },
    { icon: '📱', label: 'Shorts', path: '/shorts' },
    { icon: '📺', label: 'Subscriptions', path: '/subscriptions' },
    { icon: '🎵', label: 'Music', path: '/music' },
    { icon: '🔴', label: 'Live', path: '/live' },
    { icon: '🎮', label: 'Gaming', path: '/gaming' },
    { icon: '📚', label: 'Library', path: '/library' },
    { icon: '⏱️', label: 'History', path: '/library#history' },
    { icon: '🎙️', label: 'Podcasts', path: '/podcasts' },
    { icon: '🎬', label: 'Shows', path: '/shows' },
    { icon: '⭐', label: 'Premium', path: '/premium' },
    { icon: '📤', label: 'Upload', path: '/upload' },
    { icon: '🎨', label: 'Studio', path: '/studio' },
    { icon: '💰', label: 'Monetization', path: '/monetization' },
  ];

  return (
    <aside className={`sidebar fixed left-0 top-14 h-full bg-gray-900 transition-transform z-40 ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full w-0'}`}>
      <nav className="p-4 space-y-1 overflow-y-auto h-full pb-20">
        {navItems.map((item) => (
          <a
            key={item.path}
            href={`#${item.path}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            onClick={onClose}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </a>
        ))}
      </nav>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[-1] lg:hidden" onClick={onClose} />
      )}
    </aside>
  );
};

export const HomePage: React.FC = () => {
  const [state, setState] = useState<HomePageState>({
    videos: [],
    loading: true,
    error: null,
    activeCategory: 'all',
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    page: 1,
    hasMore: true,
    sidebarOpen: false,
  });

  const observerRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadVideos = useCallback((category: string, page: number, append: boolean = false) => {
    setState(prev => ({ ...prev, loading: !append, error: null }));
    try {
      const newVideos = generateMockVideos(category, page);
      setState(prev => ({
        ...prev,
        videos: append ? [...prev.videos, ...newVideos] : newVideos,
        loading: false,
        hasMore: page < 10,
        page,
      }));
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: 'Failed to load videos. Please try again.' }));
    }
  }, []);

  useEffect(() => {
    loadVideos(state.activeCategory, 1);
  }, [state.activeCategory, loadVideos]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && state.hasMore && !loadingRef.current) {
          loadingRef.current = true;
          const nextPage = state.page + 1;
          loadVideos(state.activeCategory, nextPage, true);
          setTimeout(() => { loadingRef.current = false; }, 500);
        }
      },
      { threshold: 0.1 }
    );
    if (observerRef.current) observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [state.hasMore, state.page, state.activeCategory, loadVideos]);

  const handleCategoryChange = useCallback((categoryId: string) => {
    setState(prev => ({ ...prev, activeCategory: categoryId, page: 1, videos: [], hasMore: true }));
  }, []);

  const handleSearch = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }));
    if (query.length >= 2) {
      setState(prev => ({ ...prev, isSearching: true }));
      const results = generateMockVideos('all', 1).filter(v =>
        v.title.toLowerCase().includes(query.toLowerCase()) ||
        v.channelName.toLowerCase().includes(query.toLowerCase())
      );
      setState(prev => ({ ...prev, searchResults: results, isSearching: false }));
    } else {
      setState(prev => ({ ...prev, searchResults: [], isSearching: false }));
    }
  }, []);

  const handleVideoSelect = useCallback((videoId: string) => {
    window.location.hash = `/watch/${videoId}`;
  }, []);

  const toggleSidebar = useCallback(() => {
    setState(prev => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
  }, []);

  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white p-8">
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
        <p className="text-gray-400 mb-4">{state.error}</p>
        <button
          onClick={() => loadVideos(state.activeCategory, 1)}
          className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-full font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="home-page min-h-screen bg-gray-950 text-white">
      <header className="fixed top-0 left-0 right-0 h-14 bg-gray-900 border-b border-gray-800 flex items-center px-4 z-50">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-full hover:bg-gray-800 mr-4"
          aria-label="Toggle sidebar"
        >
          <span className="text-xl">☰</span>
        </button>
        <a href="#/" className="flex items-center gap-2 mr-8">
          <span className="text-red-600 text-2xl font-bold">▶</span>
          <span className="text-lg font-bold hidden sm:inline">QuantTube</span>
        </a>
        <div className="flex-1 max-w-2xl mx-auto">
          <div className="flex">
            <input
              type="text"
              placeholder="Search videos..."
              value={state.searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-l-full px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button className="px-5 bg-gray-700 border border-l-0 border-gray-700 rounded-r-full hover:bg-gray-600">
              🔍
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button className="p-2 rounded-full hover:bg-gray-800" aria-label="Notifications">🔔</button>
          <button className="p-2 rounded-full hover:bg-gray-800" aria-label="Upload">📤</button>
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold">U</div>
        </div>
      </header>

      <SidebarNav isOpen={state.sidebarOpen} onClose={() => setState(prev => ({ ...prev, sidebarOpen: false }))} />

      <main className="pt-14">
        <div className="category-tabs sticky top-14 z-30 bg-gray-950 border-b border-gray-800 px-4 py-2 overflow-x-auto flex gap-2 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                state.activeCategory === cat.id
                  ? 'bg-white text-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {state.searchQuery && state.searchResults.length > 0 && (
          <div className="search-overlay p-4">
            <h2 className="text-lg font-bold mb-4">Search Results for "{state.searchQuery}"</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {state.searchResults.map((video) => (
                <VideoCard key={video.id} video={video} onSelect={handleVideoSelect} />
              ))}
            </div>
          </div>
        )}

        {state.loading && state.videos.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video bg-gray-800 rounded-xl mb-3" />
                <div className="flex gap-3">
                  <div className="w-9 h-9 bg-gray-800 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-800 rounded mb-2" />
                    <div className="h-3 bg-gray-800 rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="video-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {state.videos.map((video) => (
              <VideoCard key={video.id} video={video} onSelect={handleVideoSelect} />
            ))}
          </div>
        )}

        {state.videos.length === 0 && !state.loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-6xl mb-4">📺</div>
            <h3 className="text-xl font-bold mb-2">No videos found</h3>
            <p className="text-gray-400">Try a different category or check back later</p>
          </div>
        )}

        <div ref={observerRef} className="h-20 flex items-center justify-center">
          {state.hasMore && state.videos.length > 0 && (
            <div className="flex items-center gap-2 text-gray-400">
              <div className="animate-spin w-5 h-5 border-2 border-gray-600 border-t-white rounded-full" />
              <span className="text-sm">Loading more videos...</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default HomePage;
