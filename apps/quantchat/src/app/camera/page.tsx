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
import { CapturePreview, type CapturedMedia } from './CapturePreview';

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
  // QC-F-138: captured media awaiting the user's decision (preview/send/save).
  // Before this state existed, the capture handlers discarded the blob.
  const [captured, setCaptured] = useState<CapturedMedia | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The objectUrl of the live capture — this page is its single revoke owner.
  const capturedUrlRef = useRef<string | null>(null);

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

  // Revoke the capture's objectUrl on unmount (single revoke owner: here and
  // clearCapture below — nowhere else).
  useEffect(() => {
    return () => {
      if (capturedUrlRef.current) {
        URL.revokeObjectURL(capturedUrlRef.current);
        capturedUrlRef.current = null;
      }
    };
  }, []);

  // Confirmation notice auto-dismiss
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

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

  // QC-F-138: a capture is kept, never discarded. The handlers hand the blob
  // to the preview (retake / send / save) — the old code built a download
  // link it never clicked and revoked the URL, so every capture vanished
  // while the UI behaved as if it had succeeded.
  const keepCapture = useCallback(
    (blob: Blob, kind: 'photo' | 'video') => {
      if (capturedUrlRef.current) {
        URL.revokeObjectURL(capturedUrlRef.current);
      }
      const objectUrl = URL.createObjectURL(blob);
      capturedUrlRef.current = objectUrl;
      setCaptured({
        blob,
        kind,
        objectUrl,
        sizeBytes: blob.size,
        // The lens is baked into photo pixels by the Viewfinder canvas;
        // video records the raw stream, so it honestly carries no lens.
        lensId: kind === 'photo' ? (activeLens?.id ?? null) : null,
        lensName: kind === 'photo' ? (activeLens?.name ?? null) : null,
      });
    },
    [activeLens],
  );

  const clearCapture = useCallback(() => {
    if (capturedUrlRef.current) {
      URL.revokeObjectURL(capturedUrlRef.current);
      capturedUrlRef.current = null;
    }
    setCaptured(null);
  }, []);

  const handleCaptureDone = useCallback(
    (message: string) => {
      clearCapture();
      setNotice(message);
    },
    [clearCapture],
  );

  // Photo capture handler
  const handlePhotoCaptured = useCallback(
    (blob: Blob) => {
      // If screen flash mode is active on front camera, flash the screen
      if (flashMode === 'screen' && facingMode === 'user') {
        setScreenFlashActive(true);
        setTimeout(() => setScreenFlashActive(false), 200);
      }
      keepCapture(blob, 'photo');
    },
    [flashMode, facingMode, keepCapture],
  );

  // Video recording handler
  const handleVideoRecorded = useCallback(
    (blob: Blob) => {
      keepCapture(blob, 'video');
    },
    [keepCapture],
  );

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
      <Viewfinder stream={stream} canvasRef={canvasRef} activeLens={activeLens} paused={!!captured} />

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

      {/* QC-F-138: post-capture preview — retake / send / save destinations */}
      {captured && (
        <CapturePreview captured={captured} onDiscard={clearCapture} onDone={handleCaptureDone} />
      )}

      {/* Honest confirmation after a successful send/save */}
      {notice && !captured && (
        <div
          role="status"
          className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-black shadow-lg"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
