'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type VoiceState,
  type VoicePersona,
  SOVEREIGN_PERSONAS,
  type VoicePersonaId,
} from './voice-personas';

export interface VoiceFloatingChipProps {
  isOpen: boolean;
  isMinimized: boolean;
  state: VoiceState;
  personaId: VoicePersonaId;
  persona?: VoicePersona;
  isMuted: boolean;
  audioLevel?: number;
  onExpand: () => void;
  onToggleMute: () => void;
  onDisconnect: () => void;
  className?: string;
}

export const VoiceFloatingChip: React.FC<VoiceFloatingChipProps> = ({
  isOpen,
  isMinimized,
  state,
  personaId,
  persona: propPersona,
  isMuted,
  audioLevel = 0.3,
  onExpand,
  onToggleMute,
  onDisconnect,
  className = '',
}) => {
  if (!isOpen || !isMinimized) {
    return null;
  }

  const currentPersona = propPersona || SOVEREIGN_PERSONAS[personaId] || SOVEREIGN_PERSONAS.aura;

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        role="region"
        aria-label={`Active voice call with ${currentPersona.name}`}
        data-testid="voice-floating-chip"
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-zinc-900/95 border border-zinc-700/80 shadow-2xl backdrop-blur-xl text-zinc-100 ${className}`}
      >
        {/* Clickable Area to Expand */}
        <button
          type="button"
          onClick={onExpand}
          aria-label="Expand voice mode to full screen"
          className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer focus:outline-none"
        >
          {/* Mini Animated Orb / Avatar */}
          <div className="relative flex items-center justify-center">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-md border border-white/20"
              style={{
                background: `linear-gradient(135deg, ${currentPersona.orbGradient.idle[0]}, ${currentPersona.orbGradient.idle[2]})`,
              }}
            >
              <span>{currentPersona.avatar}</span>
            </div>
            {/* Live activity ring */}
            <span
              className={`absolute -inset-0.5 rounded-full border ${
                state === 'speaking'
                  ? 'border-purple-400 animate-ping'
                  : state === 'listening'
                    ? isMuted
                      ? 'border-red-500'
                      : 'border-emerald-400 animate-pulse'
                    : state === 'thinking'
                      ? 'border-amber-400 animate-spin'
                      : 'border-transparent'
              }`}
            />
          </div>

          {/* Voice Status & Persona Label */}
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <span>🎙️ Voice active: {currentPersona.name}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </span>
            <span className="text-[10px] text-zinc-400 capitalize">
              {state === 'listening' && (isMuted ? 'Muted' : 'Listening...')}
              {state === 'speaking' && `${currentPersona.name} speaking`}
              {state === 'thinking' && 'Thinking...'}
              {state === 'idle' && 'Idle'}
            </span>
          </div>

          {/* Mini Waveform Visualizer */}
          <div className="flex items-center gap-0.5 h-4 px-1" aria-hidden="true">
            {[1, 2, 3, 4].map((bar) => (
              <motion.div
                key={bar}
                className="w-1 rounded-full bg-violet-400"
                animate={
                  state === 'speaking' || (state === 'listening' && !isMuted)
                    ? {
                        height: [4, 12 + bar * 2, 4],
                      }
                    : { height: 4 }
                }
                transition={{
                  duration: 0.6 + bar * 0.1,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        </button>

        <div className="h-4 w-px bg-zinc-700 mx-1" />

        {/* Quick Action Buttons: Mute, Expand, Disconnect */}
        <div className="flex items-center gap-1">
          {/* Mute Button */}
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
              isMuted
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'hover:bg-zinc-800 text-zinc-300 hover:text-white'
            }`}
          >
            {isMuted ? <span className="text-xs">🔇</span> : <span className="text-xs">🎙️</span>}
          </button>

          {/* Expand Full Modal Button */}
          <button
            type="button"
            onClick={onExpand}
            aria-label="Expand voice view"
            title="Expand view"
            className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </button>

          {/* Disconnect Call Button */}
          <button
            type="button"
            onClick={onDisconnect}
            aria-label="Disconnect voice session"
            title="Disconnect voice"
            className="p-1.5 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
};

export default VoiceFloatingChip;
