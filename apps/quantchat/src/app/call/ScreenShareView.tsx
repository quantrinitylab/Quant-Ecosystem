'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import type { CallParticipant } from '../../hooks/useCallState';
import { GroupCallGrid } from './GroupCallGrid';

// ─── ScreenShareView (Tasks 7.5 – 7.7) ──────────────────────────────────────────
// Wraps the group-call layout with screen-sharing capability:
//   • Task 7.5 — getDisplayMedia() capture; while sharing, the screen is the primary
//     feed and participant cameras collapse into a thumbnail row; a screen-share
//     toggle button is provided.
//   • Task 7.6 — stopping the share reverts to the standard layout within 500ms and a
//     persistent "You are sharing your screen" indicator is shown while active.
//   • Task 7.7 — if getDisplayMedia permission is denied/cancelled, an informational
//     toast ("Screen sharing was cancelled") is shown and the standard layout is kept.
// ─────────────────────────────────────────────────────────────────────────────────

// Reverting to the standard layout must complete within 500ms (Task 7.6).
const REVERT_DURATION = 0.35; // 350ms — comfortably under the 500ms budget
const TOAST_DURATION_MS = 3000;

export interface ScreenShareViewProps {
  /** Participants currently in the call. */
  participants: CallParticipant[];
  /** userId of the active speaker (forwarded to the grid). */
  activeSpeakerId?: string | null;
  /** Notifies the parent when the local screen-share state changes. */
  onScreenShareChange?: (isSharing: boolean) => void;
}

/** Binds a MediaStream to a <video> element so the captured screen renders live. */
function ScreenVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="h-full w-full rounded-2xl bg-black object-contain"
      data-testid="screen-share-video"
    />
  );
}

export function ScreenShareView({
  participants,
  activeSpeakerId,
  onScreenShareChange,
}: ScreenShareViewProps) {
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSharing = screenStream !== null;

  // ─── Cleanup on unmount: stop any active tracks + timers ───────────────────────
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      screenStream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  // ─── Stop sharing (Task 7.6) ───────────────────────────────────────────────────
  const stopScreenShare = useCallback(() => {
    setScreenStream((current) => {
      current?.getTracks().forEach((t) => t.stop());
      return null;
    });
    onScreenShareChange?.(false);
  }, [onScreenShareChange]);

  // ─── Start sharing (Task 7.5) ──────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md || typeof md.getDisplayMedia !== 'function') {
      showToast('Screen sharing is not supported on this device');
      return;
    }

    try {
      const stream = await md.getDisplayMedia({ video: true, audio: true });

      // The user can end the share from the browser's native control — listen for it.
      const [track] = stream.getVideoTracks();
      track?.addEventListener('ended', () => stopScreenShare());

      setScreenStream(stream);
      onScreenShareChange?.(true);
    } catch {
      // Permission denied or the picker was cancelled (Task 7.7): keep standard layout.
      showToast('Screen sharing was cancelled');
    }
  }, [onScreenShareChange, showToast, stopScreenShare]);

  const toggleScreenShare = useCallback(() => {
    if (isSharing) {
      stopScreenShare();
    } else {
      void startScreenShare();
    }
  }, [isSharing, startScreenShare, stopScreenShare]);

  return (
    <div className="relative h-full w-full bg-black">
      {/* ─── Persistent "you are sharing" indicator (Task 7.6) ─────────────────── */}
      <AnimatePresence>
        {isSharing && (
          <motion.div
            key="sharing-indicator"
            className="absolute left-1/2 top-4 z-30 -translate-x-1/2"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', ...spring.gentle }}
          >
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/90 px-4 py-1.5 backdrop-blur-sm">
              <motion.span
                className="h-2 w-2 rounded-full bg-white"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span className="text-xs font-medium text-white">You are sharing your screen</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Primary stage: shared screen OR standard grid ─────────────────────── */}
      <div className="h-full w-full">
        <AnimatePresence mode="wait">
          {isSharing && screenStream ? (
            <motion.div
              key="sharing"
              className="flex h-full w-full flex-col gap-2 p-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: REVERT_DURATION, ease: 'easeInOut' }}
              data-screenshare-active="true"
            >
              {/* Shared screen as the primary feed (Task 7.5 / 16.2) */}
              <div className="min-h-0 flex-1">
                <ScreenVideo stream={screenStream} />
              </div>

              {/* Participant cameras collapse into a thumbnail row */}
              <div className="flex h-24 flex-shrink-0 gap-2 overflow-x-auto">
                {participants.map((p) => {
                  const initial = (p.username || '?').charAt(0).toUpperCase();
                  return (
                    <motion.div
                      key={p.userId}
                      layout
                      className="relative h-full w-28 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-900"
                      data-testid={`screenshare-thumb-${p.userId}`}
                    >
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
                          {initial}
                        </div>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                        <span className="truncate text-[10px] font-medium text-white">
                          {p.username}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="standard"
              className="h-full w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: REVERT_DURATION, ease: 'easeInOut' }}
              data-screenshare-active="false"
            >
              <GroupCallGrid participants={participants} activeSpeakerId={activeSpeakerId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Screen-share toggle button (Task 7.5) ─────────────────────────────── */}
      <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
        <motion.button
          className={`flex min-h-[56px] min-w-[56px] items-center justify-center rounded-full transition-colors ${
            isSharing ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
          }`}
          whileTap={{ scale: 0.85 }}
          transition={{ type: 'spring', ...spring.snappy }}
          onClick={toggleScreenShare}
          aria-label={isSharing ? 'Stop screen sharing' : 'Share your screen'}
          aria-pressed={isSharing}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" x2="16" y1="21" y2="21" />
            <line x1="12" x2="12" y1="17" y2="21" />
          </svg>
        </motion.button>
      </div>

      {/* ─── Informational toast (Task 7.7) ────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="screenshare-toast"
            className="absolute bottom-24 left-1/2 z-40 -translate-x-1/2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', ...spring.gentle }}
            role="status"
            data-testid="screenshare-toast"
          >
            <div className="flex items-center gap-2 rounded-xl bg-gray-800/95 px-4 py-2.5 shadow-lg backdrop-blur-sm">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#60a5fa"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="16" y2="12" />
                <line x1="12" x2="12.01" y1="8" y2="8" />
              </svg>
              <span className="text-sm font-medium text-white">{toast}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ScreenShareView;
