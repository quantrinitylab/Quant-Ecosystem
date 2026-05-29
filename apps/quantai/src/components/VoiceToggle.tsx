'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface VoiceToggleProps {
  isActive: boolean;
  onToggle: () => void;
  isProcessing?: boolean;
  className?: string;
}

export function VoiceToggle({
  isActive,
  onToggle,
  isProcessing = false,
  className = '',
}: VoiceToggleProps) {
  return (
    <div className={`relative inline-flex items-center gap-2 ${className}`}>
      <button
        onClick={onToggle}
        disabled={isProcessing}
        className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
          isActive
            ? 'bg-red-500 text-white'
            : 'bg-[var(--quant-surface-hover)] text-[var(--quant-text-secondary)] hover:text-[var(--quant-text)]'
        } ${isProcessing ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-label={isActive ? 'Stop recording' : 'Start recording'}
      >
        {isActive && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-red-500"
            animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}

        {isProcessing ? (
          <motion.svg
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </motion.svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        )}
      </button>

      <AnimatePresence>
        {isActive && !isProcessing && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            className="text-xs font-medium text-red-500"
          >
            Listening...
          </motion.span>
        )}
        {isProcessing && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            className="text-xs font-medium text-[var(--quant-text-secondary)]"
          >
            Processing...
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export default VoiceToggle;
