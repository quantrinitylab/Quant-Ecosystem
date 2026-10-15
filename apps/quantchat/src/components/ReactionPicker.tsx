'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { CUSTOM_EMOJI_PACKS, customEmojiToken } from '../lib/custom-emoji';

interface ReactionPickerProps {
  isOpen: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const reactions = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

// QC-F-336 Slice 1: alongside the original quick unicode row, the picker
// gains a tab for the first-party custom-emoji pack. Selecting a pack
// entry reports the inline token (`:ce:<pack>:<name>:`) through the same
// onSelect(string) contract as a unicode reaction — reaction storage is a
// free string, so the token needs no backend or schema change. Delivery of
// reactions to other clients remains QC-F-020's open work; this picker
// only widens what can be chosen and rendered locally.
export function ReactionPicker({ isOpen, onSelect, onClose }: ReactionPickerProps) {
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const activePack = CUSTOM_EMOJI_PACKS.find((pack) => pack.id === activePackId);

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
            className="absolute bottom-full left-0 mb-2 z-50 flex flex-col gap-1 px-3 py-2 rounded-2xl bg-[var(--quant-surface)] shadow-lg border border-[var(--quant-border)]"
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 10 }}
            transition={{ type: 'spring', ...spring.bouncy }}
          >
            <div className="flex items-center gap-1" role="tablist" aria-label="Reaction sets">
              <button
                type="button"
                role="tab"
                aria-selected={activePack === undefined}
                className={`px-2 py-1 text-xs rounded-full ${
                  activePack === undefined
                    ? 'bg-[var(--quant-muted)] font-semibold'
                    : 'text-[var(--quant-muted-foreground)]'
                }`}
                onClick={() => setActivePackId(null)}
              >
                Quick
              </button>
              {CUSTOM_EMOJI_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  role="tab"
                  aria-selected={activePack?.id === pack.id}
                  className={`px-2 py-1 text-xs rounded-full ${
                    activePack?.id === pack.id
                      ? 'bg-[var(--quant-muted)] font-semibold'
                      : 'text-[var(--quant-muted-foreground)]'
                  }`}
                  onClick={() => setActivePackId(pack.id)}
                >
                  {pack.name}
                </button>
              ))}
            </div>
            {activePack === undefined ? (
              <div className="flex items-center gap-1">
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
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-1">
                {activePack.entries.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--quant-muted)] transition-colors"
                    onClick={() => {
                      onSelect(customEmojiToken(activePack.id, entry.name));
                      onClose();
                    }}
                    aria-label={entry.alt}
                  >
                    <img src={entry.assetUrl} alt={entry.alt} className="h-8 w-8" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default ReactionPicker;
