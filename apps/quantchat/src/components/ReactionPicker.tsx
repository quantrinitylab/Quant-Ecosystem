'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';

interface ReactionPickerProps {
  isOpen: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const reactions = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export function ReactionPicker({ isOpen, onSelect, onClose }: ReactionPickerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute bottom-full left-0 mb-2 z-50 flex items-center gap-1 px-3 py-2 rounded-full bg-[var(--quant-surface)] shadow-lg border border-[var(--quant-border)]"
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 10 }}
            transition={{ type: 'spring', ...spring.bouncy }}
          >
            {reactions.map((emoji) => (
              <motion.button
                key={emoji}
                className="min-w-touch min-h-touch flex items-center justify-center text-2xl rounded-full hover:bg-[var(--quant-muted)] transition-colors"
                whileTap={{ scale: 1.3 }}
                transition={{ type: 'spring', ...spring.snappy }}
                onClick={() => {
                  onSelect(emoji);
                  onClose();
                }}
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </motion.button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default ReactionPicker;
