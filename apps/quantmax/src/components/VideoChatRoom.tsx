// ============================================================================
// QuantMax - Video Chat Room Component
// Video chat with controls, text fallback, and safety features
// ============================================================================

import type { VideoChat } from '../types';

interface VideoChatRoomProps {
  session: VideoChat;
  isCameraOn: boolean;
  isMicOn: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onSkip: () => void;
  onEnd: () => void;
  onReport: () => void;
  onScreenshot: () => void;
}

export function VideoChatRoom({ session, isCameraOn, isMicOn, onToggleCamera, onToggleMic, onSkip, onEnd, onReport, onScreenshot }: VideoChatRoomProps) {
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return {
    type: 'div',
    className: 'videochat-room',
    children: [
      // Connection info
      { type: 'div', className: 'connection-bar', children: [
        { type: 'span', className: 'status-dot connected' },
        { type: 'span', text: `Connected - ${formatDuration(session.duration)}` },
        session.matchedInterests.length > 0 ? { type: 'span', text: `Common: ${session.matchedInterests.join(', ')}` } : null,
      ]},
      // Video area
      { type: 'div', className: 'video-area', children: [
        { type: 'div', className: 'remote-video-wrapper', children: [
          { type: 'video', className: 'remote-feed', autoPlay: true },
        ]},
        { type: 'div', className: 'local-video-pip', children: [
          isCameraOn ? { type: 'video', className: 'local-feed', autoPlay: true, muted: true } : { type: 'div', className: 'camera-off', text: 'Camera Off' },
        ]},
      ]},
      // Control bar
      { type: 'div', className: 'control-bar', children: [
        { type: 'button', className: `ctrl-btn ${isCameraOn ? '' : 'off'}`, onClick: onToggleCamera, title: 'Toggle Camera', children: [{ type: 'span', text: isCameraOn ? 'CAM' : 'CAM OFF' }] },
        { type: 'button', className: `ctrl-btn ${isMicOn ? '' : 'off'}`, onClick: onToggleMic, title: 'Toggle Mic', children: [{ type: 'span', text: isMicOn ? 'MIC' : 'MUTE' }] },
        { type: 'button', className: 'ctrl-btn skip-btn', onClick: onSkip, title: 'Skip', children: [{ type: 'span', text: 'NEXT' }] },
        { type: 'button', className: 'ctrl-btn end-btn', onClick: onEnd, title: 'End Call', children: [{ type: 'span', text: 'END' }] },
        { type: 'button', className: 'ctrl-btn report-btn', onClick: onReport, title: 'Report', children: [{ type: 'span', text: 'REPORT' }] },
      ]},
    ],
  };
}

export default VideoChatRoom;
