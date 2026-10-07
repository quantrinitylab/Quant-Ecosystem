// ============================================================================
// QuantChat - VideoCall Component
// Video call UI with controls, screen share, participant grid
// ============================================================================

import React, { useState, useEffect } from 'react';
import type { Call, CallParticipant } from '../types';
import { apiClient } from '../services/api-client';

interface VideoCallProps {
  callId: string;
  currentUserId: string;
  onEnd: () => void;
}

export const VideoCall: React.FC<VideoCallProps> = ({ callId, currentUserId, onEnd }) => {
  const [call, setCall] = useState<Call | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [layout, setLayout] = useState<'grid' | 'spotlight'>('grid');

  useEffect(() => {
    loadCall();
    const timer = setInterval(() => setDuration(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [callId]);

  const loadCall = async () => {
    const response = await apiClient.getCallHistory();
    if (response.success && response.data) {
      const found = response.data.find(c => c.callId === callId);
      if (found) setCall(found);
    }
  };

  const handleToggleMute = async () => {
    setIsMuted(!isMuted);
  };

  const handleToggleVideo = async () => {
    setIsVideoOn(!isVideoOn);
  };

  const handleScreenShare = async () => {
    setIsScreenSharing(!isScreenSharing);
  };

  const handleEndCall = async () => {
    await apiClient.endCall(callId);
    onEnd();
  };

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const participants = call?.participants || [];
  const otherParticipants = participants.filter(p => p.userId !== currentUserId);

  return (
    <div className="video-call-container">
      {/* Call header */}
      <div className="call-header">
        <div className="call-info">
          <span className="call-duration">{formatDuration(duration)}</span>
          {call?.isRecording && <span className="recording-indicator">● REC</span>}
        </div>
        <div className="call-quality">
          <span className="quality-indicator">HD</span>
        </div>
      </div>

      {/* Video grid */}
      <div className={`video-grid ${layout} participants-${otherParticipants.length + 1}`}>
        {/* Self view */}
        <div className={`video-tile self ${layout === 'spotlight' ? 'small' : ''}`}>
          <div className="video-placeholder">
            {isVideoOn ? (
              <div className="video-feed">You</div>
            ) : (
              <div className="video-off-avatar">{currentUserId.charAt(0).toUpperCase()}</div>
            )}
          </div>
          <div className="tile-label">
            You {isMuted && '🔇'}
          </div>
        </div>

        {/* Other participants */}
        {otherParticipants.map(participant => (
          <div key={participant.userId} className={`video-tile ${layout === 'spotlight' && otherParticipants.indexOf(participant) === 0 ? 'large' : ''}`}>
            <div className="video-placeholder">
              {participant.isVideoEnabled ? (
                <div className="video-feed">{participant.userId}</div>
              ) : (
                <div className="video-off-avatar">{participant.userId.charAt(0).toUpperCase()}</div>
              )}
            </div>
            <div className="tile-label">
              {participant.userId} {participant.isMuted && '🔇'} {participant.isScreenSharing && '🖥️'}
            </div>
          </div>
        ))}
      </div>

      {/* Screen share overlay */}
      {isScreenSharing && (
        <div className="screen-share-overlay">
          <div className="screen-share-content">
            <p>Sharing your screen</p>
          </div>
          <button className="stop-share-btn" onClick={handleScreenShare}>
            Stop Sharing
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="call-controls">
        <button
          className={`control-btn ${isMuted ? 'active' : ''}`}
          onClick={handleToggleMute}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>

        <button
          className={`control-btn ${!isVideoOn ? 'active' : ''}`}
          onClick={handleToggleVideo}
          aria-label={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isVideoOn ? '📹' : '📷'}
        </button>

        <button
          className={`control-btn ${isScreenSharing ? 'active' : ''}`}
          onClick={handleScreenShare}
          aria-label="Screen share"
        >
          🖥️
        </button>

        <button
          className="control-btn layout-btn"
          onClick={() => setLayout(layout === 'grid' ? 'spotlight' : 'grid')}
          aria-label="Toggle layout"
        >
          {layout === 'grid' ? '▦' : '□'}
        </button>

        <button
          className="control-btn end-call"
          onClick={handleEndCall}
          aria-label="End call"
        >
          📵
        </button>
      </div>
    </div>
  );
};

export default VideoCall;
