'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { CallControls } from '../../components/CallControls';
import { IncomingCallOverlay } from './IncomingCallOverlay';
import { useCallState } from '../../hooks/useCallState';
import { useCallTimer, formatCallDuration } from '../../hooks/useCallTimer';
import { apiFetchRaw } from '@quant/api-client';

// ─── CallScreen ────────────────────────────────────────────────────────────────
// Accepts roomId and token from URL params (e.g., /call?roomId=xxx&token=yyy)
// Implements: connect to room, remote video full-screen, local PiP (draggable),
// mute/camera/speaker/end controls, auto-reconnection, elapsed timer.
// ───────────────────────────────────────────────────────────────────────────────

interface CallerInfo {
  name: string;
  avatarInitial: string;
  avatarUrl?: string;
}

export default function CallPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomId = searchParams?.get('roomId') ?? null;
  const token = searchParams?.get('token') ?? null;
  const callerName = searchParams?.get('callerName') ?? 'Unknown';
  const isIncoming = searchParams?.get('incoming') === 'true';

  const { state, initiateCall, acceptCall, connect, toggleMute, toggleCamera, endCall, connectionDropped, reconnected, reset } = useCallState();
  const timer = useCallTimer();

  const [isSpeakerOn, setIsSpeakerOn] = [false, () => {}]; // speaker state placeholder
  const speakerRef = useRef(false);

  const autoNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const caller: CallerInfo = {
    name: callerName,
    avatarInitial: callerName.charAt(0).toUpperCase(),
  };

  // ─── Initialize call on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (roomId && token) {
      if (isIncoming) {
        // Show incoming overlay first
        // The state machine starts as 'idle', incoming overlay handles accept
      } else {
        // Outgoing call: initiate and start connecting
        initiateCall(roomId, token);
        // Simulate connection (in production, LiveKit SDK would handle this)
        const connectTimeout = setTimeout(() => {
          connect([]);
          timer.start();
        }, 1500);
        return () => clearTimeout(connectTimeout);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, token, isIncoming]);

  // ─── Handle incoming call accept ────────────────────────────────────────────
  const handleAcceptCall = useCallback(() => {
    acceptCall();
    // Simulate connection after accepting
    setTimeout(() => {
      connect([]);
      timer.start();
    }, 1500);
  }, [acceptCall, connect, timer]);

  const handleDeclineCall = useCallback(() => {
    endCall();
  }, [endCall]);

  // ─── End call handler (Task 6.5) ────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    timer.stop();
    endCall();

    // POST /calls/end to destroy the LiveKit room
    if (roomId) {
      try {
        await apiFetchRaw('/api/calls/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId }),
        });
      } catch {
        // Best-effort cleanup
      }
    }

    // Auto-navigate back to chat after 3 seconds
    autoNavTimerRef.current = setTimeout(() => {
      router.push('/chat');
    }, 3000);
  }, [timer, endCall, roomId, router]);

  // ─── Reconnection simulation (Task 6.6) ─────────────────────────────────────
  const handleRetryConnection = useCallback(() => {
    connectionDropped();
    // Simulate reconnection attempt
    setTimeout(() => {
      reconnected();
      timer.start();
    }, 2000);
  }, [connectionDropped, reconnected, timer]);

  // ─── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      timer.stop();
      if (autoNavTimerRef.current) clearTimeout(autoNavTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Mute toggle (Task 6.4) ─────────────────────────────────────────────────
  // Sets audioTrack.enabled = false within 100ms
  const handleToggleMute = useCallback(() => {
    toggleMute();
    // In production: audioTrack.enabled = !state.isMuted
  }, [toggleMute]);

  // ─── Camera toggle (Task 6.4) ────────────────────────────────────────────────
  // Sets videoTrack.enabled = false and shows avatar placeholder in self-view
  const handleToggleCamera = useCallback(() => {
    toggleCamera();
    // In production: videoTrack.enabled = !state.isCameraOff
  }, [toggleCamera]);

  const handleToggleSpeaker = useCallback(() => {
    speakerRef.current = !speakerRef.current;
  }, []);

  // ─── Render: Ended state (Task 6.5) ─────────────────────────────────────────
  if (state.status === 'ended') {
    return (
      <div className="h-dvh bg-black flex flex-col items-center justify-center">
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
          <p className="text-white/60 text-sm mt-1">Call Ended</p>
          {timer.elapsedSeconds > 0 && (
            <p className="text-white/40 text-xs mt-1">
              Duration: {formatCallDuration(timer.elapsedSeconds)}
            </p>
          )}
          <p className="text-white/30 text-xs mt-4">Returning to chat...</p>
        </motion.div>
      </div>
    );
  }

  // ─── Render: Reconnecting state (Task 6.6) ──────────────────────────────────
  if (state.status === 'reconnecting') {
    return (
      <div className="h-dvh bg-black relative overflow-hidden">
        {/* Background dimmed video area */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 opacity-50" />

        {/* Reconnecting overlay */}
        <motion.div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {state.error === 'Connection lost' ? (
            // After 15s: show "Connection Lost" with "Try Again" button
            <motion.div
              className="text-center"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', ...spring.gentle }}
            >
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-red-400"
                >
                  <path d="M18.36 6.64a9 9 0 0 1 .58 12.67" />
                  <path d="M5.06 18.36a9 9 0 0 1-.58-12.67" />
                  <line x1="2" x2="22" y1="2" y2="22" />
                </svg>
              </div>
              <p className="text-white text-lg font-medium">Connection Lost</p>
              <p className="text-white/60 text-sm mt-2">
                Unable to reconnect to the call
              </p>
              <motion.button
                className="mt-6 px-6 py-3 rounded-full bg-emerald-500 text-white font-medium"
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', ...spring.snappy }}
                onClick={handleRetryConnection}
              >
                Try Again
              </motion.button>
              <motion.button
                className="mt-3 px-6 py-3 rounded-full bg-white/10 text-white/80 font-medium"
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', ...spring.snappy }}
                onClick={handleEndCall}
              >
                End Call
              </motion.button>
            </motion.div>
          ) : (
            // During 15s: show "Reconnecting..." with spinner
            <motion.div
              className="text-center"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', ...spring.gentle }}
            >
              {/* Spinner */}
              <motion.div
                className="w-12 h-12 border-3 border-white/20 border-t-emerald-400 rounded-full mx-auto mb-4"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className="text-white text-lg font-medium">Reconnecting...</p>
              <p className="text-white/60 text-sm mt-2">
                Attempting to restore connection
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  // ─── Render: Connecting state ───────────────────────────────────────────────
  if (state.status === 'connecting' || state.status === 'outgoing') {
    return (
      <div className="h-dvh bg-black flex flex-col items-center justify-center">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', ...spring.gentle }}
        >
          <div className="relative">
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-emerald-500/40"
              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ margin: -8, width: 'calc(100% + 16px)', height: 'calc(100% + 16px)' }}
            />
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-4xl font-bold">
              {caller.avatarInitial}
            </div>
          </div>
          <p className="text-white text-lg font-medium mt-6">{caller.name}</p>
          <p className="text-white/60 text-sm mt-1">
            {state.status === 'outgoing' ? 'Calling...' : 'Connecting...'}
          </p>
        </motion.div>
      </div>
    );
  }

  // ─── Render: Incoming call (idle with incoming param) ───────────────────────
  if ((state.status === 'idle' && isIncoming) || state.status === 'incoming') {
    return (
      <AnimatePresence>
        <IncomingCallOverlay
          caller={{
            userId: 'unknown',
            name: caller.name,
            avatarInitial: caller.avatarInitial,
          }}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      </AnimatePresence>
    );
  }

  // ─── Render: Active call (Task 6.3) ─────────────────────────────────────────
  return (
    <div className="h-dvh bg-black relative overflow-hidden">
      {/* Remote video area (full-screen) */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        {/* In production: <video> element for remote participant stream */}
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-5xl font-bold">
            {caller.avatarInitial}
          </div>
        </div>
      </div>

      {/* Elapsed call timer (Task 6.7) - top center */}
      <motion.div
        className="absolute top-12 left-0 right-0 flex justify-center z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', ...spring.gentle }}
      >
        <div className="px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-sm">
          <span className="text-white text-sm font-medium tabular-nums">
            {timer.formatted}
          </span>
        </div>
      </motion.div>

      {/* Local video PiP - small draggable window (Framer Motion drag) */}
      <motion.div
        className="absolute z-20 w-[120px] h-[160px] rounded-2xl overflow-hidden border-2 border-white/20 shadow-lg cursor-grab active:cursor-grabbing"
        style={{ top: 80, right: 16 }}
        drag
        dragMomentum={false}
        dragConstraints={{ top: 60, left: -260, right: 16, bottom: 500 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', ...spring.snappy }}
      >
        {state.isCameraOff ? (
          // Camera off: show avatar placeholder
          <div className="w-full h-full bg-gray-800 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
              <span className="text-white text-sm font-bold">You</span>
            </div>
            <span className="text-white/40 text-[10px] mt-2">Camera off</span>
          </div>
        ) : (
          // Camera on: show self-view (placeholder in dev)
          <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
            <span className="text-white text-sm font-medium">You</span>
          </div>
        )}
      </motion.div>

      {/* Mute/camera status indicator badges */}
      {state.isMuted && (
        <motion.div
          className="absolute top-12 left-4 z-10 px-3 py-1 rounded-full bg-red-500/80 backdrop-blur-sm"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
        >
          <span className="text-white text-xs font-medium">Muted</span>
        </motion.div>
      )}

      {/* Call controls (bottom) */}
      <motion.div
        className="absolute bottom-8 left-0 right-0 z-10"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', ...spring.gentle }}
      >
        <CallControls
          isMuted={state.isMuted}
          isCameraOn={!state.isCameraOff}
          isSpeakerOn={speakerRef.current}
          onToggleMute={handleToggleMute}
          onToggleCamera={handleToggleCamera}
          onToggleSpeaker={handleToggleSpeaker}
          onEndCall={handleEndCall}
        />
      </motion.div>
    </div>
  );
}
