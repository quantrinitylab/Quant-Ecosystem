'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface CaptureButtonProps {
  /** Reference to the canvas to capture a still frame from */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** The active MediaStream for video recording */
  stream: MediaStream | null;
  /** Callback when a photo is captured */
  onPhotoCaptured?: (blob: Blob) => void;
  /** Callback when video recording completes */
  onVideoRecorded?: (blob: Blob) => void;
}

const LONG_PRESS_THRESHOLD_MS = 500;
const MAX_RECORDING_DURATION_MS = 60_000;
const COUNTDOWN_WARNING_MS = 55_000;

/**
 * CaptureButton handles:
 * - Single tap: captures a still frame from the canvas as JPEG blob
 * - Long-press (>500ms): starts recording via MediaRecorder, stops on release or 60s max
 * - Visual feedback: ring animation while recording, countdown at 55s
 */
export function CaptureButton({
  canvasRef,
  stream,
  onPhotoCaptured,
  onVideoRecorded,
}: CaptureButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(5);

  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number>(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLongPressRef = useRef(false);

  const capturePhoto = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (blob && onPhotoCaptured) {
          onPhotoCaptured(blob);
        }
      },
      'image/jpeg',
      0.92,
    );
  }, [canvasRef, onPhotoCaptured]);

  const startRecording = useCallback(() => {
    if (!stream) return;

    setIsRecording(true);
    isLongPressRef.current = true;
    chunksRef.current = [];
    recordingStartRef.current = Date.now();

    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        if (onVideoRecorded && blob.size > 0) {
          onVideoRecorded(blob);
        }
        chunksRef.current = [];
      };

      recorder.start(100); // Collect data every 100ms
      mediaRecorderRef.current = recorder;

      // Progress updates
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - recordingStartRef.current;
        setRecordingProgress(Math.min(elapsed / MAX_RECORDING_DURATION_MS, 1));
      }, 50);

      // Countdown warning at 55s
      maxDurationTimerRef.current = setTimeout(() => {
        setShowCountdown(true);
        let remaining = 5;
        setCountdownSeconds(remaining);
        countdownIntervalRef.current = setInterval(() => {
          remaining -= 1;
          setCountdownSeconds(remaining);
          if (remaining <= 0) {
            stopRecording();
          }
        }, 1000);
      }, COUNTDOWN_WARNING_MS);
    } catch {
      // MediaRecorder not supported or stream issue
      setIsRecording(false);
      isLongPressRef.current = false;
    }
  }, [stream, onVideoRecorded]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setRecordingProgress(0);
    setShowCountdown(false);
    isLongPressRef.current = false;

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
  }, []);

  const handlePointerDown = useCallback(() => {
    isLongPressRef.current = false;

    pressTimerRef.current = setTimeout(() => {
      startRecording();
    }, LONG_PRESS_THRESHOLD_MS);
  }, [startRecording]);

  const handlePointerUp = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    if (isLongPressRef.current) {
      // Was recording, stop it
      stopRecording();
    } else {
      // Short tap → capture photo
      capturePhoto();
    }
  }, [stopRecording, capturePhoto]);

  const handlePointerLeave = useCallback(() => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    // Don't stop recording on pointer leave — user may have moved finger
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const ringStyle = isRecording
    ? {
        background: `conic-gradient(#ef4444 ${recordingProgress * 360}deg, transparent ${recordingProgress * 360}deg)`,
      }
    : {};

  return (
    <div className="relative flex items-center justify-center">
      {/* Recording ring */}
      {isRecording && (
        <div className="absolute w-24 h-24 rounded-full animate-pulse" style={ringStyle} />
      )}

      {/* Button */}
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className={`relative w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all touch-none select-none ${
          isRecording
            ? 'border-red-400 bg-red-500/30 scale-110'
            : 'border-white bg-white/20 backdrop-blur-sm hover:bg-white/30 active:scale-95'
        }`}
        aria-label={isRecording ? 'Stop recording' : 'Capture'}
      >
        <div
          className={`rounded-full transition-all ${
            isRecording ? 'w-8 h-8 bg-red-500 rounded-sm' : 'w-14 h-14 bg-white'
          }`}
        />
      </button>

      {/* Countdown overlay */}
      {showCountdown && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm font-bold px-3 py-1 rounded-full">
          {countdownSeconds}s
        </div>
      )}
    </div>
  );
}
