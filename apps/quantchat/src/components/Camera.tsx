// ============================================================================
// QuantChat - Camera Component
// Camera component with AR overlay, capture controls
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import type { ARFilter } from '../types';

interface CameraProps {
  onCapture: (mediaUrl: string, type: 'photo' | 'video') => void;
  onClose: () => void;
  selectedFilter?: ARFilter | null;
  mode?: 'snap' | 'story' | 'profile';
}

export const Camera: React.FC<CameraProps> = ({ onCapture, onClose, selectedFilter, mode = 'snap' }) => {
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [flash, setFlash] = useState(false);
  const [zoom, setZoom] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleTakePhoto = () => {
    const url = `https://media.quant.chat/capture_${Date.now()}.jpg`;
    onCapture(url, 'photo');
  };

  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= 60) {
          handleStopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const url = `https://media.quant.chat/capture_${Date.now()}.mp4`;
    onCapture(url, 'video');
  };

  const handleFlip = () => {
    setFacing(facing === 'user' ? 'environment' : 'user');
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.max(1, Math.min(5, prev + delta)));
  };

  return (
    <div className="camera-component">
      {/* Viewfinder */}
      <div className="viewfinder" style={{ transform: `scale(${zoom})` }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`camera-preview ${facing === 'user' ? 'mirrored' : ''}`}
        />

        {/* AR Filter Overlay */}
        {selectedFilter && (
          <div className="ar-overlay">
            <img src={selectedFilter.previewUrl} alt={selectedFilter.name} className="filter-overlay-image" />
            <span className="filter-label">{selectedFilter.name}</span>
          </div>
        )}

        {/* Grid lines */}
        <div className="grid-overlay">
          <div className="grid-line horizontal" style={{ top: '33%' }} />
          <div className="grid-line horizontal" style={{ top: '66%' }} />
          <div className="grid-line vertical" style={{ left: '33%' }} />
          <div className="grid-line vertical" style={{ left: '66%' }} />
        </div>

        {/* Recording indicator */}
        {isRecording && (
          <div className="recording-badge">
            <span className="rec-dot" />
            <span>{formatRecordingTime(recordingTime)}</span>
          </div>
        )}
      </div>

      {/* Top controls */}
      <div className="camera-top-bar">
        <button className="cam-btn close" onClick={onClose}>✕</button>
        <button className="cam-btn flash" onClick={() => setFlash(!flash)}>
          {flash ? '⚡' : '⚡'}
        </button>
        <button className="cam-btn flip" onClick={handleFlip}>🔄</button>
        <button className="cam-btn zoom-in" onClick={() => handleZoom(0.5)}>+</button>
        <button className="cam-btn zoom-out" onClick={() => handleZoom(-0.5)}>-</button>
      </div>

      {/* Capture controls */}
      <div className="camera-bottom-bar">
        <div className="mode-label">{mode.toUpperCase()}</div>
        <button
          className={`shutter-btn ${isRecording ? 'recording' : ''}`}
          onClick={isRecording ? handleStopRecording : handleTakePhoto}
          onPointerDown={() => {
            // Long press starts video
            const timeout = setTimeout(handleStartRecording, 500);
            const cleanup = () => { clearTimeout(timeout); document.removeEventListener('pointerup', cleanup); };
            document.addEventListener('pointerup', cleanup);
          }}
        >
          <div className="shutter-inner" />
        </button>
        <div className="zoom-indicator">{zoom.toFixed(1)}x</div>
      </div>
    </div>
  );
};

function formatRecordingTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default Camera;
