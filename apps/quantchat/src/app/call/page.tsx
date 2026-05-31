'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { CallControls } from '../../components/CallControls';

type CallState = 'incoming' | 'active' | 'ended';

interface CallerInfo {
  name: string;
  avatarInitial: string;
}

function formatCallDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function CallPage() {
  const [callState, setCallState] = useState<CallState>('incoming');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [duration, setDuration] = useState(0);
  const [pipPosition, setPipPosition] = useState({ x: 16, y: 80 });
  const [isDraggingPip, setIsDraggingPip] = useState(false);

  const caller: CallerInfo = {
    name: 'Sarah Mitchell',
    avatarInitial: 'S',
  };

  // Call timer
  useEffect(() => {
    if (callState !== 'active') return;
    const timer = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, [callState]);

  const handleAccept = useCallback(() => {
    setCallState('active');
    setDuration(0);
  }, []);

  const handleReject = useCallback(() => {
    setCallState('ended');
  }, []);

  const handleEndCall = useCallback(() => {
    setCallState('ended');
  }, []);

  // Ended state
  if (callState === 'ended') {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', ...spring.gentle }}
          className="text-center"
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
            {caller.avatarInitial}
          </div>
          <p className="text-white text-lg font-medium">{caller.name}</p>
          <p className="text-white/60 text-sm mt-1">
            Call ended {duration > 0 ? `- ${formatCallDuration(duration)}` : ''}
          </p>
          <motion.button
            className="mt-8 px-6 py-3 rounded-full bg-[var(--quant-surface)] text-[var(--quant-foreground)] font-medium min-h-touch"
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', ...spring.snappy }}
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Back to Chats
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black relative overflow-hidden">
      {/* Remote video area (full screen) */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        {callState === 'active' ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-5xl font-bold">
              {caller.avatarInitial}
            </div>
          </div>
        ) : null}
      </div>

      {/* Call timer (top center) */}
      {callState === 'active' && (
        <motion.div
          className="absolute top-12 left-0 right-0 flex justify-center z-10"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', ...spring.gentle }}
        >
          <div className="px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-sm">
            <span className="text-white text-sm font-medium">{formatCallDuration(duration)}</span>
          </div>
        </motion.div>
      )}

      {/* Self-view PiP (draggable) */}
      {callState === 'active' && isCameraOn && (
        <motion.div
          className="absolute z-20 w-[120px] h-[160px] rounded-2xl overflow-hidden border-2 border-white/20 shadow-lg cursor-grab active:cursor-grabbing"
          style={{ top: pipPosition.y, right: pipPosition.x }}
          drag
          dragMomentum={false}
          dragConstraints={{ top: 60, left: -260, right: 16, bottom: 400 }}
          onDragStart={() => setIsDraggingPip(true)}
          onDragEnd={(_, info) => {
            setIsDraggingPip(false);
            setPipPosition((prev) => ({
              x: prev.x - info.offset.x,
              y: prev.y + info.offset.y,
            }));
          }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', ...spring.snappy }}
        >
          <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
            <span className="text-white text-sm font-medium">You</span>
          </div>
        </motion.div>
      )}

      {/* Active call controls */}
      {callState === 'active' && (
        <motion.div
          className="absolute bottom-8 left-0 right-0 z-10"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', ...spring.gentle }}
        >
          <CallControls
            isMuted={isMuted}
            isCameraOn={isCameraOn}
            isSpeakerOn={isSpeakerOn}
            onToggleMute={() => setIsMuted(!isMuted)}
            onToggleCamera={() => setIsCameraOn(!isCameraOn)}
            onToggleSpeaker={() => setIsSpeakerOn(!isSpeakerOn)}
            onEndCall={handleEndCall}
          />
        </motion.div>
      )}

      {/* Incoming call overlay */}
      <AnimatePresence>
        {callState === 'incoming' && (
          <motion.div
            className="absolute inset-0 z-30 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="flex flex-col items-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', ...spring.gentle }}
            >
              {/* Animated ring around avatar */}
              <div className="relative">
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-emerald-500"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ margin: -8, width: 'calc(100% + 16px)', height: 'calc(100% + 16px)' }}
                />
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-4xl font-bold">
                  {caller.avatarInitial}
                </div>
              </div>

              <h2 className="text-white text-2xl font-semibold mt-6">{caller.name}</h2>
              <p className="text-white/60 text-sm mt-1">Incoming video call...</p>

              {/* Accept / Reject buttons */}
              <div className="flex items-center gap-12 mt-12">
                <motion.button
                  className="flex flex-col items-center gap-2"
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: 'spring', ...spring.snappy }}
                  onClick={handleReject}
                >
                  <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center min-w-touch min-h-touch">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                      <line x1="22" x2="2" y1="2" y2="22" />
                    </svg>
                  </div>
                  <span className="text-white/80 text-xs">Decline</span>
                </motion.button>

                <motion.button
                  className="flex flex-col items-center gap-2"
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: 'spring', ...spring.snappy }}
                  onClick={handleAccept}
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center min-w-touch min-h-touch">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                  <span className="text-white/80 text-xs">Accept</span>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
