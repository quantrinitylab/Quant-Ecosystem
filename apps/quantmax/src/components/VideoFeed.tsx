// ============================================================================
// QuantMax - Video Feed Component
// Full-screen video scroller with engagement actions
// ============================================================================

import type { ShortVideo } from '../types';

interface VideoFeedProps {
  videos: ShortVideo[];
  activeIndex: number;
  onScroll: (direction: 'up' | 'down') => void;
  onDoubleTap: (videoId: string) => void;
  onLongPress: (videoId: string) => void;
}

export function VideoFeed({ videos, activeIndex, onScroll, onDoubleTap, onLongPress }: VideoFeedProps) {
  return {
    type: 'div',
    className: 'video-feed-container',
    children: videos.map((video, index) => ({
      type: 'div',
      className: `feed-item ${index === activeIndex ? 'active' : 'hidden'}`,
      children: [
        { type: 'video', src: video.videoUrl, loop: true, autoPlay: index === activeIndex, muted: index !== activeIndex, className: 'feed-video' },
        { type: 'div', className: 'feed-info', children: [
          { type: 'span', text: `@${video.creator.username}`, className: 'creator' },
          { type: 'p', text: video.caption, className: 'caption' },
          { type: 'div', className: 'sound-bar', children: [
            { type: 'span', className: 'music-note' },
            { type: 'span', text: video.sound.name, className: 'sound-name' },
          ]},
        ]},
        { type: 'div', className: 'engagement', children: [
          { type: 'div', className: 'engagement-btn', children: [{ type: 'span', text: 'H' }, { type: 'span', text: String(video.likes) }] },
          { type: 'div', className: 'engagement-btn', children: [{ type: 'span', text: 'C' }, { type: 'span', text: String(video.comments) }] },
          { type: 'div', className: 'engagement-btn', children: [{ type: 'span', text: 'S' }, { type: 'span', text: String(video.shares) }] },
        ]},
        { type: 'div', className: 'progress-bar', children: [{ type: 'div', className: 'progress' }] },
      ],
    })),
  };
}

export default VideoFeed;
