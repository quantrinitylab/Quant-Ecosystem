// ============================================================================
// QuantMax - Live Page
// ============================================================================

import type { LiveEvent } from '../types';

interface LivePageProps {
  liveStreams: LiveEvent[];
  isStreaming: boolean;
  currentStream: LiveEvent | null;
  onGoLive: (title: string, type: string) => void;
  onJoinStream: (streamId: string) => void;
  onEndStream: () => void;
}

export function LivePage({ liveStreams, isStreaming, currentStream, onGoLive, onJoinStream, onEndStream }: LivePageProps) {
  return {
    type: 'div',
    className: 'live-page',
    children: [
      { type: 'header', children: [
        { type: 'h1', text: 'Live' },
        { type: 'button', text: 'Go Live', onClick: () => onGoLive('My Stream', 'solo'), className: 'btn-live' },
      ]},
      isStreaming && currentStream ? { type: 'div', className: 'my-stream', children: [
        { type: 'video', className: 'stream-video', autoPlay: true },
        { type: 'div', className: 'stream-info', children: [
          { type: 'span', text: `${currentStream.viewerCount} viewers` },
          { type: 'button', text: 'End', onClick: onEndStream },
        ]},
      ]} : null,
      { type: 'div', className: 'live-grid', children: liveStreams.map(stream => ({
        type: 'div', className: 'live-card', onClick: () => onJoinStream(stream.id), children: [
          { type: 'img', src: stream.thumbnailUrl },
          { type: 'div', className: 'live-badge', text: 'LIVE' },
          { type: 'h3', text: stream.title },
          { type: 'span', text: `${stream.viewerCount} watching` },
        ],
      }))},
    ],
  };
}

export default LivePage;
