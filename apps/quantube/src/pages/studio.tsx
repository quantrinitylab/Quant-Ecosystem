// ============================================================================
// QuantTube - Creator Studio Dashboard
// Video management, analytics, comments moderation, community posts
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  visibility: 'public' | 'unlisted' | 'private' | 'draft';
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  duration: number;
}

interface AnalyticsData {
  totalViews: number;
  watchHours: number;
  subscribers: number;
  revenue: number;
  viewsTrend: number;
  subscribersTrend: number;
}

interface Comment {
  id: string;
  author: string;
  authorAvatar: string;
  text: string;
  videoTitle: string;
  postedAt: string;
  likes: number;
  status: 'pending' | 'approved' | 'rejected';
}

interface CommunityPost {
  id: string;
  content: string;
  postedAt: string;
  likes: number;
  comments: number;
  type: 'text' | 'poll' | 'image';
}

type StudioTab = 'content' | 'analytics' | 'comments' | 'community' | 'settings';
type SortField = 'date' | 'views' | 'likes' | 'comments';
type SortDirection = 'asc' | 'desc';

interface StudioPageState {
  videos: VideoItem[];
  analytics: AnalyticsData;
  commentsQueue: Comment[];
  communityPosts: CommunityPost[];
  activeTab: StudioTab;
  sortField: SortField;
  sortDirection: SortDirection;
  loading: boolean;
  error: string | null;
  searchQuery: string;
}

const MOCK_VIDEOS: VideoItem[] = [
  { id: 'v1', title: 'Complete React Tutorial 2024', thumbnail: '/thumbs/react.jpg', visibility: 'public', publishedAt: '2024-01-10', views: 125000, likes: 8500, comments: 420, duration: 3600 },
  { id: 'v2', title: 'TypeScript Best Practices', thumbnail: '/thumbs/ts.jpg', visibility: 'public', publishedAt: '2024-01-08', views: 89000, likes: 6200, comments: 310, duration: 2400 },
  { id: 'v3', title: 'Node.js Microservices Deep Dive', thumbnail: '/thumbs/node.jpg', visibility: 'unlisted', publishedAt: '2024-01-05', views: 45000, likes: 3800, comments: 180, duration: 4200 },
  { id: 'v4', title: 'Building a Design System from Scratch', thumbnail: '/thumbs/design.jpg', visibility: 'public', publishedAt: '2024-01-03', views: 67000, likes: 5100, comments: 250, duration: 2800 },
  { id: 'v5', title: 'Upcoming: GraphQL Advanced Patterns', thumbnail: '/thumbs/graphql.jpg', visibility: 'draft', publishedAt: '2024-01-15', views: 0, likes: 0, comments: 0, duration: 3200 },
];

const MOCK_ANALYTICS: AnalyticsData = {
  totalViews: 1250000,
  watchHours: 85000,
  subscribers: 42500,
  revenue: 8750.50,
  viewsTrend: 12.5,
  subscribersTrend: 3.2,
};

const MOCK_COMMENTS: Comment[] = [
  { id: 'c1', author: 'DevFan42', authorAvatar: '/avatars/fan1.jpg', text: 'This is the best React tutorial I have ever watched. Can you do one on Next.js?', videoTitle: 'Complete React Tutorial 2024', postedAt: '2024-01-14T10:30:00Z', likes: 45, status: 'pending' },
  { id: 'c2', author: 'CodeNewbie', authorAvatar: '/avatars/fan2.jpg', text: 'At 12:30 you mentioned something about closures but I did not quite understand. Can you explain?', videoTitle: 'TypeScript Best Practices', postedAt: '2024-01-14T09:15:00Z', likes: 12, status: 'pending' },
  { id: 'c3', author: 'SpamBot123', authorAvatar: '/avatars/spam.jpg', text: 'Check out my channel for free money!!!', videoTitle: 'Node.js Microservices Deep Dive', postedAt: '2024-01-14T08:00:00Z', likes: 0, status: 'pending' },
  { id: 'c4', author: 'DesignPro', authorAvatar: '/avatars/fan3.jpg', text: 'Great video! The token system explanation was exactly what I needed for my project.', videoTitle: 'Building a Design System from Scratch', postedAt: '2024-01-13T16:45:00Z', likes: 28, status: 'pending' },
];

const StudioPage: React.FC = () => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData>({ totalViews: 0, watchHours: 0, subscribers: 0, revenue: 0, viewsTrend: 0, subscribersTrend: 0 });
  const [commentsQueue, setCommentsQueue] = useState<Comment[]>([]);
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([]);
  const [activeTab, setActiveTab] = useState<StudioTab>('content');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadStudioData = async () => {
      try {
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 600));
        setVideos(MOCK_VIDEOS);
        setAnalytics(MOCK_ANALYTICS);
        setCommentsQueue(MOCK_COMMENTS);
        setCommunityPosts([
          { id: 'cp1', content: 'Working on something big! New series coming next week.', postedAt: '2024-01-12', likes: 340, comments: 52, type: 'text' },
          { id: 'cp2', content: 'What topic should I cover next? Vote below!', postedAt: '2024-01-10', likes: 520, comments: 180, type: 'poll' },
        ]);
        setError(null);
      } catch (err) {
        setError('Failed to load studio data');
      } finally {
        setLoading(false);
      }
    };
    loadStudioData();
  }, []);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  const handleApproveComment = useCallback((commentId: string) => {
    setCommentsQueue(prev => prev.map(c => c.id === commentId ? { ...c, status: 'approved' as const } : c));
  }, []);

  const handleRejectComment = useCallback((commentId: string) => {
    setCommentsQueue(prev => prev.map(c => c.id === commentId ? { ...c, status: 'rejected' as const } : c));
  }, []);

  const sortedVideos = [...videos]
    .filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date': comparison = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(); break;
        case 'views': comparison = a.views - b.views; break;
        case 'likes': comparison = a.likes - b.likes; break;
        case 'comments': comparison = a.comments - b.comments; break;
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getVisibilityBadge = (vis: string) => {
    const colors: Record<string, string> = { public: 'bg-green-600', unlisted: 'bg-yellow-600', private: 'bg-red-600', draft: 'bg-gray-600' };
    return colors[vis] || 'bg-gray-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Loading Creator Studio...</p>
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
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white">Creator Studio</h1>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">+ Upload</button>
            <button className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">Channel Settings</button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-gray-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {(['content', 'analytics', 'comments', 'community', 'settings'] as StudioTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition ${activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
              {tab}
              {tab === 'comments' && commentsQueue.filter(c => c.status === 'pending').length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-600 text-white text-xs rounded-full">{commentsQueue.filter(c => c.status === 'pending').length}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Analytics Overview Cards */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="p-4 bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-400">Total Views</p>
              <p className="text-2xl font-bold text-white">{formatNumber(analytics.totalViews)}</p>
              <span className={`text-xs ${analytics.viewsTrend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {analytics.viewsTrend >= 0 ? '+' : ''}{analytics.viewsTrend}% vs last month
              </span>
            </div>
            <div className="p-4 bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-400">Watch Hours</p>
              <p className="text-2xl font-bold text-white">{formatNumber(analytics.watchHours)}</p>
              <span className="text-xs text-gray-500">Last 28 days</span>
            </div>
            <div className="p-4 bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-400">Subscribers</p>
              <p className="text-2xl font-bold text-white">{formatNumber(analytics.subscribers)}</p>
              <span className={`text-xs ${analytics.subscribersTrend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {analytics.subscribersTrend >= 0 ? '+' : ''}{analytics.subscribersTrend}%
              </span>
            </div>
            <div className="p-4 bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-400">Revenue</p>
              <p className="text-2xl font-bold text-white">${analytics.revenue.toFixed(2)}</p>
              <span className="text-xs text-gray-500">This month</span>
            </div>
          </div>
        )}

        {/* Content Manager Table */}
        {activeTab === 'content' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search videos..."
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
              />
              <div className="flex gap-2 text-sm text-gray-400">
                {(['date', 'views', 'likes', 'comments'] as SortField[]).map(field => (
                  <button
                    key={field}
                    onClick={() => handleSort(field)}
                    className={`px-3 py-1 rounded capitalize ${sortField === field ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700'}`}
                  >
                    {field} {sortField === field && (sortDirection === 'desc' ? 'v' : '^')}
                  </button>
                ))}
              </div>
            </div>

            {sortedVideos.length === 0 ? (
              <div className="text-center py-16 bg-gray-800 rounded-xl">
                <p className="text-gray-400 text-lg">No videos found</p>
                <p className="text-gray-500 mt-2">Upload your first video to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedVideos.map(video => (
                  <div key={video.id} className="flex items-center gap-4 p-3 bg-gray-800 rounded-xl hover:bg-gray-750 transition">
                    <img src={video.thumbnail} alt={video.title} className="w-28 h-16 rounded-lg object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate">{video.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded text-xs text-white ${getVisibilityBadge(video.visibility)}`}>{video.visibility}</span>
                        <span className="text-xs text-gray-500">{video.publishedAt}</span>
                        <span className="text-xs text-gray-500">{formatDuration(video.duration)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-gray-400">
                      <div className="text-center"><p className="font-medium text-white">{formatNumber(video.views)}</p><p className="text-xs">views</p></div>
                      <div className="text-center"><p className="font-medium text-white">{formatNumber(video.likes)}</p><p className="text-xs">likes</p></div>
                      <div className="text-center"><p className="font-medium text-white">{video.comments}</p><p className="text-xs">comments</p></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Comments Moderation */}
        {activeTab === 'comments' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Comments Moderation</h2>
            {commentsQueue.filter(c => c.status === 'pending').length === 0 ? (
              <div className="text-center py-16 bg-gray-800 rounded-xl">
                <p className="text-gray-400">All caught up! No pending comments.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {commentsQueue.filter(c => c.status === 'pending').map(comment => (
                  <div key={comment.id} className="p-4 bg-gray-800 rounded-xl">
                    <div className="flex items-start gap-3">
                      <img src={comment.authorAvatar} alt={comment.author} className="w-10 h-10 rounded-full" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{comment.author}</span>
                          <span className="text-xs text-gray-500">on "{comment.videoTitle}"</span>
                        </div>
                        <p className="text-gray-300 mt-1">{comment.text}</p>
                        <div className="flex items-center gap-4 mt-3">
                          <button onClick={() => handleApproveComment(comment.id)} className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">Approve</button>
                          <button onClick={() => handleRejectComment(comment.id)} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700">Reject</button>
                          <span className="text-xs text-gray-500">{comment.likes} likes</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Community Posts */}
        {activeTab === 'community' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Community Posts</h2>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Post</button>
            </div>
            {communityPosts.length === 0 ? (
              <div className="text-center py-16 bg-gray-800 rounded-xl">
                <p className="text-gray-400">No community posts yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {communityPosts.map(post => (
                  <div key={post.id} className="p-4 bg-gray-800 rounded-xl">
                    <p className="text-white">{post.content}</p>
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
                      <span>{post.likes} likes</span>
                      <span>{post.comments} comments</span>
                      <span>{post.postedAt}</span>
                      <span className="px-2 py-0.5 bg-gray-700 rounded text-xs capitalize">{post.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Link */}
        {activeTab === 'settings' && (
          <div className="text-center py-16">
            <h2 className="text-xl font-bold text-white mb-4">Channel Settings</h2>
            <p className="text-gray-400 mb-6">Manage your channel branding, monetization, and preferences.</p>
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Open Channel Settings</button>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudioPage;
