'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// Task 8.5: GhostModeToggle — Toggle switch in the map header
// When enabled: stops broadcasting location, hides user pin from friends
// within 5s (sends WebSocket event). Ghost icon + "You're invisible" label.
// ============================================================================

interface GhostModeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function GhostModeToggle({ enabled, onToggle }: GhostModeToggleProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Ghost icon + label when active */}
      <AnimatePresence>
        {enabled && (
          <motion.span
            className="text-xs text-white/80 font-medium flex items-center gap-1"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
          >
            <span className="text-sm">&#128123;</span>
            You&apos;re invisible
          </motion.span>
        )}
      </AnimatePresence>

      {/* Toggle switch */}
      <button
        onClick={() => onToggle(!enabled)}
        className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
          enabled ? 'bg-purple-600' : 'bg-gray-600'
        }`}
        aria-label={enabled ? 'Disable ghost mode' : 'Enable ghost mode'}
        role="switch"
        aria-checked={enabled}
      >
        <motion.div
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md flex items-center justify-center text-[10px]"
          animate={{ left: enabled ? '26px' : '2px' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {enabled ? '&#128123;' : '&#128065;'}
        </motion.div>
      </button>
    </div>
  );
}

export default GhostModeToggle;
