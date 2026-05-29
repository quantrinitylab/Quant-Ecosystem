// ============================================================================
// QuantChat - Spotlight Page
// Short video feed: vertical swipe, like/comment/share, trending sounds
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';

interface SpotlightVideo {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  creator: { id: string; name: string; username: string; avatarUrl: string; isFollowed: boolean };
  caption: string;
  sound: { id: string; name: string; artist: string };
  likes: number;
  comments: number;
  shares: number;
  views: number;
  isLiked: boolean;
  isBookmarked: boolean;
  duration: number;
  createdAt: string;
  tags: string[];
}
interface SpotlightComment {
  id: string;
  author: { name: string; avatarUrl: string };
  text: string;
  likes: number;
  createdAt: string;
  isLiked: boolean;
}
interface SpotlightPageProps {
  userId?: string;
}

export const SpotlightPage: React.FC<SpotlightPageProps> = ({ userId }) => {
  const [videos, setVideos] = useState<SpotlightVideo[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showComments, setShowComments] = useState<boolean>(false);
  const [comments, setComments] = useState<SpotlightComment[]>([]);
  const [newComment, setNewComment] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showSubmit, setShowSubmit] = useState<boolean>(false);
  const [showSoundInfo, setShowSoundInfo] = useState<boolean>(false);
  const [loadingComments, setLoadingComments] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/spotlight/feed?limit=20', {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) throw new Error('Failed to load spotlight');
      const data = await response.json();
      setVideos(data.videos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const currentVideo = videos[currentIndex];

  const handleSwipeUp = useCallback(() => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex((i) => i + 1);
      setIsPlaying(true);
      setShowComments(false);
    }
    if (currentIndex >= videos.length - 3) {
      /* Load more */
    }
  }, [currentIndex, videos.length]);

  const handleSwipeDown = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setIsPlaying(true);
      setShowComments(false);
    }
  }, [currentIndex]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const diff = touchStartY.current - e.changedTouches[0].clientY;
      if (Math.abs(diff) > 50) {
        diff > 0 ? handleSwipeUp() : handleSwipeDown();
      }
    },
    [handleSwipeUp, handleSwipeDown],
  );

  const handleLike = useCallback(async () => {
    if (!currentVideo) return;
    setVideos((prev) =>
      prev.map((v, i) =>
        i === currentIndex
          ? { ...v, isLiked: !v.isLiked, likes: v.isLiked ? v.likes - 1 : v.likes + 1 }
          : v,
      ),
    );
    try {
      await fetch(`/api/spotlight/${currentVideo.id}/like`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      });
    } catch {
      /* optimistic */
    }
  }, [currentVideo, currentIndex]);

  const handleBookmark = useCallback(async () => {
    if (!currentVideo) return;
    setVideos((prev) =>
      prev.map((v, i) => (i === currentIndex ? { ...v, isBookmarked: !v.isBookmarked } : v)),
    );
    try {
      await fetch(`/api/spotlight/${currentVideo.id}/bookmark`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      });
    } catch {
      /* optimistic */
    }
  }, [currentVideo, currentIndex]);

  const handleFollow = useCallback(async () => {
    if (!currentVideo) return;
    setVideos((prev) =>
      prev.map((v, i) =>
        i === currentIndex
          ? { ...v, creator: { ...v.creator, isFollowed: !v.creator.isFollowed } }
          : v,
      ),
    );
    try {
      await fetch(`/api/users/${currentVideo.creator.id}/follow`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      });
    } catch {
      /* optimistic */
    }
  }, [currentVideo, currentIndex]);

  const handleShare = useCallback(async () => {
    if (!currentVideo) return;
    if (navigator.share) {
      await navigator.share({ title: currentVideo.caption, url: `/spotlight/${currentVideo.id}` });
    } else {
      navigator.clipboard.writeText(`https://quantchat.io/spotlight/${currentVideo.id}`);
    }
    setVideos((prev) =>
      prev.map((v, i) => (i === currentIndex ? { ...v, shares: v.shares + 1 } : v)),
    );
  }, [currentVideo, currentIndex]);

  const loadComments = useCallback(async () => {
    if (!currentVideo) return;
    setLoadingComments(true);
    try {
      const response = await fetch(`/api/spotlight/${currentVideo.id}/comments`, {
        headers: { ...getAuthHeaders() },
      });
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingComments(false);
    }
  }, [currentVideo]);

  const handlePostComment = useCallback(async () => {
    if (!currentVideo || !newComment.trim()) return;
    try {
      const response = await fetch(`/api/spotlight/${currentVideo.id}/comments`, {
        method: 'POST',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ text: newComment }),
      });
      if (response.ok) {
        const comment = await response.json();
        setComments((prev) => [comment, ...prev]);
        setNewComment('');
        setVideos((prev) =>
          prev.map((v, i) => (i === currentIndex ? { ...v, comments: v.comments + 1 } : v)),
        );
      }
    } catch {
      /* ignore */
    }
  }, [currentVideo, newComment, currentIndex]);

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      isPlaying ? videoRef.current.pause() : videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const formatCount = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  if (loading)
    return (
      <div className="spotlight-loading">
        <div className="spinner">Loading Spotlight...</div>
      </div>
    );
  if (error)
    return (
      <div className="spotlight-error">
        <h2>Spotlight Error</h2>
        <p>{error}</p>
        <button onClick={fetchVideos}>Retry</button>
      </div>
    );
  if (!currentVideo)
    return (
      <div className="spotlight-empty">
        <h2>No Videos</h2>
        <p>Be the first to post on Spotlight!</p>
        <button onClick={() => setShowSubmit(true)}>Submit Video</button>
      </div>
    );

  return (
    <div
      className="spotlight-page"
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="video-player" onClick={togglePlay}>
        <video
          ref={videoRef}
          src={currentVideo.videoUrl}
          poster={currentVideo.thumbnailUrl}
          loop
          autoPlay
          playsInline
          muted={false}
          className="spotlight-video"
        />
        {!isPlaying && (
          <div className="play-overlay">
            <span className="play-icon">\u25B6</span>
          </div>
        )}
        <div className="video-gradient-top"></div>
        <div className="video-gradient-bottom"></div>
      </div>

      <div className="video-info">
        <div className="creator-info">
          <img src={currentVideo.creator.avatarUrl} alt="" className="creator-avatar" />
          <span className="creator-name">@{currentVideo.creator.username}</span>
          {!currentVideo.creator.isFollowed && (
            <button onClick={handleFollow} className="follow-btn">
              Follow
            </button>
          )}
        </div>
        <p className="video-caption">{currentVideo.caption}</p>
        {currentVideo.tags.length > 0 && (
          <div className="video-tags">
            {currentVideo.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
        )}
        <div className="sound-info" onClick={() => setShowSoundInfo(true)}>
          <span className="sound-icon">{'\u{1F3B5}'}</span>
          <span className="sound-name">
            {currentVideo.sound.name} - {currentVideo.sound.artist}
          </span>
        </div>
      </div>

      <div className="action-buttons">
        <button
          onClick={handleLike}
          className={`action-btn ${currentVideo.isLiked ? 'liked' : ''}`}
        >
          <span className="action-icon">{currentVideo.isLiked ? '\u2764\uFE0F' : '\u{1F90D}'}</span>
          <span className="action-count">{formatCount(currentVideo.likes)}</span>
        </button>
        <button
          onClick={() => {
            setShowComments(true);
            loadComments();
          }}
          className="action-btn"
        >
          <span className="action-icon">{'\u{1F4AC}'}</span>
          <span className="action-count">{formatCount(currentVideo.comments)}</span>
        </button>
        <button onClick={handleShare} className="action-btn">
          <span className="action-icon">{'\u{1F4E4}'}</span>
          <span className="action-count">{formatCount(currentVideo.shares)}</span>
        </button>
        <button
          onClick={handleBookmark}
          className={`action-btn ${currentVideo.isBookmarked ? 'bookmarked' : ''}`}
        >
          <span className="action-icon">
            {currentVideo.isBookmarked ? '\u{1F516}' : '\u{1F3F7}'}
          </span>
        </button>
      </div>

      <div className="nav-indicators">
        <button onClick={handleSwipeDown} disabled={currentIndex === 0} className="nav-up">
          \u25B2
        </button>
        <span className="position-indicator">
          {currentIndex + 1}/{videos.length}
        </span>
        <button
          onClick={handleSwipeUp}
          disabled={currentIndex === videos.length - 1}
          className="nav-down"
        >
          \u25BC
        </button>
      </div>

      {showComments && (
        <div className="comments-panel">
          <div className="comments-header">
            <h3>Comments ({currentVideo.comments})</h3>
            <button onClick={() => setShowComments(false)}>\u2715</button>
          </div>
          <div className="comments-list">
            {loadingComments ? (
              <div className="loading">Loading...</div>
            ) : comments.length === 0 ? (
              <p className="no-comments">No comments yet. Be the first!</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="comment-item">
                  <img src={c.author.avatarUrl} alt="" className="comment-avatar" />
                  <div className="comment-body">
                    <span className="comment-author">{c.author.name}</span>
                    <p className="comment-text">{c.text}</p>
                    <span className="comment-time">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button className="comment-like">
                    {c.isLiked ? '\u2764\uFE0F' : '\u{1F90D}'} {c.likes}
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="comment-input">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePostComment();
              }}
            />
            <button onClick={handlePostComment} disabled={!newComment.trim()}>
              Post
            </button>
          </div>
        </div>
      )}

      {showSubmit && (
        <div className="modal-overlay" onClick={() => setShowSubmit(false)}>
          <div className="submit-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Submit to Spotlight</h2>
            <p>Share your best videos with the world. Videos must be 5-60 seconds.</p>
            <input type="file" accept="video/*" />
            <input type="text" placeholder="Caption..." />
            <button className="submit-btn">Submit</button>
            <button onClick={() => setShowSubmit(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpotlightPage;
