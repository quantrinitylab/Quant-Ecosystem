// ============================================================================
// QuantMax - Video Feed Page (TikTok-style full-screen swipe)
// ============================================================================

import type { ShortVideo } from '../types';

interface FeedPageProps {
  videos: ShortVideo[];
  currentIndex: number;
  onSwipeUp: () => void;
  onSwipeDown: () => void;
  onLike: (videoId: string) => void;
  onComment: (videoId: string) => void;
  onShare: (videoId: string) => void;
  onFollow: (creatorId: string) => void;
}

export function FeedPage({ videos, currentIndex, onSwipeUp, onSwipeDown, onLike, onComment, onShare, onFollow }: FeedPageProps) {
  const currentVideo = videos[currentIndex];
  if (!currentVideo) return { type: 'div', className: 'feed-empty', children: [{ type: 'p', text: 'No videos available' }] };

  return {
    type: 'div',
    className: 'feed-container full-screen',
    children: [
      { type: 'div', className: 'video-player', children: [
        { type: 'video', src: currentVideo.videoUrl, autoPlay: true, loop: true, className: 'full-screen-video' },
        { type: 'div', className: 'video-overlay', children: [
          // Creator info
          { type: 'div', className: 'video-info-bottom', children: [
            { type: 'div', className: 'creator-info', children: [
              { type: 'img', src: currentVideo.creator.avatarUrl, className: 'avatar' },
              { type: 'span', text: `@${currentVideo.creator.username}`, className: 'username' },
              { type: 'button', text: 'Follow', onClick: () => onFollow(currentVideo.creatorId), className: 'follow-btn' },
            ]},
            { type: 'p', text: currentVideo.caption, className: 'caption' },
            { type: 'div', className: 'hashtags', children: currentVideo.hashtags.map(tag => ({ type: 'span', text: `#${tag}`, className: 'hashtag' })) },
            { type: 'div', className: 'sound-info', children: [
              { type: 'span', className: 'music-icon', text: 'M' },
              { type: 'span', text: `${currentVideo.sound.name} - ${currentVideo.sound.artistName}` },
            ]},
          ]},
          // Action buttons
          { type: 'div', className: 'action-buttons', children: [
            { type: 'button', className: `action-btn ${currentVideo.isLiked ? 'liked' : ''}`, onClick: () => onLike(currentVideo.id), children: [
              { type: 'span', className: 'icon-heart' },
              { type: 'span', text: String(currentVideo.likes) },
            ]},
            { type: 'button', className: 'action-btn', onClick: () => onComment(currentVideo.id), children: [
              { type: 'span', className: 'icon-comment' },
              { type: 'span', text: String(currentVideo.comments) },
            ]},
            { type: 'button', className: 'action-btn', onClick: () => onShare(currentVideo.id), children: [
              { type: 'span', className: 'icon-share' },
              { type: 'span', text: String(currentVideo.shares) },
            ]},
          ]},
        ]},
      ]},
      // Navigation dots
      { type: 'div', className: 'nav-tabs', children: [
        { type: 'button', text: 'Following', className: 'tab' },
        { type: 'button', text: 'For You', className: 'tab active' },
      ]},
    ],
  };
}

export default FeedPage;
