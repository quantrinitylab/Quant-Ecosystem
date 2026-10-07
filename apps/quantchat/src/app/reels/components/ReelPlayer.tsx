// ============================================================================
// QuantChat - ReelPlayer Component (Task 3.2)
// Full-screen vertical video player with auto-play/pause via IntersectionObserver
// Accepts video URL (MP4/HLS), shows loading spinner while buffering
// ============================================================================
'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { playbackStateForVisibility } from '../feedLogic';

interface ReelPlayerProps {
  videoUrl: string;
  isActive: boolean;
  onVideoEnd?: () => void;
}

export function ReelPlayer({ videoUrl, isActive, onVideoEnd }: ReelPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  // IntersectionObserver: auto-play when visible, pause when leaving viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsVisible(entry.isIntersecting && entry.intersectionRatio > 0.5);
        }
      },
      { threshold: [0.5] },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Play/pause based on visibility and active state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const playback = playbackStateForVisibility(isVisible && isActive);
    if (playback === 'playing') {
      video.play().catch(() => {
        // Autoplay might be blocked by browser policy - that's ok
      });
    } else {
      video.pause();
    }
  }, [isVisible, isActive]);

  // Handle buffering state
  const handleWaiting = useCallback(() => setIsBuffering(true), []);
  const handlePlaying = useCallback(() => setIsBuffering(false), []);
  const handleCanPlay = useCallback(() => setIsBuffering(false), []);

  const handleEnded = useCallback(() => {
    // Loop by default
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
    onVideoEnd?.();
  }, [onVideoEnd]);

  // Toggle play/pause on tap
  const handleTap = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full bg-black" onClick={handleTap}>
      <video
        ref={videoRef}
        src={videoUrl}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        loop
        preload="auto"
        onWaiting={handleWaiting}
        onPlaying={handlePlaying}
        onCanPlay={handleCanPlay}
        onEnded={handleEnded}
      />

      {/* Loading spinner while buffering */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        </div>
      )}
    </div>
  );
}

export default ReelPlayer;
