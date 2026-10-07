'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import type { CallParticipant } from '../../hooks/useCallState';
import { calculateGridLayout, type GridLayout, type GridMode } from './gridLayout';

// Re-export the layout helper so it is available from the component module as well
// (Task 7.1 requires GroupCallGrid to "include calculateGridLayout(count)").
export { calculateGridLayout };
export type { GridLayout, GridMode };

// ─── GroupCallGrid (Tasks 7.1 – 7.4) ────────────────────────────────────────────
// Responsive multi-participant video grid for 1-8 participants:
//   • 1            → full screen
//   • 2            → split (stacked)
//   • 3-4          → 2x2 grid
//   • 5-8          → focus mode (active speaker large + horizontal thumbnail row)
// Each tile renders the participant video (placeholder), an avatar fallback when the
// camera is off, the participant name, and a mute indicator. The active speaker tile
// is highlighted with a 3px emerald border that animates in within 200ms. Join/leave
// transitions animate the grid re-arrangement over 300ms via Framer Motion layout.
// ─────────────────────────────────────────────────────────────────────────────────

const ACTIVE_BORDER = 'rgba(16, 185, 129, 1)'; // emerald-500
const IDLE_BORDER = 'rgba(255, 255, 255, 0.1)';

// Re-arrangement / active-speaker timing tokens.
const REARRANGE_DURATION = 0.3; // 300ms grid re-arrangement (Task 7.4)
const SPEAKER_BORDER_DURATION = 0.2; // 200ms active-speaker highlight (Task 7.3)

export interface GroupCallGridProps {
  /** All participants currently in the call (1-8). */
  participants: CallParticipant[];
  /** userId of the participant detected as the active speaker (Task 7.3). */
  activeSpeakerId?: string | null;
  /** Optional className passthrough for the grid container. */
  className?: string;
}

// ─── Participant tile ────────────────────────────────────────────────────────────

interface ParticipantTileProps {
  participant: CallParticipant;
  isActiveSpeaker: boolean;
  isThumbnail?: boolean;
}

function ParticipantTile({
  participant,
  isActiveSpeaker,
  isThumbnail = false,
}: ParticipantTileProps) {
  const initial = (participant.username || '?').charAt(0).toUpperCase();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{
        opacity: 1,
        scale: 1,
        // Animate only the border color so the 3px width never shifts the layout.
        borderColor: isActiveSpeaker ? ACTIVE_BORDER : IDLE_BORDER,
      }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{
        layout: { duration: REARRANGE_DURATION, ease: 'easeInOut' },
        borderColor: { duration: SPEAKER_BORDER_DURATION, ease: 'easeOut' },
        opacity: { duration: 0.2 },
        scale: { type: 'spring', ...spring.gentle },
      }}
      style={{ borderWidth: 3, borderStyle: 'solid' }}
      className={`relative overflow-hidden rounded-2xl bg-gray-900 ${
        isThumbnail ? 'h-full w-28 flex-shrink-0' : 'h-full w-full'
      }`}
      data-active-speaker={isActiveSpeaker}
      data-testid={`participant-tile-${participant.userId}`}
    >
      {/* Video feed / avatar placeholder */}
      {participant.isCameraOff ? (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
          <div
            className={`flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 font-bold text-white ${
              isThumbnail ? 'h-10 w-10 text-sm' : 'h-20 w-20 text-3xl'
            }`}
          >
            {initial}
          </div>
        </div>
      ) : (
        // In production this is a LiveKit <video> element bound to the participant track.
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700">
          <div
            className={`flex items-center justify-center rounded-full bg-white/10 font-bold text-white ${
              isThumbnail ? 'h-10 w-10 text-sm' : 'h-20 w-20 text-3xl'
            }`}
          >
            {initial}
          </div>
        </div>
      )}

      {/* Bottom gradient + name + mute indicator */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        {participant.isMuted && (
          <span
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-500"
            aria-label={`${participant.username} is muted`}
            data-testid={`mute-indicator-${participant.userId}`}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="2" x2="22" y1="2" y2="22" />
              <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
              <path d="M5 10v2a7 7 0 0 0 12 5" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
            </svg>
          </span>
        )}
        <span
          className={`truncate font-medium text-white ${isThumbnail ? 'text-[10px]' : 'text-xs'}`}
        >
          {participant.username}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Grid container ───────────────────────────────────────────────────────────────

export function GroupCallGrid({
  participants,
  activeSpeakerId,
  className = '',
}: GroupCallGridProps) {
  const layout = calculateGridLayout(participants.length);

  // ─── Focus mode (Task 7.2): active speaker large + horizontal thumbnail row ─────
  if (layout.mode === 'focus') {
    // Prefer the detected active speaker as the focused tile; fall back to the first.
    const focused = participants.find((p) => p.userId === activeSpeakerId) ?? participants[0];
    const thumbnails = participants.filter((p) => p.userId !== focused.userId);

    return (
      <div className={`flex h-full w-full flex-col gap-2 p-2 ${className}`} data-grid-mode="focus">
        {/* Active speaker — large primary tile */}
        <div className="min-h-0 flex-1">
          <AnimatePresence mode="popLayout">
            <ParticipantTile
              key={focused.userId}
              participant={focused}
              isActiveSpeaker={focused.userId === activeSpeakerId}
            />
          </AnimatePresence>
        </div>

        {/* Horizontal thumbnail row */}
        <motion.div layout className="flex h-24 flex-shrink-0 gap-2 overflow-x-auto">
          <AnimatePresence mode="popLayout">
            {thumbnails.map((p) => (
              <ParticipantTile
                key={p.userId}
                participant={p}
                isActiveSpeaker={p.userId === activeSpeakerId}
                isThumbnail
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  // ─── Single / split / 2x2 grid (Task 7.1) ───────────────────────────────────────
  const gridClass =
    layout.mode === 'single'
      ? 'grid-cols-1 grid-rows-1'
      : layout.mode === 'split'
        ? 'grid-cols-1 grid-rows-2'
        : 'grid-cols-2 grid-rows-2';

  return (
    <motion.div
      layout
      className={`grid h-full w-full gap-2 p-2 ${gridClass} ${className}`}
      data-grid-mode={layout.mode}
      transition={{ layout: { duration: REARRANGE_DURATION, ease: 'easeInOut' } }}
    >
      <AnimatePresence mode="popLayout">
        {participants.map((p) => (
          <ParticipantTile
            key={p.userId}
            participant={p}
            isActiveSpeaker={p.userId === activeSpeakerId}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

export default GroupCallGrid;
