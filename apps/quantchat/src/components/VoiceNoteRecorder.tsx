'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';

interface VoiceNoteRecorderProps {
  onRecordingComplete: (durationMs: number) => void;
}

export function VoiceNoteRecorder({ onRecordingComplete }: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(() => {
    setIsRecording(true);
    setDuration(0);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDuration(Date.now() - startTimeRef.current);
    }, 100);
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed > 300) {
      onRecordingComplete(elapsed);
    }
  }, [onRecordingComplete]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
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

      <motion.button
        className={`min-w-touch min-h-touch flex items-center justify-center rounded-full transition-colors ${
          isRecording
            ? 'bg-red-500 text-white'
            : 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-accent)]'
        }`}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', ...spring.snappy }}
        onPointerDown={startRecording}
        onPointerUp={stopRecording}
        onPointerLeave={stopRecording}
        aria-label={isRecording ? 'Recording voice note' : 'Hold to record voice note'}
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
