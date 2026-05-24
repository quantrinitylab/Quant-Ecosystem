// ============================================================================
// QuantMax - Video Chat Page (Omegle-style random video chat)
// ============================================================================

import type { VideoChat, VideoChatPreferences, VideoChatStatus } from '../types';

interface VideoChatPageProps {
  status: VideoChatStatus;
  session: VideoChat | null;
  localStream: boolean;
  remoteStream: boolean;
  textMessages: { userId: string; content: string; timestamp: string }[];
  onStart: (preferences: VideoChatPreferences) => void;
  onSkip: () => void;
  onEnd: () => void;
  onSendMessage: (content: string) => void;
  onReport: (reason: string) => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
}

export function VideoChatPage({ status, session, localStream, remoteStream, textMessages, onStart, onSkip, onEnd, onSendMessage, onReport, onToggleCamera, onToggleMic }: VideoChatPageProps) {
  return {
    type: 'div',
    className: 'videochat-page',
    children: [
      status === 'searching' ? { type: 'div', className: 'searching-overlay', children: [
        { type: 'div', className: 'spinner' },
        { type: 'h2', text: 'Finding someone to chat with...' },
        { type: 'button', text: 'Cancel', onClick: onEnd },
      ]} : null,
      { type: 'div', className: 'video-grid', children: [
        { type: 'div', className: 'remote-video', children: [
          remoteStream ? { type: 'video', className: 'video-element', autoPlay: true } : { type: 'div', className: 'no-video', children: [{ type: 'span', text: 'Waiting for connection...' }] },
        ]},
        { type: 'div', className: 'local-video', children: [
          localStream ? { type: 'video', className: 'video-element mirror', autoPlay: true, muted: true } : null,
        ]},
      ]},
      session?.matchedInterests && session.matchedInterests.length > 0 ? { type: 'div', className: 'shared-interests', children: [
        { type: 'span', text: 'Shared interests: ' },
        ...session.matchedInterests.map(i => ({ type: 'span', className: 'interest-pill', text: i })),
      ]} : null,
      // Text chat fallback
      session?.hasTextFallback ? { type: 'div', className: 'text-chat', children: [
        { type: 'div', className: 'messages', children: textMessages.map(msg => ({
          type: 'div', className: 'message', children: [{ type: 'span', text: msg.content }],
        }))},
        { type: 'div', className: 'input-area', children: [
          { type: 'input', placeholder: 'Type a message...', className: 'chat-input' },
          { type: 'button', text: 'Send', onClick: () => onSendMessage('') },
        ]},
      ]} : null,
      // Controls
      { type: 'div', className: 'controls', children: [
        { type: 'button', text: 'Camera', onClick: onToggleCamera, className: 'control-btn' },
        { type: 'button', text: 'Mic', onClick: onToggleMic, className: 'control-btn' },
        status === 'connected' ? { type: 'button', text: 'Skip', onClick: onSkip, className: 'control-btn skip' } : null,
        { type: 'button', text: 'End', onClick: onEnd, className: 'control-btn end' },
        { type: 'button', text: 'Report', onClick: () => onReport('inappropriate'), className: 'control-btn report' },
      ]},
    ],
  };
}

export default VideoChatPage;
