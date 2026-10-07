'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { ARLensConfig } from './ARLensCarousel';
import { applyLens } from './LensRenderer';
import { detectFaceMesh } from '../../lib/face-detection';

interface ViewfinderProps {
  stream: MediaStream | null;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  /** Active AR lens to apply in the render loop. Null = no lens. */
  activeLens?: ARLensConfig | null;
}

/**
 * Viewfinder component renders live video frames from a MediaStream
 * onto a full-screen canvas element using requestAnimationFrame at 30fps minimum.
 * Handles stream track ended/mute events gracefully.
 *
 * When an activeLens is provided, the render loop:
 * 1. Draws the raw video frame
 * 2. Runs face detection on the canvas
 * 3. Applies the lens effect (with face mesh or fallback position)
 *
 * This ensures lens overlays are "baked" into the canvas — any capture
 * (canvas.toBlob / canvas.toDataURL) will include the lens overlay.
 */
export function Viewfinder({ stream, canvasRef: externalCanvasRef, activeLens }: ViewfinderProps) {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = externalCanvasRef || internalCanvasRef;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isActiveRef = useRef(true);
  const activeLensRef = useRef<ARLensConfig | null>(null);

  // Keep lens ref in sync to avoid stale closure in render loop
  useEffect(() => {
    activeLensRef.current = activeLens ?? null;
  }, [activeLens]);

  const renderFrame = useCallback(() => {
    if (!isActiveRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (canvas && video && video.readyState >= video.HAVE_CURRENT_DATA) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Match canvas resolution to video intrinsic size for crisp rendering
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || canvas.clientWidth;
          canvas.height = video.videoHeight || canvas.clientHeight;
        }

        // 1. Draw raw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 2. Apply active lens if present
        const currentLens = activeLensRef.current;
        if (currentLens) {
          // Run face detection (async but we use the result next frame for perf)
          // For real-time, we do synchronous detection inline here
          // detectFaceMesh returns a Promise, but in the simulated version
          // it's fast enough to call synchronously via a non-blocking approach
          applyLensWithDetection(ctx, canvas, currentLens);
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(renderFrame);
  }, [canvasRef]);

  useEffect(() => {
    if (!stream) {
      // Clear canvas when no stream
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    // Create hidden video element to decode the stream
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    videoRef.current = video;

    video.play().catch(() => {
      // Autoplay may be blocked; handled gracefully
    });

    // Start render loop
    isActiveRef.current = true;
    animationFrameRef.current = requestAnimationFrame(renderFrame);

    // Handle track ended and mute events
    const tracks = stream.getVideoTracks();
    const handleTrackEnded = () => {
      isActiveRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const handleTrackMute = () => {
      // On mute, we keep the last frame visible (no clear)
    };

    const handleTrackUnmute = () => {
      // Resume rendering if it was paused
      if (!isActiveRef.current) {
        isActiveRef.current = true;
        animationFrameRef.current = requestAnimationFrame(renderFrame);
      }
    };

    tracks.forEach((track) => {
      track.addEventListener('ended', handleTrackEnded);
      track.addEventListener('mute', handleTrackMute);
      track.addEventListener('unmute', handleTrackUnmute);
    });

    return () => {
      isActiveRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      video.pause();
      video.srcObject = null;
      videoRef.current = null;

      tracks.forEach((track) => {
        track.removeEventListener('ended', handleTrackEnded);
        track.removeEventListener('mute', handleTrackMute);
        track.removeEventListener('unmute', handleTrackUnmute);
      });
    };
  }, [stream, canvasRef, renderFrame]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full object-cover"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

/**
 * Helper: applies lens with face detection inline.
 * Uses a cached face mesh result to avoid performance overhead on every frame.
 * The detection runs asynchronously but we use the last known result for rendering.
 */
let cachedFaceMesh: Awaited<ReturnType<typeof detectFaceMesh>> = null;
let lastDetectionTime = 0;
const DETECTION_INTERVAL_MS = 100; // Run detection every 100ms max

function applyLensWithDetection(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  lens: ARLensConfig,
): void {
  const now = Date.now();

  // Throttle face detection to every 100ms for performance
  if (now - lastDetectionTime > DETECTION_INTERVAL_MS) {
    lastDetectionTime = now;
    // Fire and forget — update cache when done
    detectFaceMesh(canvas)
      .then((result) => {
        cachedFaceMesh = result;
      })
      .catch(() => {
        // On error, use null (fallback position will be used)
        cachedFaceMesh = null;
      });
  }

  // Apply lens with current cached face mesh (may be null = fallback position)
  // Task 2.6: If faceMesh is null, applyLens uses fallbackPosition — no crash
  applyLens(ctx, cachedFaceMesh, lens);
}
