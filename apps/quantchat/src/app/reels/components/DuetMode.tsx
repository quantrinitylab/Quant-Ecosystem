// ============================================================================
// QuantChat - Duet Mode Skeleton (Task 3.8)
// Split-screen view: original reel on left, camera viewfinder on right
// UI skeleton - actual recording sync is handled by the camera pipeline
// ============================================================================
'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface DuetModeProps {
  originalVideoUrl: string;
  originalCreator: string;
  isOpen: boolean;
  onClose: () => void;
}

const BRAND_SPRINGS = {
  snappy: { type: 'spring' as const, stiffness: 400, damping: 30 },
};

export function DuetMode({ originalVideoUrl, originalCreator, isOpen, onClose }: DuetModeProps) {
  const originalVideoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Initialize camera on open
  useEffect(() => {
    if (!isOpen) {
      // Cleanup camera on close
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        setCameraStream(null);
      }
      return;
    }

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: true,
        });
        setCameraStream(stream);
        setCameraError(null);
      } catch {
        setCameraError('Camera access required for duet mode');
      }
    }

    initCamera();

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Attach camera stream to video element
  useEffect(() => {
    if (cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const handleStartRecording = useCallback(() => {
    setIsRecording(true);
    // Play original video in sync
    originalVideoRef.current?.play().catch(() => {});
  }, []);

  const handleStopRecording = useCallback(() => {
    setIsRecording(false);
    originalVideoRef.current?.pause();
  }, []);

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex bg-black"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={BRAND_SPRINGS.snappy}
    >
      {/* Split-screen container */}
      <div className="flex h-full w-full">
        {/* Left half: Original reel */}
        <div className="relative h-full w-1/2 border-r border-gray-800">
          <video
            ref={originalVideoRef}
            src={originalVideoUrl}
            className="h-full w-full object-cover"
            playsInline
            muted={false}
            loop
          />
          {/* Original creator label */}
          <div className="absolute bottom-4 left-2 rounded-full bg-black/60 px-3 py-1">
            <span className="text-xs font-medium text-white">@{originalCreator}</span>
          </div>
        </div>

        {/* Right half: Camera viewfinder */}
        <div className="relative h-full w-1/2">
          {cameraError ? (
            <div className="flex h-full items-center justify-center bg-gray-900 px-4">
              <p className="text-center text-sm text-red-400">{cameraError}</p>
            </div>
          ) : (
            <video
              ref={cameraVideoRef}
              className="h-full w-full object-cover"
              autoPlay
              playsInline
              muted
            />
          )}

          {/* "You" label */}
          <div className="absolute bottom-4 left-2 rounded-full bg-black/60 px-3 py-1">
            <span className="text-xs font-medium text-white">You</span>
          </div>
        </div>
      </div>

      {/* Controls overlay */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-800 text-white"
          aria-label="Close duet"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Record button */}
        <button
          onPointerDown={handleStartRecording}
          onPointerUp={handleStopRecording}
          onPointerLeave={handleStopRecording}
          className={`flex h-16 w-16 items-center justify-center rounded-full border-4 ${
            isRecording ? 'border-red-500 bg-red-500/30' : 'border-white bg-transparent'
          } transition-colors`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording && <div className="h-6 w-6 rounded-sm bg-red-500" />}
        </button>

        {/* Flip camera placeholder */}
        <button
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-800 text-white"
          aria-label="Flip camera"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
        </button>
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="absolute left-4 top-12 flex items-center gap-2 rounded-full bg-red-600/80 px-3 py-1">
          <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
          <span className="text-xs font-medium text-white">REC</span>
        </div>
      )}
    </motion.div>
  );
}

export default DuetMode;
