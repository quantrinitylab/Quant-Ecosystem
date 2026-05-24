// ============================================================================
// QuantTube - Video Watch Page
// Full video player with controls, comments, related videos, channel info
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface VideoData {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  thumbnail: string;
  views: number;
  likes: number;
  dislikes: number;
  publishedAt: string;
  duration: number;
  channelId: string;
  channelName: string;
  channelAvatar: string;
  channelSubscribers: number;
  chapters: Chapter[];
  tags: string[];
  category: string;
  quality: string;
}

interface Chapter {
  time: number;
  title: string;
  thumbnail: string;
}

interface Comment {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  text: string;
  likes: number;
  replies: number;
  createdAt: string;
  isHearted: boolean;
  isPinned: boolean;
}

interface RelatedVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelName: string;
  views: number;
  duration: number;
  uploadedAt: string;
}

interface PlayerState {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  quality: string;
  speed: number;
  fullscreen: boolean;
  theaterMode: boolean;
  pip: boolean;
  buffered: number;
  showControls: boolean;
}

const QUALITIES = ['4K', '1440p', '1080p', '720p', '480p', '360p', '144p'];
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days ago`;
  return `${Math.floor(seconds / 2592000)} months ago`;
}

const VideoPlayer: React.FC<{ video: VideoData; playerState: PlayerState; onStateChange: (s: Partial<PlayerState>) => void }> = ({ video, playerState, onStateChange }) => {
  const progressPercent = playerState.duration > 0 ? (playerState.currentTime / playerState.duration) * 100 : 0;
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMouseMove = useCallback(() => {
    onStateChange({ showControls: true });
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (playerState.playing) onStateChange({ showControls: false });
    }, 3000);
  }, [playerState.playing, onStateChange]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onStateChange({ currentTime: percent * playerState.duration });
  }, [playerState.duration, onStateChange]);

  return (
    <div
      className={`video-player relative bg-black ${playerState.theaterMode ? 'w-full max-h-[80vh]' : 'aspect-video'} group`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playerState.playing && onStateChange({ showControls: false })}
    >
      <img src={video.thumbnail} alt={video.title} className="w-full h-full object-contain" />
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${playerState.showControls || !playerState.playing ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={() => onStateChange({ playing: !playerState.playing })}
          className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center text-white text-3xl hover:bg-black/80 transition-colors"
        >
          {playerState.playing ? '⏸' : '▶'}
        </button>
      </div>
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity ${playerState.showControls || !playerState.playing ? 'opacity-100' : 'opacity-0'}`}>
        <div className="progress-bar h-1 bg-gray-600 rounded cursor-pointer mb-3 group/progress hover:h-2 transition-all" onClick={handleSeek}>
          <div className="h-full bg-red-600 rounded relative" style={{ width: `${progressPercent}%` }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-red-600 rounded-full opacity-0 group-hover/progress:opacity-100" />
          </div>
          <div className="h-full bg-gray-500 rounded absolute top-0" style={{ width: `${playerState.buffered}%`, opacity: 0.3 }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => onStateChange({ playing: !playerState.playing })} className="text-white text-lg hover:text-gray-300">
              {playerState.playing ? '⏸' : '▶'}
            </button>
            <button className="text-white text-lg hover:text-gray-300">⏭</button>
            <button onClick={() => onStateChange({ muted: !playerState.muted })} className="text-white text-lg hover:text-gray-300">
              {playerState.muted || playerState.volume === 0 ? '🔇' : playerState.volume < 0.5 ? '🔉' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={playerState.muted ? 0 : playerState.volume}
              onChange={(e) => onStateChange({ volume: parseFloat(e.target.value), muted: false })}
              className="w-20 h-1 accent-white"
            />
            <span className="text-white text-xs">{formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}</span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={playerState.speed}
              onChange={(e) => onStateChange({ speed: parseFloat(e.target.value) })}
              className="bg-transparent text-white text-xs border border-gray-600 rounded px-1 py-0.5"
            >
              {SPEEDS.map(s => <option key={s} value={s}>{s}x</option>)}
            </select>
            <select
              value={playerState.quality}
              onChange={(e) => onStateChange({ quality: e.target.value })}
              className="bg-transparent text-white text-xs border border-gray-600 rounded px-1 py-0.5"
            >
              {QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
            <button onClick={() => onStateChange({ pip: !playerState.pip })} className="text-white text-sm hover:text-gray-300" title="Picture in Picture">📺</button>
            <button onClick={() => onStateChange({ theaterMode: !playerState.theaterMode })} className="text-white text-sm hover:text-gray-300" title="Theater Mode">🖥️</button>
            <button onClick={() => onStateChange({ fullscreen: !playerState.fullscreen })} className="text-white text-sm hover:text-gray-300" title="Fullscreen">⛶</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChapterTimeline: React.FC<{ chapters: Chapter[]; currentTime: number; onSeek: (time: number) => void }> = ({ chapters, currentTime, onSeek }) => {
  if (chapters.length === 0) return null;
  const currentChapter = [...chapters].reverse().find(ch => currentTime >= ch.time);

  return (
    <div className="chapters-timeline mt-3 p-3 bg-gray-800 rounded-lg">
      <h4 className="text-sm font-medium text-white mb-2">Chapters {currentChapter && `- ${currentChapter.title}`}</h4>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {chapters.map((ch, i) => (
          <button
            key={i}
            onClick={() => onSeek(ch.time)}
            className={`flex-shrink-0 text-left p-2 rounded-lg transition-colors ${currentChapter === ch ? 'bg-blue-600/30 border border-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            <span className="text-xs text-gray-400 block">{formatTime(ch.time)}</span>
            <span className="text-xs text-white block mt-0.5">{ch.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const CommentSection: React.FC<{ videoId: string }> = ({ videoId }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sortBy, setSortBy] = useState<'top' | 'newest'>('top');
  const [showComments, setShowComments] = useState(true);

  useEffect(() => {
    const mockComments: Comment[] = Array.from({ length: 20 }, (_, i) => ({
      id: `comment-${i}`,
      userId: `user-${i}`,
      username: ['TechFan', 'MusicLover', 'GamerzLite', 'Creator99', 'RandomUser'][i % 5],
      avatar: `https://picsum.photos/seed/user${i}/40/40`,
      text: ['Great video! Learned so much.', 'This is exactly what I needed!', 'Can you make more content like this?', 'Timestamps would be helpful', 'Subscribed! Keep it up!'][i % 5],
      likes: Math.floor(Math.random() * 500),
      replies: Math.floor(Math.random() * 10),
      createdAt: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
      isHearted: i < 2,
      isPinned: i === 0,
    }));
    setComments(sortBy === 'top' ? mockComments.sort((a, b) => b.likes - a.likes) : mockComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, [videoId, sortBy]);

  const handleSubmitComment = useCallback(() => {
    if (!newComment.trim()) return;
    const comment: Comment = {
      id: `new-${Date.now()}`,
      userId: 'current-user',
      username: 'You',
      avatar: '',
      text: newComment,
      likes: 0,
      replies: 0,
      createdAt: new Date().toISOString(),
      isHearted: false,
      isPinned: false,
    };
    setComments(prev => [comment, ...prev]);
    setNewComment('');
  }, [newComment]);

  return (
    <div className="comments-section mt-6">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">{comments.length} Comments</h3>
          <span className="text-gray-400">{showComments ? '▼' : '▶'}</span>
        </button>
        <div className="flex gap-2">
          <button onClick={() => setSortBy('top')} className={`text-sm px-3 py-1 rounded-full ${sortBy === 'top' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}>Top</button>
          <button onClick={() => setSortBy('newest')} className={`text-sm px-3 py-1 rounded-full ${sortBy === 'newest' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}>Newest</button>
        </div>
      </div>
      {showComments && (
        <>
          <div className="flex gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">U</div>
            <div className="flex-1">
              <input
                type="text"
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                className="w-full bg-transparent border-b border-gray-700 focus:border-white text-white py-2 text-sm outline-none"
              />
              {newComment && (
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setNewComment('')} className="text-sm text-gray-400 hover:text-white px-3 py-1">Cancel</button>
                  <button onClick={handleSubmitComment} className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded-full">Comment</button>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-4">
            {comments.map(comment => (
              <div key={comment.id} className="flex gap-3">
                {comment.avatar ? (
                  <img src={comment.avatar} alt={comment.username} className="w-10 h-10 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm flex-shrink-0">{comment.username[0]}</div>
                )}
                <div className="flex-1">
                  {comment.isPinned && <span className="text-xs text-gray-400 mb-1 block">📌 Pinned</span>}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{comment.username}</span>
                    <span className="text-xs text-gray-500">{formatTimeAgo(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-300 mt-1">{comment.text}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">👍 {comment.likes > 0 && comment.likes}</button>
                    <button className="text-xs text-gray-400 hover:text-white">👎</button>
                    <button className="text-xs text-gray-400 hover:text-white">Reply</button>
                    {comment.isHearted && <span className="text-xs">❤️</span>}
                  </div>
                  {comment.replies > 0 && (
                    <button className="text-xs text-blue-400 hover:text-blue-300 mt-2">{comment.replies} replies ▼</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const WatchPage: React.FC<{ videoId?: string }> = ({ videoId = 'demo-video' }) => {
  const [video, setVideo] = useState<VideoData | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({
    playing: false, currentTime: 0, duration: 600, volume: 0.8,
    muted: false, quality: '1080p', speed: 1, fullscreen: false,
    theaterMode: false, pip: false, buffered: 45, showControls: true,
  });
  const [relatedVideos, setRelatedVideos] = useState<RelatedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [liked, setLiked] = useState<'like' | 'dislike' | null>(null);

  useEffect(() => {
    setLoading(true);
    const mockVideo: VideoData = {
      id: videoId || 'demo',
      title: 'Building a Complete Video Platform from Scratch - Full Tutorial',
      description: 'In this comprehensive tutorial, we build a complete video streaming platform including upload, transcoding, playback, comments, and recommendations. This covers React, Node.js, FFmpeg, HLS streaming, and more.\n\nTimestamps:\n0:00 - Introduction\n5:30 - Setting up the project\n12:00 - Video upload system\n25:00 - Transcoding pipeline\n40:00 - HLS streaming setup\n55:00 - Player UI\n1:20:00 - Comments and interactions\n1:45:00 - Recommendations engine\n2:00:00 - Deployment',
      videoUrl: '/videos/demo.mp4',
      thumbnail: 'https://picsum.photos/seed/watch/1280/720',
      views: 2450000,
      likes: 89000,
      dislikes: 1200,
      publishedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      duration: 7200,
      channelId: 'tech-master',
      channelName: 'TechMaster Pro',
      channelAvatar: 'https://picsum.photos/seed/techmaster/64/64',
      channelSubscribers: 1250000,
      chapters: [
        { time: 0, title: 'Introduction', thumbnail: '' },
        { time: 330, title: 'Project Setup', thumbnail: '' },
        { time: 720, title: 'Upload System', thumbnail: '' },
        { time: 1500, title: 'Transcoding', thumbnail: '' },
        { time: 2400, title: 'HLS Streaming', thumbnail: '' },
        { time: 3300, title: 'Player UI', thumbnail: '' },
        { time: 4800, title: 'Comments', thumbnail: '' },
        { time: 6300, title: 'Recommendations', thumbnail: '' },
        { time: 7200, title: 'Deployment', thumbnail: '' },
      ],
      tags: ['tutorial', 'programming', 'video-platform', 'react', 'nodejs'],
      category: 'Education',
      quality: '4K',
    };
    setVideo(mockVideo);
    setPlayerState(prev => ({ ...prev, duration: mockVideo.duration }));
    const related: RelatedVideo[] = Array.from({ length: 15 }, (_, i) => ({
      id: `related-${i}`,
      title: ['React Advanced Patterns', 'Node.js Performance Tips', 'FFmpeg Masterclass', 'HLS Streaming Guide', 'Building YouTube Clone'][i % 5],
      thumbnail: `https://picsum.photos/seed/rel${i}/320/180`,
      channelName: ['CodeAcademy', 'DevTips', 'TechMaster Pro', 'WebDev Pro', 'StreamLab'][i % 5],
      views: Math.floor(Math.random() * 2000000),
      duration: Math.floor(Math.random() * 3600) + 120,
      uploadedAt: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
    }));
    setRelatedVideos(related);
    setLoading(false);
  }, [videoId]);

  const handlePlayerStateChange = useCallback((changes: Partial<PlayerState>) => {
    setPlayerState(prev => ({ ...prev, ...changes }));
  }, []);

  if (loading || !video) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-gray-700 border-t-red-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="watch-page min-h-screen bg-gray-950 text-white pt-14">
      <div className={`flex ${playerState.theaterMode ? 'flex-col' : 'flex-col lg:flex-row'} gap-6 p-4 max-w-[1800px] mx-auto`}>
        <div className={`${playerState.theaterMode ? 'w-full' : 'flex-1'}`}>
          <VideoPlayer video={video} playerState={playerState} onStateChange={handlePlayerStateChange} />
          <ChapterTimeline chapters={video.chapters} currentTime={playerState.currentTime} onSeek={(time) => handlePlayerStateChange({ currentTime: time })} />
          <div className="video-info mt-4">
            <h1 className="text-xl font-bold">{video.title}</h1>
            <div className="flex flex-wrap items-center justify-between mt-3 gap-3">
              <div className="flex items-center gap-3">
                <img src={video.channelAvatar} alt={video.channelName} className="w-10 h-10 rounded-full" />
                <div>
                  <a href={`#/channel/${video.channelId}`} className="font-medium text-white hover:text-gray-300">{video.channelName}</a>
                  <p className="text-xs text-gray-400">{formatNumber(video.channelSubscribers)} subscribers</p>
                </div>
                <button
                  onClick={() => setSubscribed(!subscribed)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${subscribed ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-black hover:bg-gray-200'}`}
                >
                  {subscribed ? 'Subscribed ✓' : 'Subscribe'}
                </button>
                {subscribed && (
                  <button className="p-2 rounded-full hover:bg-gray-800" title="Notifications">🔔</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-full bg-gray-800 overflow-hidden">
                  <button
                    onClick={() => setLiked(liked === 'like' ? null : 'like')}
                    className={`flex items-center gap-1 px-4 py-2 text-sm border-r border-gray-700 ${liked === 'like' ? 'text-blue-400' : 'text-white hover:bg-gray-700'}`}
                  >
                    👍 {formatNumber(video.likes + (liked === 'like' ? 1 : 0))}
                  </button>
                  <button
                    onClick={() => setLiked(liked === 'dislike' ? null : 'dislike')}
                    className={`flex items-center gap-1 px-4 py-2 text-sm ${liked === 'dislike' ? 'text-blue-400' : 'text-white hover:bg-gray-700'}`}
                  >
                    👎
                  </button>
                </div>
                <button className="flex items-center gap-1 px-4 py-2 bg-gray-800 rounded-full text-sm hover:bg-gray-700">↗️ Share</button>
                <button className="flex items-center gap-1 px-4 py-2 bg-gray-800 rounded-full text-sm hover:bg-gray-700">⬇️ Download</button>
                <button className="flex items-center gap-1 px-4 py-2 bg-gray-800 rounded-full text-sm hover:bg-gray-700">✂️ Clip</button>
                <button className="flex items-center gap-1 px-4 py-2 bg-gray-800 rounded-full text-sm hover:bg-gray-700">📋 Save</button>
              </div>
            </div>
            <div className={`description mt-4 p-3 bg-gray-800 rounded-xl ${descExpanded ? '' : 'max-h-24 overflow-hidden relative'}`}>
              <div className="flex gap-2 text-sm text-gray-300 mb-2">
                <span>{formatNumber(video.views)} views</span>
                <span>·</span>
                <span>{formatTimeAgo(video.publishedAt)}</span>
                <span>·</span>
                <span>{video.category}</span>
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-line">{video.description}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {video.tags.map(tag => (
                  <span key={tag} className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">#{tag}</span>
                ))}
              </div>
              {!descExpanded && <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-800 to-transparent" />}
            </div>
            <button onClick={() => setDescExpanded(!descExpanded)} className="text-sm text-gray-400 hover:text-white mt-2">
              {descExpanded ? 'Show less' : 'Show more'}
            </button>
          </div>
          <CommentSection videoId={video.id} />
        </div>
        {!playerState.theaterMode && (
          <aside className="related-videos w-full lg:w-96 flex-shrink-0">
            <h3 className="text-lg font-bold mb-4">Related Videos</h3>
            <div className="space-y-3">
              {relatedVideos.map(rv => (
                <a key={rv.id} href={`#/watch/${rv.id}`} className="flex gap-2 group hover:bg-gray-800 rounded-lg p-1 transition-colors">
                  <div className="relative w-40 flex-shrink-0">
                    <img src={rv.thumbnail} alt={rv.title} className="w-full aspect-video object-cover rounded-lg" />
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded">{formatTime(rv.duration)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-white line-clamp-2 group-hover:text-blue-400">{rv.title}</h4>
                    <p className="text-xs text-gray-400 mt-1">{rv.channelName}</p>
                    <p className="text-xs text-gray-500">{formatNumber(rv.views)} views · {formatTimeAgo(rv.uploadedAt)}</p>
                  </div>
                </a>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default WatchPage;
