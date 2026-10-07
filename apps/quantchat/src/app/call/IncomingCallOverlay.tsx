'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

export interface CallerInfo {
  userId: string;
  name: string;
  avatarUrl?: string;
  avatarInitial: string;
}

interface IncomingCallOverlayProps {
  caller: CallerInfo;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * IncomingCallOverlay — Full-screen overlay with blurred background.
 * Shows caller's avatar with pulsing ring animation,
 * accept (green) and decline (red) buttons.
 */
export function IncomingCallOverlay({ caller, onAccept, onDecline }: IncomingCallOverlayProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="flex flex-col items-center"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', ...spring.gentle }}
      >
        {/* Avatar with ringing animation (expanding rings) */}
        <div className="relative">
          {/* Outer expanding ring 1 */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-emerald-400/60"
            animate={{
              scale: [1, 1.6, 1.6],
              opacity: [0.6, 0, 0],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeOut',
            }}
            style={{
              margin: -12,
              width: 'calc(100% + 24px)',
              height: 'calc(100% + 24px)',
            }}
          />
          {/* Outer expanding ring 2 (offset) */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-emerald-400/40"
            animate={{
              scale: [1, 1.8, 1.8],
              opacity: [0.4, 0, 0],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeOut',
              delay: 0.8,
            }}
            style={{
              margin: -12,
              width: 'calc(100% + 24px)',
              height: 'calc(100% + 24px)',
            }}
          />
          {/* Inner pulsing ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-emerald-500"
            animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0.4, 0.8] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              margin: -6,
              width: 'calc(100% + 12px)',
              height: 'calc(100% + 12px)',
            }}
          />

          {/* Avatar */}
          {caller.avatarUrl ? (
            <img
              src={caller.avatarUrl}
              alt={caller.name}
              className="w-28 h-28 rounded-full object-cover border-3 border-white/20"
            />
          ) : (
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-5xl font-bold border-3 border-white/20">
              {caller.avatarInitial}
            </div>
          )}
        </div>

        {/* Caller name */}
        <h2 className="text-white text-2xl font-semibold mt-8">{caller.name}</h2>
        <p className="text-white/60 text-sm mt-2">Incoming video call...</p>

        {/* Accept / Decline buttons */}
        <div className="flex items-center gap-16 mt-14">
          {/* Decline button (red, phone-down icon) */}
          <motion.button
            className="flex flex-col items-center gap-3"
            whileTap={{ scale: 0.85 }}
            transition={{ type: 'spring', ...spring.snappy }}
            onClick={onDecline}
            aria-label="Decline call"
          >
            <motion.div
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30"
              whileHover={{ scale: 1.05 }}
            >
              {/* Phone down icon */}
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
            </motion.div>
            <span className="text-white/80 text-xs font-medium">Decline</span>
          </motion.button>

          {/* Accept button (green, phone icon) */}
          <motion.button
            className="flex flex-col items-center gap-3"
            whileTap={{ scale: 0.85 }}
            transition={{ type: 'spring', ...spring.snappy }}
            onClick={onAccept}
            aria-label="Accept call"
          >
            <motion.div
              className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
              whileHover={{ scale: 1.05 }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{
                scale: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
              }}
            >
              {/* Phone icon */}
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
            </motion.div>
            <span className="text-white/80 text-xs font-medium">Accept</span>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default IncomingCallOverlay;
