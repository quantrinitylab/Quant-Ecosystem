// ============================================================================
// QuantTube - Creator Studio Dashboard
// Video management, analytics, comments moderation, community posts
// ============================================================================
//
// HONESTY NOTE: Creator Studio previously rendered hardcoded demo constants
// (MOCK_VIDEOS, MOCK_ANALYTICS, MOCK_COMMENTS) behind a fake 600ms loader, so
// every creator saw the same invented figures — including $8,750.50 of
// revenue that never existed. The page now reads real endpoints only:
//
//   GET /api/videos/mine       -> the caller's own uploaded videos
//   GET /api/creator/dashboard -> real earnings overview (zeros for new creators)
//   GET /api/creator/earnings   -> real earnings breakdown
//
// Surfaces with no backend yet — comment moderation queue, community posts,
// watch hours, subscriber counts, trend deltas — show honest "not available
// yet" empty states instead of invented numbers.

import React, { useState, useCallback, useMemo } from 'react';
import {
  useMyVideos,
  useCreatorDashboard,
  type StudioVideo,
} from '../features/studio/useStudio';
import { useEarnings } from '../features/monetization/useMonetization';

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
  /** Not tracked by any backend yet — null renders as "not tracked". */
  watchHours: number | null;
  /** Not tracked by any backend yet — null renders as "not tracked". */
  subscribers: number | null;
  revenue: number;
  /** Not tracked by any backend yet — null hides the trend line. */
  viewsTrend: number | null;
  /** Not tracked by any backend yet — null hides the trend line. */
  subscribersTrend: number | null;
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

function mapBackendVisibility(visibility: string): VideoItem['visibility'] {
  switch (visibility.toUpperCase()) {
    case 'PUBLIC':
      return 'public';
    case 'UNLISTED':
      return 'unlisted';
    case 'PRIVATE':
      return 'private';
    default:
      return 'draft';
  }
}

function mapVideo(v: StudioVideo): VideoItem {
  return {
    id: v.id,
    title: v.title,
    thumbnail: v.thumbnailUrl ?? '',
    visibility: mapBackendVisibility(v.visibility),
    publishedAt: (v.publishedAt ?? v.createdAt).slice(0, 10),
    views: v.viewCount,
    likes: v.likeCount,
    comments: v.commentCount,
    duration: v.duration,
  };
}

const StudioPage: React.FC = () => {
  const videosQuery = useMyVideos();
  const dashboardQuery = useCreatorDashboard();
  const earningsQuery = useEarnings();

  const [activeTab, setActiveTab] = useState<StudioTab>('content');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  // No backend moderation queue exists yet — an honest empty queue.
  const [commentsQueue, setCommentsQueue] = useState<Comment[]>([]);
  // No backend community-post store exists yet — an honest empty list.
  const [communityPosts] = useState<CommunityPost[]>([]);

  const videos: VideoItem[] = useMemo(() => {
    const rows = videosQuery.data?.data?.data ?? [];
    return rows.map(mapVideo);
  }, [videosQuery.data]);

  const analytics: AnalyticsData = useMemo(() => {
    const overview = dashboardQuery.data?.data?.overview;
    const breakdown = earningsQuery.data?.data?.breakdown;
    const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
    const revenue = overview?.totalEarnings ?? breakdown?.total ?? 0;
    return {
      totalViews,
      watchHours: null,
      subscribers: null,
      revenue,
      viewsTrend: null,
      subscribersTrend: null,
    };
  }, [videos, dashboardQuery.data, earningsQuery.data]);

  const loading = videosQuery.isLoading || dashboardQuery.isLoading || earningsQuery.isLoading;
  const queryError = videosQuery.error ?? dashboardQuery.error ?? earningsQuery.error;
  const error: string | null = queryError
    ? String(queryError?.message ?? queryError).includes('401')
      ? 'Sign in to view your Creator Studio.'
      : 'Could not load studio data. Check your connection and try again.'
    : null;

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('desc');
      }
    },
    [sortField],
  );

  const handleApproveComment = useCallback((commentId: string) => {
    setCommentsQueue((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, status: 'approved' as const } : c)),
    );
  }, []);

  const handleRejectComment = useCallback((commentId: string) => {
    setCommentsQueue((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, status: 'rejected' as const } : c)),
    );
  }, []);

  const sortedVideos = [...videos]
    .filter((v) => v.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          comparison = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
          break;
        case 'views':
          comparison = a.views - b.views;
          break;
        case 'likes':
          comparison = a.likes - b.likes;
          break;
        case 'comments':
          comparison = a.comments - b.comments;
          break;
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
    const colors: Record<string, string> = {
      public: 'bg-green-600',
      unlisted: 'bg-yellow-600',
      private: 'bg-red-600',
      draft: 'bg-gray-600',
    };
    return colors[vis] || 'bg-gray-600';
  };

  /** A metric with no backend behind it — renders honestly, never a number. */
  const renderUntracked = (label: string, detail: string) => (
    <div className="p-4 bg-gray-800 rounded-xl">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-white">—</p>
      <span className="text-xs text-gray-500">{detail}</span>
    </div>
  );

  const renderTrend = (trend: number | null) =>
    trend === null ? null : (
      <span className={`text-xs ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {trend >= 0 ? '+' : ''}
        {trend}% vs last month
      </span>
    );

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
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
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
          <h1 className="text-2xl font-bold text-white">Creator Studio</h1>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              + Upload
            </button>
            <button className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">
              Channel Settings
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-gray-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {(['content', 'analytics', 'comments', 'community', 'settings'] as StudioTab[]).map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                {tab}
                {tab === 'comments' &&
                  commentsQueue.filter((c) => c.status === 'pending').length > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-red-600 text-white text-xs rounded-full">
                      {commentsQueue.filter((c) => c.status === 'pending').length}
                    </span>
                  )}
              </button>
            ),
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Analytics Overview Cards */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="p-4 bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-400">Total Views</p>
              <p className="text-2xl font-bold text-white">{formatNumber(analytics.totalViews)}</p>
              {renderTrend(analytics.viewsTrend)}
            </div>
            {analytics.watchHours === null ? (
              renderUntracked('Watch Hours', 'Watch time is not tracked yet')
            ) : (
              <div className="p-4 bg-gray-800 rounded-xl">
                <p className="text-sm text-gray-400">Watch Hours</p>
                <p className="text-2xl font-bold text-white">
                  {formatNumber(analytics.watchHours)}
                </p>
                <span className="text-xs text-gray-500">Last 28 days</span>
              </div>
            )}
            {analytics.subscribers === null ? (
              renderUntracked('Subscribers', 'Subscriber count is not tracked yet')
            ) : (
              <div className="p-4 bg-gray-800 rounded-xl">
                <p className="text-sm text-gray-400">Subscribers</p>
                <p className="text-2xl font-bold text-white">
                  {formatNumber(analytics.subscribers)}
                </p>
                {renderTrend(analytics.subscribersTrend)}
              </div>
            )}
            <div className="p-4 bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-400">Revenue</p>
              <p className="text-2xl font-bold text-white">${analytics.revenue.toFixed(2)}</p>
              <span className="text-xs text-gray-500">All time earnings</span>
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
                {(['date', 'views', 'likes', 'comments'] as SortField[]).map((field) => (
                  <button
                    key={field}
                    onClick={() => handleSort(field)}
                    className={`px-3 py-1 rounded capitalize ${
                      sortField === field ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700'
                    }`}
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
                {sortedVideos.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center gap-4 p-3 bg-gray-800 rounded-xl hover:bg-gray-750 transition"
                  >
                    {video.thumbnail ? (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-28 h-16 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-28 h-16 rounded-lg bg-gray-700 flex-shrink-0 flex items-center justify-center text-gray-500 text-xs">
                        No thumbnail
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate">{video.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs text-white ${getVisibilityBadge(
                            video.visibility,
                          )}`}
                        >
                          {video.visibility}
                        </span>
                        <span className="text-xs text-gray-500">{video.publishedAt}</span>
                        <span className="text-xs text-gray-500">
                          {formatDuration(video.duration)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-gray-400">
                      <div className="text-center">
                        <p className="font-medium text-white">{formatNumber(video.views)}</p>
                        <p className="text-xs">views</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-white">{formatNumber(video.likes)}</p>
                        <p className="text-xs">likes</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-white">{video.comments}</p>
                        <p className="text-xs">comments</p>
                      </div>
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
            {commentsQueue.filter((c) => c.status === 'pending').length === 0 ? (
              <div className="text-center py-16 bg-gray-800 rounded-xl">
                <p className="text-gray-400">No pending comments.</p>
                <p className="text-gray-500 mt-2 text-sm">
                  Comment moderation is not connected to a backend yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {commentsQueue
                  .filter((c) => c.status === 'pending')
                  .map((comment) => (
                    <div key={comment.id} className="p-4 bg-gray-800 rounded-xl">
                      <div className="flex items-start gap-3">
                        {comment.authorAvatar ? (
                          <img
                            src={comment.authorAvatar}
                            alt={comment.author}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-500 text-sm">
                            {comment.author.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{comment.author}</span>
                            <span className="text-xs text-gray-500">
                              on &ldquo;{comment.videoTitle}&rdquo;
                            </span>
                          </div>
                          <p className="text-gray-300 mt-1">{comment.text}</p>
                          <div className="flex items-center gap-4 mt-3">
                            <button
                              onClick={() => handleApproveComment(comment.id)}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectComment(comment.id)}
                              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                            >
                              Reject
                            </button>
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
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                + New Post
              </button>
            </div>
            {communityPosts.length === 0 ? (
              <div className="text-center py-16 bg-gray-800 rounded-xl">
                <p className="text-gray-400">No community posts yet.</p>
                <p className="text-gray-500 mt-2 text-sm">
                  Community posts are not connected to a backend yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {communityPosts.map((post) => (
                  <div key={post.id} className="p-4 bg-gray-800 rounded-xl">
                    <p className="text-white">{post.content}</p>
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
                      <span>{post.likes} likes</span>
                      <span>{post.comments} comments</span>
                      <span>{post.postedAt}</span>
                      <span className="px-2 py-0.5 bg-gray-700 rounded text-xs capitalize">
                        {post.type}
                      </span>
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
            <p className="text-gray-400 mb-6">
              Manage your channel branding, monetization, and preferences.
            </p>
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Open Channel Settings
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudioPage;
