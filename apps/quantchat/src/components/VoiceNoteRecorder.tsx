'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';

interface VoiceNoteRecorderProps {
  /**
   * Legacy callback — still fired with the recording duration for
   * backward compatibility.
   */
  onRecordingComplete: (durationMs: number) => void;
  /**
   * Fired with the REAL recorded audio blob when recording stops.
   * Wire this to an upload flow to send genuine voice notes.
   */
  onAudioRecorded?: (audioBlob: Blob, durationMs: number) => void;
  /** Fired when recording cannot start (mic denied, unsupported browser). */
  onError?: (message: string) => void;
}

export function VoiceNoteRecorder({
  onRecordingComplete,
  onAudioRecorded,
  onError,
}: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ onRecordingComplete, onAudioRecorded, onError });
  callbacksRef.current = { onRecordingComplete, onAudioRecorded, onError };

  const reportError = useCallback((message: string) => {
    setError(message);
    callbacksRef.current.onError?.(message);
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => setError(null), 3000);
  }, []);

  const stopTracks = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const finalizeRecording = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current;
    const recorder = mediaRecorderRef.current;
    const type = recorder?.mimeType || 'audio/webm';
    const blob = new Blob(audioChunksRef.current, { type });
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    stopTracks();
    if (elapsed > 300) {
      callbacksRef.current.onRecordingComplete(elapsed);
      if (blob.size > 0) {
        callbacksRef.current.onAudioRecorded?.(blob, elapsed);
      }
    }
  }, [stopTracks]);

  const startRecording = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      reportError('Voice recording not supported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : undefined;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = finalizeRecording;
      recorder.onerror = () => {
        reportError('Recording failed — please try again');
        setIsRecording(false);
        stopTracks();
      };
      setIsRecording(true);
      setDuration(0);
      startTimeRef.current = Date.now();
      recorder.start(250);
      timerRef.current = setInterval(() => {
        setDuration(Date.now() - startTimeRef.current);
      }, 100);
    } catch {
      reportError('Microphone access denied');
    }
  }, [finalizeRecording, reportError, stopTracks]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // triggers onstop -> finalizeRecording
    } else {
      finalizeRecording();
    }
  }, [finalizeRecording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative flex items-center">
      <AnimatePresence>
        {isRecording && (
          <motion.div
            className="absolute right-12 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', ...spring.snappy }}
          >
            <motion.div
              className="w-2 h-2 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-xs font-medium text-red-500">{formatDuration(duration)}</span>
            {/* Waveform bars */}
            <div className="flex items-center gap-0.5 h-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="w-0.5 bg-red-500 rounded-full"
                  animate={{
                    height: ['4px', '16px', '8px', '14px', '4px'],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.1,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            className="absolute right-12 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <span className="text-xs font-medium text-red-500">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        className={`min-w-touch min-h-touch flex items-center justify-center rounded-full transition-colors ${
          isRecording
            ? 'bg-red-500 text-white'
            : 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-accent)]'
        }`}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', ...spring.snappy }}
        onPointerDown={() => void startRecording()}
        onPointerUp={stopRecording}
        onPointerLeave={stopRecording}
        aria-label={isRecording ? 'Recording voice note — release to stop' : 'Hold to record voice note'}
        aria-pressed={isRecording}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </motion.button>
    </div>
  );
}

export default VoiceNoteRecorder;
