// ============================================================================
// QuantTube - Live Streaming Hub
// Live streams directory with categories, followed channels, schedule
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface LiveStream {
  id: string;
  title: string;
  channelName: string;
  channelAvatar: string;
  channelId: string;
  thumbnailUrl: string;
  viewerCount: number;
  category: string;
  startedAt: string;
  tags: string[];
  isFollowed: boolean;
}

interface ScheduledStream {
  id: string;
  title: string;
  channelName: string;
  channelAvatar: string;
  scheduledAt: string;
  category: string;
  notifyEnabled: boolean;
}

type StreamCategory = 'all' | 'gaming' | 'music' | 'talk' | 'sports' | 'creative';

interface LivePageState {
  streams: LiveStream[];
  followedLive: LiveStream[];
  schedule: ScheduledStream[];
  activeCategory: StreamCategory;
  loading: boolean;
  error: string | null;
  followedChannels: Set<string>;
}

const CATEGORIES: { id: StreamCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'music', label: 'Music' },
  { id: 'talk', label: 'Talk Shows' },
  { id: 'sports', label: 'Sports' },
  { id: 'creative', label: 'Creative' },
];

const MOCK_STREAMS: LiveStream[] = [
  { id: 'ls1', title: 'Late Night Gaming Marathon', channelName: 'ProGamer99', channelAvatar: '/avatars/progamer.jpg', channelId: 'ch1', thumbnailUrl: '/thumbs/gaming1.jpg', viewerCount: 15420, category: 'gaming', startedAt: '2024-01-15T20:00:00Z', tags: ['FPS', 'Competitive'], isFollowed: true },
  { id: 'ls2', title: 'Jazz Improvisation Session', channelName: 'MelodyMakers', channelAvatar: '/avatars/melody.jpg', channelId: 'ch2', thumbnailUrl: '/thumbs/jazz1.jpg', viewerCount: 3200, category: 'music', startedAt: '2024-01-15T19:30:00Z', tags: ['Jazz', 'Live Performance'], isFollowed: false },
  { id: 'ls3', title: 'Tech Talk: AI in 2024', channelName: 'TechInsights', channelAvatar: '/avatars/tech.jpg', channelId: 'ch3', thumbnailUrl: '/thumbs/tech1.jpg', viewerCount: 8750, category: 'talk', startedAt: '2024-01-15T21:00:00Z', tags: ['AI', 'Technology'], isFollowed: true },
  { id: 'ls4', title: 'Champions League Watch Party', channelName: 'SportsHub', channelAvatar: '/avatars/sports.jpg', channelId: 'ch4', thumbnailUrl: '/thumbs/sports1.jpg', viewerCount: 45000, category: 'sports', startedAt: '2024-01-15T18:00:00Z', tags: ['Football', 'UCL'], isFollowed: false },
  { id: 'ls5', title: 'Digital Art Speed Painting', channelName: 'ArtistCorner', channelAvatar: '/avatars/artist.jpg', channelId: 'ch5', thumbnailUrl: '/thumbs/art1.jpg', viewerCount: 2100, category: 'creative', startedAt: '2024-01-15T17:00:00Z', tags: ['Digital Art', 'Procreate'], isFollowed: true },
  { id: 'ls6', title: 'Minecraft Survival Challenge', channelName: 'BlockWorld', channelAvatar: '/avatars/block.jpg', channelId: 'ch6', thumbnailUrl: '/thumbs/minecraft1.jpg', viewerCount: 9800, category: 'gaming', startedAt: '2024-01-15T16:00:00Z', tags: ['Minecraft', 'Survival'], isFollowed: false },
];

const MOCK_SCHEDULE: ScheduledStream[] = [
  { id: 'sc1', title: 'Weekly Music Friday', channelName: 'MelodyMakers', channelAvatar: '/avatars/melody.jpg', scheduledAt: '2024-01-19T20:00:00Z', category: 'music', notifyEnabled: true },
  { id: 'sc2', title: 'Coding Live: Building a Game Engine', channelName: 'DevStream', channelAvatar: '/avatars/dev.jpg', scheduledAt: '2024-01-20T15:00:00Z', category: 'creative', notifyEnabled: false },
  { id: 'sc3', title: 'Esports Tournament Finals', channelName: 'ProGamer99', channelAvatar: '/avatars/progamer.jpg', scheduledAt: '2024-01-21T18:00:00Z', category: 'gaming', notifyEnabled: true },
];

const LivePage: React.FC = () => {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [followedLive, setFollowedLive] = useState<LiveStream[]>([]);
  const [schedule, setSchedule] = useState<ScheduledStream[]>([]);
  const [activeCategory, setActiveCategory] = useState<StreamCategory>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followedChannels, setFollowedChannels] = useState<Set<string>>(new Set());
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const loadStreams = async () => {
      try {
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        setStreams(MOCK_STREAMS);
        setFollowedLive(MOCK_STREAMS.filter(s => s.isFollowed));
        setSchedule(MOCK_SCHEDULE);
        setFollowedChannels(new Set(MOCK_STREAMS.filter(s => s.isFollowed).map(s => s.channelId)));
        setError(null);
      } catch (err) {
        setError('Failed to load live streams');
      } finally {
        setLoading(false);
      }
    };
    loadStreams();

    refreshRef.current = setInterval(() => {
      setStreams(prev => prev.map(s => ({
        ...s,
        viewerCount: s.viewerCount + Math.floor(Math.random() * 100 - 50)
      })));
    }, 10000);

    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, []);

  const handleCategoryChange = useCallback((category: StreamCategory) => {
    setActiveCategory(category);
  }, []);

  const handleFollowToggle = useCallback((channelId: string) => {
    setFollowedChannels(prev => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  }, []);

  const handleToggleNotify = useCallback((scheduleId: string) => {
    setSchedule(prev => prev.map(s =>
      s.id === scheduleId ? { ...s, notifyEnabled: !s.notifyEnabled } : s
    ));
  }, []);

  const filteredStreams = activeCategory === 'all'
    ? streams
    : streams.filter(s => s.category === activeCategory);

  const formatViewers = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const formatScheduleTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Loading live streams...</p>
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
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Live</h1>
            <span className="flex items-center gap-1 px-2 py-1 bg-red-600 rounded text-xs font-bold">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              {streams.length} LIVE
            </span>
          </div>
          <button className="px-5 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition">
            Go Live
          </button>
        </div>
      </header>

      {/* Categories Filter */}
      <nav className="px-6 py-3 border-b border-gray-800">
        <div className="flex gap-2 max-w-7xl mx-auto overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === cat.id ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Followed Channels Live */}
        {followedLive.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Followed Channels - Live Now</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {followedLive.map(stream => (
                <div key={stream.id} className="bg-gray-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-red-500 transition cursor-pointer">
                  <div className="relative">
                    <img src={stream.thumbnailUrl} alt={stream.title} className="w-full aspect-video object-cover" />
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded">LIVE</span>
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded">{formatViewers(stream.viewerCount)} viewers</span>
                  </div>
                  <div className="p-3 flex items-start gap-3">
                    <img src={stream.channelAvatar} alt={stream.channelName} className="w-9 h-9 rounded-full" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-white truncate">{stream.title}</h3>
                      <p className="text-xs text-gray-400">{stream.channelName}</p>
                      <p className="text-xs text-gray-500">{stream.category}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live Now Grid */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4">
            {activeCategory === 'all' ? 'All Live Streams' : `${CATEGORIES.find(c => c.id === activeCategory)?.label} Streams`}
          </h2>
          {filteredStreams.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">No streams</div>
              <p className="text-gray-400">No live streams in this category right now.</p>
              <p className="text-gray-500 mt-2">Check back later or browse other categories.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStreams.map(stream => (
                <div key={stream.id} className="bg-gray-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-red-500 transition cursor-pointer group">
                  <div className="relative">
                    <img src={stream.thumbnailUrl} alt={stream.title} className="w-full aspect-video object-cover group-hover:opacity-90 transition" />
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded">LIVE</span>
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded">{formatViewers(stream.viewerCount)} viewers</span>
                  </div>
                  <div className="p-3 flex items-start gap-3">
                    <img src={stream.channelAvatar} alt={stream.channelName} className="w-9 h-9 rounded-full" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-white truncate">{stream.title}</h3>
                      <p className="text-xs text-gray-400">{stream.channelName}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {stream.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">{tag}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleFollowToggle(stream.channelId); }}
                      className={`text-xs px-2 py-1 rounded ${followedChannels.has(stream.channelId) ? 'bg-gray-700 text-gray-300' : 'bg-red-600 text-white'}`}
                    >
                      {followedChannels.has(stream.channelId) ? 'Following' : 'Follow'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming Schedule */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4">Upcoming Schedule</h2>
          {schedule.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No upcoming streams scheduled.</p>
          ) : (
            <div className="space-y-3">
              {schedule.map(item => (
                <div key={item.id} className="flex items-center gap-4 p-4 bg-gray-800 rounded-xl">
                  <img src={item.channelAvatar} alt={item.channelName} className="w-12 h-12 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white truncate">{item.title}</h3>
                    <p className="text-sm text-gray-400">{item.channelName}</p>
                    <p className="text-xs text-gray-500">{formatScheduleTime(item.scheduledAt)} - {item.category}</p>
                  </div>
                  <button
                    onClick={() => handleToggleNotify(item.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${item.notifyEnabled ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {item.notifyEnabled ? 'Notified' : 'Notify Me'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default LivePage;
