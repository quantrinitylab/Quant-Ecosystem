// ============================================================================
// QuantTube - Channel Page
// Channel view with banner, subscribe, bell notifications, tabs, video grid
// ============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';

interface ChannelData {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string;
  bannerUrl: string;
  description: string;
  subscriberCount: number;
  videoCount: number;
  totalViews: number;
  joinedDate: string;
  links: { label: string; url: string }[];
  verified: boolean;
  location: string;
}

interface ChannelVideo {
  id: string;
  title: string;
  thumbnail: string;
  views: number;
  publishedAt: string;
  duration: number;
  isLive: boolean;
  isShort: boolean;
}

interface ChannelPlaylist {
  id: string;
  title: string;
  thumbnail: string;
  videoCount: number;
  updatedAt: string;
}

interface CommunityPost {
  id: string;
  content: string;
  postedAt: string;
  likes: number;
  comments: number;
  imageUrl?: string;
}

type ChannelTab = 'videos' | 'shorts' | 'live' | 'playlists' | 'community' | 'about';
type NotificationLevel = 'all' | 'personalized' | 'none';
type VideoSort = 'latest' | 'popular' | 'oldest';

interface ChannelApiResponse {
  channel: ChannelData;
  videos?: ChannelVideo[];
  playlists?: ChannelPlaylist[];
  communityPosts?: CommunityPost[];
}

const ChannelPage: React.FC = () => {
  const router = useRouter();
  const channelId = (router.query.id as string) || '';

  const [activeTab, setActiveTab] = useState<ChannelTab>('videos');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [notificationLevel, setNotificationLevel] = useState<NotificationLevel>('personalized');
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [videoSort, setVideoSort] = useState<VideoSort>('latest');
  const bellRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } = useQuery<ChannelApiResponse>({
    queryKey: ['channel', channelId],
    queryFn: async () => {
      const response = await apiClient.getChannel(channelId);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to load channel');
      }
      return response.data;
    },
    enabled: !!channelId,
    retry: 1,
  });

  // Channel content comes only from the API. On error or missing data the page
  // renders the real error / "Channel not found" states below — never a
  // fabricated fallback channel.
  const channel: ChannelData | null = data?.channel ?? null;
  const videos: ChannelVideo[] = data?.videos ?? [];
  const playlists: ChannelPlaylist[] = data?.playlists ?? [];
  const communityPosts: CommunityPost[] = data?.communityPosts ?? [];

  const shorts = videos.filter((v) => v.isShort);
  const regularVideos = videos.filter((v) => !v.isShort && !v.isLive);
  const liveStreams = videos.filter((v) => v.isLive);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowBellDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubscribe = useCallback(() => {
    setIsSubscribed((prev) => !prev);
    if (!isSubscribed) {
      setNotificationLevel('personalized');
      apiClient.subscribe(channelId).catch(() => {
        /* best effort */
      });
    } else {
      apiClient.unsubscribe(channelId).catch(() => {
        /* best effort */
      });
    }
  }, [isSubscribed, channelId]);

  const handleNotificationChange = useCallback((level: NotificationLevel) => {
    setNotificationLevel(level);
    setShowBellDropdown(false);
  }, []);

  const handleSortChange = useCallback((sort: VideoSort) => {
    setVideoSort(sort);
  }, []);

  const sortedVideos = [...regularVideos].sort((a, b) => {
    switch (videoSort) {
      case 'latest':
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      case 'popular':
        return b.views - a.views;
      case 'oldest':
        return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      default:
        return 0;
    }
  });

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Loading channel...</p>
        </div>
      </div>
    );
  }

  if (error && !channel) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="text-red-400 text-5xl mb-4">!</div>
          <p className="text-red-300 text-lg mb-4">
            {error instanceof Error ? error.message : 'Channel not found'}
          </p>
          <button
            onClick={() => refetch()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="text-red-400 text-5xl mb-4">!</div>
          <p className="text-red-300 text-lg mb-4">Channel not found</p>
          <button
            onClick={() => refetch()}
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
      {/* Banner */}
      <div className="w-full h-48 md:h-56 bg-gray-800 overflow-hidden">
        <img src={channel.bannerUrl} alt="Channel banner" className="w-full h-full object-cover" />
      </div>

      {/* Channel Header */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-start gap-6">
          <img
            src={channel.avatarUrl}
            alt={channel.name}
            className="w-20 h-20 md:w-28 md:h-28 rounded-full border-4 border-gray-900 -mt-12"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{channel.name}</h1>
              {channel.verified && (
                <span className="text-blue-400 text-sm font-bold">Verified</span>
              )}
            </div>
            <p className="text-gray-400 text-sm">{channel.handle}</p>
            <p className="text-gray-500 text-sm mt-1">
              {formatNumber(channel.subscriberCount)} subscribers - {channel.videoCount} videos
            </p>
            <p className="text-gray-400 text-sm mt-2 max-w-2xl line-clamp-2">
              {channel.description}
            </p>
          </div>

          {/* Subscribe + Bell */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubscribe}
              className={`px-5 py-2.5 rounded-full font-medium transition ${isSubscribed ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-900 hover:bg-gray-200'}`}
            >
              {isSubscribed ? 'Subscribed' : 'Subscribe'}
            </button>

            {isSubscribed && (
              <div ref={bellRef} className="relative">
                <button
                  onClick={() => setShowBellDropdown(!showBellDropdown)}
                  className="w-10 h-10 flex items-center justify-center bg-gray-700 rounded-full hover:bg-gray-600 transition"
                >
                  <span className="text-lg">
                    {notificationLevel === 'all'
                      ? 'B+'
                      : notificationLevel === 'personalized'
                        ? 'B'
                        : 'B-'}
                  </span>
                </button>

                {showBellDropdown && (
                  <div className="absolute right-0 top-12 w-48 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
                    {(['all', 'personalized', 'none'] as NotificationLevel[]).map((level) => (
                      <button
                        key={level}
                        onClick={() => handleNotificationChange(level)}
                        className={`w-full px-4 py-3 text-left text-sm transition capitalize ${notificationLevel === level ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                      >
                        {level}
                        {level === 'all' && (
                          <span className="block text-xs text-gray-400">Get all notifications</span>
                        )}
                        {level === 'personalized' && (
                          <span className="block text-xs text-gray-400">Occasional updates</span>
                        )}
                        {level === 'none' && (
                          <span className="block text-xs text-gray-400">No notifications</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="border-b border-gray-800 px-6 sticky top-0 bg-gray-900 z-30">
        <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto">
          {(['videos', 'shorts', 'live', 'playlists', 'community', 'about'] as ChannelTab[]).map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium capitalize whitespace-nowrap border-b-2 transition ${activeTab === tab ? 'border-white text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
              >
                {tab}
              </button>
            ),
          )}
        </div>
      </nav>

      {/* Tab Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Videos Tab */}
        {activeTab === 'videos' && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              {(['latest', 'popular', 'oldest'] as VideoSort[]).map((sort) => (
                <button
                  key={sort}
                  onClick={() => handleSortChange(sort)}
                  className={`px-3 py-1.5 rounded-lg text-sm capitalize ${videoSort === sort ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                >
                  {sort}
                </button>
              ))}
            </div>
            {sortedVideos.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-400">No videos uploaded yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedVideos.map((video) => (
                  <div key={video.id} className="group cursor-pointer">
                    <div className="relative rounded-xl overflow-hidden">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full aspect-video object-cover group-hover:opacity-80 transition"
                      />
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded">
                        {formatDuration(video.duration)}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-medium text-white line-clamp-2">
                      {video.title}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatNumber(video.views)} views - {video.publishedAt}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Shorts Tab */}
        {activeTab === 'shorts' && (
          <div>
            {shorts.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-400">No shorts yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {shorts.map((short) => (
                  <div key={short.id} className="group cursor-pointer">
                    <div className="relative rounded-xl overflow-hidden aspect-[9/16] bg-gray-800">
                      <img
                        src={short.thumbnail}
                        alt={short.title}
                        className="w-full h-full object-cover group-hover:opacity-80 transition"
                      />
                      <span className="absolute bottom-2 left-2 text-xs text-white font-medium">
                        {formatNumber(short.views)} views
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white line-clamp-2">{short.title}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Live Tab */}
        {activeTab === 'live' && (
          <div>
            {liveStreams.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-400">No live streams currently.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {liveStreams.map((stream) => (
                  <div key={stream.id} className="group cursor-pointer">
                    <div className="relative rounded-xl overflow-hidden">
                      <img
                        src={stream.thumbnail}
                        alt={stream.title}
                        className="w-full aspect-video object-cover group-hover:opacity-80 transition"
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-xs rounded font-medium">
                        LIVE
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-medium text-white line-clamp-2">
                      {stream.title}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatNumber(stream.views)} watching
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Playlists Tab */}
        {activeTab === 'playlists' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {playlists.map((pl) => (
              <div key={pl.id} className="group cursor-pointer">
                <div className="relative rounded-xl overflow-hidden">
                  <img
                    src={pl.thumbnail}
                    alt={pl.title}
                    className="w-full aspect-video object-cover group-hover:opacity-80 transition"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="text-white font-bold">{pl.videoCount} videos</span>
                  </div>
                </div>
                <h3 className="mt-2 font-medium text-white">{pl.title}</h3>
                <p className="text-xs text-gray-400">Updated {pl.updatedAt}</p>
              </div>
            ))}
          </div>
        )}

        {/* Community Tab */}
        {activeTab === 'community' && (
          <div className="space-y-4 max-w-2xl">
            {communityPosts.map((post) => (
              <div key={post.id} className="p-4 bg-gray-800 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={channel.avatarUrl}
                    alt={channel.name}
                    className="w-10 h-10 rounded-full"
                  />
                  <div>
                    <p className="font-medium text-white">{channel.name}</p>
                    <p className="text-xs text-gray-500">{post.postedAt}</p>
                  </div>
                </div>
                <p className="text-gray-300">{post.content}</p>
                {post.imageUrl && (
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="mt-3 rounded-lg max-h-64 object-cover"
                  />
                )}
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
                  <button className="hover:text-white">{formatNumber(post.likes)} likes</button>
                  <button className="hover:text-white">{post.comments} comments</button>
                </div>
              </div>
            ))}
            {communityPosts.length === 0 && (
              <div className="text-center py-16">
                <p className="text-gray-400">No community posts yet.</p>
              </div>
            )}
          </div>
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h3 className="text-lg font-medium text-white mb-2">Description</h3>
              <p className="text-gray-300 whitespace-pre-wrap">{channel.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Location</p>
                <p className="text-white">{channel.location}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Joined</p>
                <p className="text-white">{channel.joinedDate}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Views</p>
                <p className="text-white">{formatNumber(channel.totalViews)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Videos</p>
                <p className="text-white">{channel.videoCount}</p>
              </div>
            </div>
            {channel.links.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Links</h3>
                <div className="space-y-2">
                  {channel.links.map((link) => (
                    <div key={link.url} className="flex items-center gap-2">
                      <span className="text-blue-400 hover:underline cursor-pointer">
                        {link.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ChannelPage;
