'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface CallControlsProps {
  isMuted: boolean;
  isCameraOn: boolean;
  isSpeakerOn: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleSpeaker: () => void;
  onEndCall: () => void;
}

export function CallControls({
  isMuted,
  isCameraOn,
  isSpeakerOn,
  onToggleMute,
  onToggleCamera,
  onToggleSpeaker,
  onEndCall,
}: CallControlsProps) {
  return (
    <div className="flex items-center justify-center gap-6 py-6 px-4">
      {/* Mute */}
      <motion.button
        className={`min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center text-xl transition-colors ${
          isMuted ? 'bg-white/20 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
        }`}
        whileTap={{ scale: 0.85 }}
        transition={{ type: 'spring', ...spring.snappy }}
        onClick={onToggleMute}
        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {isMuted ? (
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
            <line x1="2" x2="22" y1="2" y2="22" />
            <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
            <path d="M5 10v2a7 7 0 0 0 12 5" />
            <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        ) : (
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
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </motion.button>

      {/* Camera */}
      <motion.button
        className={`min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center text-xl transition-colors ${
          !isCameraOn ? 'bg-white/20 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
        }`}
        whileTap={{ scale: 0.85 }}
        transition={{ type: 'spring', ...spring.snappy }}
        onClick={onToggleCamera}
        aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
      >
        {isCameraOn ? (
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
            <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
            <rect x="2" y="6" width="14" height="12" rx="2" />
          </svg>
        ) : (
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
            <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" />
            <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
            <line x1="2" x2="22" y1="2" y2="22" />
          </svg>
        )}
      </motion.button>

      {/* Speaker */}
      <motion.button
        className={`min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center text-xl transition-colors ${
          isSpeakerOn ? 'bg-white/20 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
        }`}
        whileTap={{ scale: 0.85 }}
        transition={{ type: 'spring', ...spring.snappy }}
        onClick={onToggleSpeaker}
        aria-label={isSpeakerOn ? 'Turn off speaker' : 'Turn on speaker'}
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
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          {isSpeakerOn && (
            <>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </>
          )}
        </svg>
      </motion.button>

      {/* End Call */}
      <motion.button
        className="min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-colors"
        whileTap={{ scale: 0.85 }}
        transition={{ type: 'spring', ...spring.snappy }}
        onClick={onEndCall}
        aria-label="End call"
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
          <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
          <line x1="22" x2="2" y1="2" y2="22" />
        </svg>
      </motion.button>
    </div>
  );
}

export default CallControls;
