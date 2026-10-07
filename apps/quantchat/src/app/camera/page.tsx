'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@quant/shared-ui';
import { navItems, routes } from '../../lib/navigation';
import { Viewfinder } from './Viewfinder';
import { CaptureButton } from './CaptureButton';
import { CameraControls } from './CameraControls';
import { PermissionDenied } from './PermissionDenied';
import { ARLensCarousel, type ARLensConfig } from './ARLensCarousel';

type PermissionStatus = 'prompt' | 'granted' | 'denied';
type FlashMode = 'off' | 'torch' | 'screen';

/**
 * Camera page with:
 * - getUserMedia initialization requesting video (facingMode: 'user' initially)
 * - Permission handling (prompt -> granted -> render viewfinder; denied -> error state)
 * - Canvas-based viewfinder rendering the live video stream at 30fps minimum
 * - Photo capture, video recording, camera flip, and flash controls
 */
export default function CameraPage() {
  const router = useRouter();

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('prompt');
  const [isFlipping, setIsFlipping] = useState(false);
  const [screenFlashActive, setScreenFlashActive] = useState(false);
  const [activeLens, setActiveLens] = useState<ARLensConfig | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize camera stream
  const initializeCamera = useCallback(
    async (facing: 'user' | 'environment') => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });

        setStream(mediaStream);
        setPermissionStatus('granted');

        // Apply torch constraint if flash mode is torch and rear camera
        if (flashMode === 'torch' && facing === 'environment') {
          const videoTrack = mediaStream.getVideoTracks()[0];
          if (videoTrack) {
            try {
              await videoTrack.applyConstraints({
                // @ts-expect-error — torch is a valid advanced constraint but not in TS types
                advanced: [{ torch: true }],
              });
            } catch {
              // Torch not supported on this device
            }
          }
        }

        return mediaStream;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          setPermissionStatus('denied');
        } else if (error instanceof DOMException && error.name === 'NotFoundError') {
          // No camera — still show denied state gracefully
          setPermissionStatus('denied');
        }
        return null;
      }
    },
    [flashMode],
  );

  // Stop all tracks on current stream
  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Initialize on mount
  useEffect(() => {
    initializeCamera('user');

    return () => {
      // Cleanup on unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  // Flip camera — stop current, request opposite facing, target 500ms
  const handleFlipCamera = useCallback(async () => {
    if (isFlipping) return;
    setIsFlipping(true);

    const newFacing = facingMode === 'user' ? 'environment' : 'user';

    // Stop current stream
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }

    // Request new stream with opposite facing
    const newStream = await initializeCamera(newFacing);
    if (newStream) {
      setFacingMode(newFacing);
    }

    setIsFlipping(false);
  }, [facingMode, stream, isFlipping, initializeCamera]);

  // Flash toggle: off -> torch (rear) -> screen (front) -> off
  const handleToggleFlash = useCallback(async () => {
    const nextModeMap: Record<FlashMode, FlashMode> = {
      off: 'torch',
      torch: 'screen',
      screen: 'off',
    };
    const nextMode = nextModeMap[flashMode];
    setFlashMode(nextMode);

    // Apply torch constraint on rear camera
    if (stream && facingMode === 'environment') {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({
            // @ts-expect-error — torch is a valid advanced constraint
            advanced: [{ torch: nextMode === 'torch' }],
          });
        } catch {
          // Torch not supported
        }
      }
    }
  }, [flashMode, stream, facingMode]);

  // Photo capture handler
  const handlePhotoCaptured = useCallback(
    (blob: Blob) => {
      // If screen flash mode is active on front camera, flash the screen
      if (flashMode === 'screen' && facingMode === 'user') {
        setScreenFlashActive(true);
        setTimeout(() => setScreenFlashActive(false), 200);
      }

      // In a real app, this would save to gallery / upload
      // For now, create a download link as proof of concept
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quantchat-photo-${Date.now()}.jpg`;
      // Don't auto-download, just log
      URL.revokeObjectURL(url);
    },
    [flashMode, facingMode],
  );

  // Video recording handler
  const handleVideoRecorded = useCallback((blob: Blob) => {
    // In a real app, this would navigate to editor / upload
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quantchat-video-${Date.now()}.webm`;
    URL.revokeObjectURL(url);
  }, []);

  // Permission denied state
  if (permissionStatus === 'denied') {
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-gray-900">
        <PermissionDenied />
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <BottomNav
            items={navItems}
            activeId="camera"
            onChange={(id) => {
              const route = routes[id];
              if (route) router.push(route);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      {/* Screen flash overlay for front camera */}
      {screenFlashActive && <div className="absolute inset-0 bg-white z-50 pointer-events-none" />}

      {/* Canvas-based viewfinder */}
      <Viewfinder stream={stream} canvasRef={canvasRef} activeLens={activeLens} />

      {/* Loading state while waiting for permission/stream */}
      {permissionStatus === 'prompt' && !stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-white/60 text-sm">Initializing camera...</span>
          </div>
        </div>
      )}

      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 z-10 pt-6">
        <CameraControls
          facingMode={facingMode}
          flashMode={flashMode}
          onFlipCamera={handleFlipCamera}
          onToggleFlash={handleToggleFlash}
          isFlipping={isFlipping}
        />
      </div>

      {/* Capture button */}
      <div className="absolute bottom-24 left-0 right-0 z-10 flex items-center justify-center">
        <CaptureButton
          canvasRef={canvasRef}
          stream={stream}
          onPhotoCaptured={handlePhotoCaptured}
          onVideoRecorded={handleVideoRecorded}
        />
      </div>

      {/* AR Lens Carousel */}
      <div className="absolute bottom-44 left-0 right-0 z-10">
        <ARLensCarousel activeLens={activeLens} onLensSelect={setActiveLens} />
      </div>

      {/* Bottom nav */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <BottomNav
          items={navItems}
          activeId="camera"
          onChange={(id) => {
            const route = routes[id];
            if (route) router.push(route);
          }}
        />
      </div>
    </div>
  );
}
