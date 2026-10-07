// ============================================================================
// QuantChat - Share Sheet (Task 3.7)
// Uses native Web Share API with fallback to custom share menu
// ============================================================================
'use client';

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  reelId: string;
  caption: string;
  onShare: (reelId: string) => void;
}

const BRAND_SPRINGS = {
  snappy: { type: 'spring' as const, stiffness: 400, damping: 30 },
};

const SHARE_OPTIONS = [
  { id: 'copy', label: 'Copy Link', icon: '🔗' },
  { id: 'message', label: 'Send Message', icon: '💬' },
  { id: 'story', label: 'Add to Story', icon: '📸' },
  { id: 'download', label: 'Save Video', icon: '💾' },
];

export function ShareSheet({ isOpen, onClose, reelId, caption, onShare }: ShareSheetProps) {
  const handleNativeShare = useCallback(async () => {
    const shareData: ShareData = {
      title: 'Check out this reel on QuantChat!',
      text: caption,
      url: `${typeof window !== 'undefined' ? window.location.origin : ''}/reels/${reelId}`,
    };

    // Try native Web Share API first
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        onShare(reelId);
        onClose();
        return;
      } catch {
        // User cancelled or API not available - fall through to custom menu
      }
    }
  }, [reelId, caption, onShare, onClose]);

  const handleOptionClick = useCallback(
    (optionId: string) => {
      switch (optionId) {
        case 'copy': {
          const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/reels/${reelId}`;
          navigator.clipboard?.writeText(url).catch(() => {});
          break;
        }
        case 'message':
        case 'story':
        case 'download':
          // These would navigate or trigger respective flows
          break;
      }
      onShare(reelId);
      onClose();
    },
    [reelId, onShare, onClose],
  );

  // Attempt native share on open
  const handleOpen = useCallback(() => {
    handleNativeShare();
  }, [handleNativeShare]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            onAnimationComplete={handleOpen}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-gray-900"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={BRAND_SPRINGS.snappy}
          >
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-gray-600" />
            </div>

            {/* Header */}
            <div className="border-b border-gray-700 px-4 pb-3">
              <h3 className="text-center text-sm font-semibold text-white">Share</h3>
            </div>

            {/* Share options grid */}
            <div className="grid grid-cols-4 gap-4 p-6">
              {SHARE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleOptionClick(option.id)}
                  className="flex flex-col items-center gap-2 rounded-lg p-3 transition-colors active:bg-gray-800"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-800 text-2xl">
                    {option.icon}
                  </div>
                  <span className="text-xs text-gray-300">{option.label}</span>
                </button>
              ))}
            </div>

            {/* Cancel button */}
            <div className="border-t border-gray-700 p-4">
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-gray-800 py-3 text-sm font-medium text-white"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default ShareSheet;
