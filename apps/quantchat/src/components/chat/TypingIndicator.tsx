'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRealtime } from '../../providers/realtime-context';

// ============================================================================
// Task 11.8: Typing Indicator
// - 3 pulsing dots with staggered animation (0.4s each, 0.15s stagger)
// - Gray background pill shape
// - Shows when WebSocket 'typing' channel fires for the current conversation
// ============================================================================

interface TypingIndicatorProps {
  /** Conversation ID to monitor typing events for */
  conversationId: string;
  /** Override: manually control visibility (for testing/previews) */
  isVisible?: boolean;
  className?: string;
}

export function TypingIndicator({
  conversationId,
  isVisible: externalVisible,
  className = '',
}: TypingIndicatorProps) {
  const [isTyping, setIsTyping] = useState(false);
  const { subscribe } = useRealtime();

  useEffect(() => {
    if (externalVisible !== undefined) return;

    let timeoutId: NodeJS.Timeout;

    const unsubscribe = subscribe('typing', (event) => {
      if (event.payload?.conversationId === conversationId) {
        setIsTyping(true);
        // Auto-hide after 3s of no typing events
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => setIsTyping(false), 3000);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [subscribe, conversationId, externalVisible]);

  const showIndicator = externalVisible ?? isTyping;

  return (
    <AnimatePresence>
      {showIndicator && (
        <motion.div
          className={`inline-flex items-center gap-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 rounded-full ${className}`}
          initial={{ opacity: 0, scale: 0.8, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 4 }}
          transition={{ duration: 0.2 }}
        >
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              className="w-2 h-2 rounded-full bg-gray-500 dark:bg-gray-400"
              animate={{
                y: [0, -4, 0],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 0.4,
                repeat: Infinity,
                delay: index * 0.15, // 0.15s stagger
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default TypingIndicator;
