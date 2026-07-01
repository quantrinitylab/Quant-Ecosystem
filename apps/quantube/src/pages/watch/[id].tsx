// ============================================================================
// QuantTube - Video Watch Page
// Full video player with chapters, quality selector, comments, recommendations
// ============================================================================

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { LoadingState, ErrorState, EmptyState, SpringButton } from '@quant/shared-ui';
import { useVideo } from '../../hooks/useVideo';
import { useComments } from '../../hooks/useComments';
import { useSegmentSkip } from '../../hooks/useSegmentSkip';
import { topicJumpTarget } from '../../lib/segment-skip';
import { apiClient } from '../../services/api-client';

type VideoQuality = '144p' | '360p' | '720p' | '1080p' | '4K';

interface Chapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
}

interface CommentItem {
  id: string;
  username?: string;
  avatar?: string;
  text?: string;
  likes?: number;
  timestamp?: string;
  replies?: CommentItem[];
}

interface RecommendedVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelName: string;
  views: number;
  duration: number;
  publishedAt: string;
}

const QUALITIES: VideoQuality[] = ['144p', '360p', '720p', '1080p', '4K'];

const FALLBACK_RECOMMENDATIONS: RecommendedVideo[] = [
  {
    id: 'rec1',
    title: 'Building Scalable APIs with Node.js',
    thumbnail: '/thumbs/node-api.jpg',
    channelName: 'DevMastery',
    views: 245000,
    duration: 1840,
    publishedAt: '3 days ago',
  },
  {
    id: 'rec2',
    title: 'React 19 - What You Need to Know',
    thumbnail: '/thumbs/react19.jpg',
    channelName: 'WebDev Pro',
    views: 890000,
    duration: 1200,
    publishedAt: '1 week ago',
  },
  {
    id: 'rec3',
    title: 'System Design Interview Prep',
    thumbnail: '/thumbs/sysdesign.jpg',
    channelName: 'TechInterviews',
    views: 1200000,
    duration: 3600,
    publishedAt: '2 weeks ago',
  },
  {
    id: 'rec4',
    title: 'Rust for TypeScript Developers',
    thumbnail: '/thumbs/rust-ts.jpg',
    channelName: 'RustLang',
    views: 156000,
    duration: 2400,
    publishedAt: '5 days ago',
  },
  {
    id: 'rec5',
    title: 'Docker Compose Deep Dive',
    thumbnail: '/thumbs/docker.jpg',
    channelName: 'ContainerPro',
    views: 312000,
    duration: 1560,
    publishedAt: '4 days ago',
  },
];

const FALLBACK_CHAPTERS: Chapter[] = [
  { id: 'ch1', title: 'Introduction', startTime: 0, endTime: 120 },
  { id: 'ch2', title: 'Setup & Installation', startTime: 120, endTime: 360 },
  { id: 'ch3', title: 'Core Concepts', startTime: 360, endTime: 720 },
  { id: 'ch4', title: 'Building the Project', startTime: 720, endTime: 1200 },
  { id: 'ch5', title: 'Deployment & Testing', startTime: 1200, endTime: 1600 },
  { id: 'ch6', title: 'Summary & Next Steps', startTime: 1600, endTime: 1800 },
];

const WatchPage: React.FC = () => {
  const router = useRouter();
  const id = (router.query.id as string) || '';
  const {
    data: video,
    isLoading: videoLoading,
    error: videoError,
    refetch: refetchVideo,
  } = useVideo(id);
  const { data: comments, isLoading: commentsLoading, error: commentsError } = useComments(id);

  const [commentText, setCommentText] = useState('');
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [quality, setQuality] = useState<VideoQuality>('1080p');
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [activeChapter, setActiveChapter] = useState<string | null>(null);

  // --- Smart segment-skip (server skip-plan + "teach me X") wired to the real
  // <video> element's currentTime seek handle. ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [autoSkip, setAutoSkip] = useState(true);
  const [topicQuery, setTopicQuery] = useState('');
  const { skipPlan, topicJumps, fetchTopicJumps, skipTargetAt } = useSegmentSkip(id, duration);

  // Seed the duration from the loaded video record so the skip-plan can be
  // fetched even before the media element reports its own metadata.
  useEffect(() => {
    const d = (video as { duration?: number } | undefined)?.duration;
    if (typeof d === 'number' && d > 0) {
      setDuration((prev) => (prev > 0 ? prev : d));
    }
  }, [video]);

  const seek = useCallback((targetSec: number) => {
    const el = videoRef.current;
    if (el && Number.isFinite(targetSec)) {
      el.currentTime = Math.max(0, targetSec);
    }
    setCurrentTime((prev) => (Number.isFinite(targetSec) ? Math.max(0, targetSec) : prev));
  }, []);

  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const t = e.currentTarget.currentTime;
      setCurrentTime(t);
      if (autoSkip) {
        const target = skipTargetAt(t);
        if (target != null && target > t) {
          e.currentTarget.currentTime = target;
        }
      }
    },
    [autoSkip, skipTargetAt],
  );

  const handleTopicSearch = useCallback(() => {
    void fetchTopicJumps(topicQuery);
  }, [fetchTopicJumps, topicQuery]);

  const manualSkipTarget = skipTargetAt(currentTime);

  const formatViews = useCallback((views: number): string => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`;
    return `${views} views`;
  }, []);

  const formatCount = useCallback((count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  }, []);

  const formatDuration = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const handleLike = useCallback(() => {
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    if (isDisliked) setIsDisliked(false);
    setLikeCount((prev) => (wasLiked ? prev - 1 : prev + 1));
    apiClient.like(id).catch(() => {
      setIsLiked(wasLiked);
      setLikeCount((prev) => (wasLiked ? prev + 1 : prev - 1));
    });
  }, [isLiked, isDisliked, id]);

  const handleDislike = useCallback(() => {
    const wasDisliked = isDisliked;
    setIsDisliked(!wasDisliked);
    if (isLiked) {
      setIsLiked(false);
      setLikeCount((prev) => prev - 1);
    }
  }, [isDisliked, isLiked]);

  const handleSubscribe = useCallback(() => {
    const was = isSubscribed;
    setIsSubscribed(!was);
    const fn = was ? apiClient.unsubscribe : apiClient.subscribe;
    fn.call(apiClient, id).catch(() => setIsSubscribed(was));
  }, [isSubscribed, id]);

  const handleComment = useCallback(() => {
    if (!commentText.trim()) return;
    apiClient.comment(id, commentText).catch(() => {
      /* best effort */
    });
    setCommentText('');
  }, [commentText, id]);

  const handleChapterClick = useCallback((chapter: Chapter) => {
    setActiveChapter(chapter.id);
  }, []);

  if (videoLoading)
    return (
      <div className="min-h-screen bg-[var(--quant-background)] flex items-center justify-center">
        <LoadingState variant="skeleton" text="Loading video..." />
      </div>
    );
  if (videoError)
    return (
      <div className="min-h-screen bg-[var(--quant-background)] flex items-center justify-center">
        <ErrorState message={videoError.message} onRetry={() => void refetchVideo()} />
      </div>
    );
  if (!video)
    return (
      <div className="min-h-screen bg-[var(--quant-background)] flex items-center justify-center">
        <EmptyState title="Video not found" description="This video may have been removed" />
      </div>
    );

  const v = video as {
    id: string;
    title?: string;
    description?: string;
    url?: string;
    thumbnailUrl?: string;
    views?: number;
    likes?: number;
    dislikes?: number;
    publishedAt?: string;
    channelName?: string;
    channelAvatar?: string;
    channelId?: string;
    subscriberCount?: number;
    chapters?: Chapter[];
    duration?: number;
  };

  const chapters: Chapter[] = v.chapters && v.chapters.length > 0 ? v.chapters : FALLBACK_CHAPTERS;
  const commentList: CommentItem[] = (comments ?? []) as CommentItem[];
  const currentLikeCount = likeCount || (v.likes ?? 0);

  return (
    <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <div className="max-w-[1800px] mx-auto flex flex-col lg:flex-row gap-6 p-4 md:p-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Video Player */}
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
            <video
              ref={videoRef}
              src={v.url}
              poster={v.thumbnailUrl}
              controls
              className="w-full h-full object-contain"
              aria-label={v.title}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setDuration(d);
              }}
              onTimeUpdate={handleTimeUpdate}
            />
            {/* Quality selector overlay */}
            <div className="absolute top-3 right-3">
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className="px-3 py-1.5 bg-black/70 text-white text-xs font-medium rounded-lg hover:bg-black/90 min-h-[44px] min-w-[44px] flex items-center gap-1"
                >
                  {quality} &#x2699;
                </button>
                <AnimatePresence>
                  {showQualityMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 w-28 z-50"
                    >
                      {QUALITIES.map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            setQuality(q);
                            setShowQualityMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm min-h-[44px] ${quality === q ? 'text-blue-400 font-medium' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}
                        >
                          {q}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Video info */}
          <div className="mt-4">
            <h1 className="text-xl font-bold text-[var(--quant-foreground)]">
              {v.title || 'Untitled Video'}
            </h1>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-3 gap-3">
              <div className="text-sm text-[var(--quant-muted-foreground)]">
                {formatViews(v.views || 0)} &middot; {v.publishedAt || 'Just now'}
              </div>
              <div className="flex items-center gap-2">
                {/* Like/Dislike */}
                <div className="flex items-center bg-[var(--quant-muted)] rounded-full overflow-hidden">
                  <SpringButton
                    onClick={handleLike}
                    className={`min-h-[44px] px-4 py-2 flex items-center gap-1.5 text-sm font-medium border-r border-[var(--quant-border)] ${isLiked ? 'text-blue-500' : 'text-[var(--quant-foreground)] hover:bg-[var(--quant-border)]'}`}
                  >
                    <span>{isLiked ? '\uD83D\uDC4D' : '\uD83D\uDC4D'}</span>
                    <span>{formatCount(currentLikeCount)}</span>
                  </SpringButton>
                  <SpringButton
                    onClick={handleDislike}
                    className={`min-h-[44px] px-4 py-2 flex items-center text-sm ${isDisliked ? 'text-blue-500' : 'text-[var(--quant-foreground)] hover:bg-[var(--quant-border)]'}`}
                  >
                    <span>\uD83D\uDC4E</span>
                  </SpringButton>
                </div>
                {/* Share */}
                <SpringButton className="min-h-[44px] px-4 py-2 bg-[var(--quant-muted)] rounded-full text-sm font-medium text-[var(--quant-foreground)] hover:bg-[var(--quant-border)]">
                  Share
                </SpringButton>
                {/* Save */}
                <SpringButton className="min-h-[44px] px-4 py-2 bg-[var(--quant-muted)] rounded-full text-sm font-medium text-[var(--quant-foreground)] hover:bg-[var(--quant-border)]">
                  Save
                </SpringButton>
              </div>
            </div>
          </div>

          {/* Channel info */}
          <div className="flex items-center justify-between mt-4 py-3 border-b border-[var(--quant-border)]">
            <div className="flex items-center gap-3">
              <img
                src={v.channelAvatar || '/avatars/default.jpg'}
                alt={v.channelName || 'Channel'}
                className="w-10 h-10 rounded-full object-cover cursor-pointer"
                onClick={() => v.channelId && (window.location.href = `/channel/${v.channelId}`)}
              />
              <div>
                <p
                  className="text-sm font-semibold text-[var(--quant-foreground)] cursor-pointer hover:underline"
                  onClick={() => v.channelId && (window.location.href = `/channel/${v.channelId}`)}
                >
                  {v.channelName || 'Unknown Channel'}
                </p>
                <p className="text-xs text-[var(--quant-muted-foreground)]">
                  {formatCount(v.subscriberCount || 0)} subscribers
                </p>
              </div>
            </div>
            <SpringButton
              onClick={handleSubscribe}
              className={`min-h-[44px] px-5 py-2 rounded-full text-sm font-bold transition-colors ${
                isSubscribed
                  ? 'bg-[var(--quant-muted)] text-[var(--quant-foreground)] hover:bg-[var(--quant-border)]'
                  : 'bg-[var(--quant-foreground)] text-[var(--quant-background)] hover:opacity-90'
              }`}
            >
              {isSubscribed ? 'Subscribed' : 'Subscribe'}
            </SpringButton>
          </div>

          {/* Description */}
          <div
            className="mt-4 p-3 rounded-xl bg-[var(--quant-muted)] cursor-pointer"
            onClick={() => setIsDescExpanded(!isDescExpanded)}
          >
            <p
              className={`text-sm text-[var(--quant-foreground)] whitespace-pre-wrap ${isDescExpanded ? '' : 'line-clamp-3'}`}
            >
              {v.description || 'No description available.'}
            </p>
            <button className="text-sm font-medium text-[var(--quant-foreground)] mt-2 hover:underline">
              {isDescExpanded ? 'Show less' : 'Show more'}
            </button>
          </div>

          {/* Comments Section */}
          <div className="mt-6">
            <h3 className="text-lg font-bold text-[var(--quant-foreground)] mb-4">
              {commentList.length} Comments
            </h3>
            {/* Comment input */}
            <div className="flex items-start gap-3 mb-6">
              <div className="w-8 h-8 rounded-full bg-[var(--quant-muted)] flex-shrink-0" />
              <div className="flex-1">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full px-0 py-2 bg-transparent border-b border-[var(--quant-border)] text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--quant-foreground)] resize-none min-h-[44px]"
                  rows={1}
                />
                {commentText.trim() && (
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => setCommentText('')}
                      className="min-h-[44px] px-4 py-2 text-sm font-medium text-[var(--quant-foreground)] rounded-full hover:bg-[var(--quant-muted)]"
                    >
                      Cancel
                    </button>
                    <SpringButton
                      onClick={handleComment}
                      className="min-h-[44px] px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-full hover:bg-blue-700"
                    >
                      Comment
                    </SpringButton>
                  </div>
                )}
              </div>
            </div>
            {/* Comment list */}
            {commentsLoading && (
              <LoadingState variant="dots" text="Loading comments..." size="sm" />
            )}
            {commentsError && <p className="text-sm text-red-500">Could not load comments</p>}
            <div className="space-y-4">
              {commentList.map((comment) => (
                <div key={comment.id} className="flex items-start gap-3">
                  <img
                    src={comment.avatar || '/avatars/default.jpg'}
                    alt={comment.username || 'User'}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--quant-foreground)]">
                        {comment.username || 'Anonymous'}
                      </span>
                      <span className="text-xs text-[var(--quant-muted-foreground)]">
                        {comment.timestamp || ''}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--quant-foreground)] mt-0.5">{comment.text}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <button className="min-h-[44px] text-xs text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] flex items-center gap-1">
                        <span>\uD83D\uDC4D</span>
                        <span>{comment.likes || 0}</span>
                      </button>
                      <button className="min-h-[44px] text-xs text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]">
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar - Chapters + Recommendations */}
        <aside className="w-full lg:w-[380px] flex-shrink-0">
          {/* Smart Skip (server skip-plan + "teach me X") */}
          <div className="mb-6 p-3 rounded-xl bg-[var(--quant-muted)]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-[var(--quant-foreground)]">Smart Skip</h3>
              <label className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSkip}
                  onChange={(e) => setAutoSkip(e.target.checked)}
                  className="accent-[var(--brand-primary)] min-h-[20px] min-w-[20px]"
                  aria-label="Auto-skip non-content segments"
                />
                Auto-skip
              </label>
            </div>
            {skipPlan ? (
              <>
                <p className="text-xs text-[var(--quant-muted-foreground)]">
                  Skipping {skipPlan.skipKinds.join(', ') || 'nothing'} &middot;{' '}
                  {formatDuration(Math.round(skipPlan.skippedSec))} saved
                </p>
                {manualSkipTarget != null && (
                  <SpringButton
                    onClick={() => seek(manualSkipTarget)}
                    className="mt-2 min-h-[44px] px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-full hover:bg-blue-700"
                  >
                    Skip to {formatDuration(Math.round(manualSkipTarget))} &#x23ED;
                  </SpringButton>
                )}
              </>
            ) : (
              <p className="text-xs text-[var(--quant-muted-foreground)]">
                No skip data for this video yet.
              </p>
            )}

            {/* "Teach me X" topic jumps */}
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <input
                  value={topicQuery}
                  onChange={(e) => setTopicQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTopicSearch();
                  }}
                  placeholder="Teach me&hellip; (e.g. deployment)"
                  className="flex-1 px-3 py-2 text-sm bg-[var(--quant-background)] border border-[var(--quant-border)] rounded-lg text-[var(--quant-foreground)] focus:outline-none focus:border-[var(--quant-foreground)] min-h-[44px]"
                  aria-label="Jump to a topic"
                />
                <SpringButton
                  onClick={handleTopicSearch}
                  className="min-h-[44px] px-3 py-2 text-sm font-medium bg-[var(--quant-background)] rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-border)]"
                >
                  Find
                </SpringButton>
              </div>
              {topicJumps.length > 0 && (
                <div className="mt-2 space-y-1">
                  {topicJumps.map((jump) => (
                    <button
                      key={jump.segmentId}
                      onClick={() => seek(topicJumpTarget(jump))}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors min-h-[44px] hover:bg-[var(--quant-border)] text-[var(--quant-foreground)]"
                    >
                      <span className="text-xs font-mono text-[var(--quant-muted-foreground)] w-12 flex-shrink-0">
                        {formatDuration(Math.round(jump.startSec))}
                      </span>
                      <span className="text-sm truncate">{jump.label || jump.kind}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chapters */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-[var(--quant-foreground)] mb-3">Chapters</h3>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {chapters.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => handleChapterClick(ch)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors min-h-[44px] ${
                    activeChapter === ch.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'hover:bg-[var(--quant-muted)] text-[var(--quant-foreground)]'
                  }`}
                >
                  <span className="text-xs font-mono text-[var(--quant-muted-foreground)] w-12 flex-shrink-0">
                    {formatDuration(ch.startTime)}
                  </span>
                  <span className="text-sm truncate">{ch.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <h3 className="text-sm font-bold text-[var(--quant-foreground)] mb-3">Recommended</h3>
            <div className="space-y-3">
              {FALLBACK_RECOMMENDATIONS.map((rec) => (
                <div
                  key={rec.id}
                  className="flex gap-2 cursor-pointer group"
                  onClick={() => {
                    window.location.href = `/watch/${rec.id}`;
                  }}
                >
                  <div className="relative w-40 flex-shrink-0 rounded-lg overflow-hidden">
                    <img
                      src={rec.thumbnail}
                      alt={rec.title}
                      className="w-full aspect-video object-cover group-hover:opacity-80 transition"
                    />
                    <span className="absolute bottom-1 right-1 text-xs bg-black/80 text-white px-1 py-0.5 rounded">
                      {formatDuration(rec.duration)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-[var(--quant-foreground)] line-clamp-2">
                      {rec.title}
                    </h4>
                    <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                      {rec.channelName}
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      {formatViews(rec.views)} &middot; {rec.publishedAt}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default WatchPage;
