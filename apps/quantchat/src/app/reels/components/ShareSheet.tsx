// ============================================================================
// QuantChat - Share Sheet (Task 3.7)
// Uses native Web Share API with fallback to custom share menu
//
// QC-F-025 honesty fix: a share is only counted (onShare) when a share
// actually happened. Previously every menu option — including the no-op
// Send Message / Add to Story / Save Video entries — fired onShare, which
// POSTs /reels/:id/share and inflates the reel's share count (and its
// Spotlight engagement score) for an action that never occurred.
// Now:
//  - Copy Link copies for real and counts only when the clipboard write
//    succeeds; a failed/unavailable clipboard shows an honest notice and
//    counts nothing.
//  - Native share counts only when navigator.share resolves; cancelling
//    the native sheet counts nothing.
//  - Send Message / Add to Story / Save Video have no working flow behind
//    them in this build, so they are shown disabled and labelled
//    "Not available" instead of pretending to succeed.
// ============================================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  { id: 'copy', label: 'Copy Link', icon: '🔗', available: true },
  { id: 'message', label: 'Send Message', icon: '💬', available: false },
  { id: 'story', label: 'Add to Story', icon: '📸', available: false },
  { id: 'download', label: 'Save Video', icon: '💾', available: false },
] as const;

type ShareOptionId = (typeof SHARE_OPTIONS)[number]['id'];

export function ShareSheet({ isOpen, onClose, reelId, caption, onShare }: ShareSheetProps) {
  const [notice, setNotice] = useState<string | null>(null);
  // The backdrop's onAnimationComplete can fire more than once (enter and
  // exit); the native share sheet must be attempted at most once per open,
  // otherwise a completed share could be counted twice.
  const nativeAttemptedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      nativeAttemptedRef.current = false;
      setNotice(null);
    }
  }, [isOpen]);

  const reelUrl = useCallback(
    () => `${typeof window !== 'undefined' ? window.location.origin : ''}/reels/${reelId}`,
    [reelId],
  );

  const handleNativeShare = useCallback(async () => {
    if (nativeAttemptedRef.current) return;
    nativeAttemptedRef.current = true;

    const shareData: ShareData = {
      title: 'Check out this reel on QuantChat!',
      text: caption,
      url: reelUrl(),
    };

    // Try native Web Share API first
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        // The user completed a share in the OS sheet — only now is it
        // truthful to count it.
        onShare(reelId);
        onClose();
        return;
      } catch {
        // User cancelled or API not available - fall through to custom menu.
        // A cancelled share is NOT counted.
      }
    }
  }, [reelId, caption, onShare, onClose, reelUrl]);

  const handleOptionClick = useCallback(
    async (optionId: ShareOptionId) => {
      if (optionId === 'copy') {
        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (!clipboard?.writeText) {
          setNotice('Copying is not available in this browser — the link was not copied and no share was counted.');
          return;
        }
        try {
          await clipboard.writeText(reelUrl());
        } catch {
          setNotice('Could not copy the link — no share was counted. Please try again.');
          return;
        }
        // The link really is on the clipboard — counting this share is honest.
        onShare(reelId);
        onClose();
        return;
      }

      // Send Message / Add to Story / Save Video have no working flow in
      // this build. They render disabled (see below), so this is only a
      // guard: never report a share that did not happen.
      setNotice('That share option is not available yet — no share was counted.');
    },
    [reelId, onShare, onClose, reelUrl],
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
                  onClick={() => void handleOptionClick(option.id)}
                  disabled={!option.available}
                  aria-disabled={!option.available}
                  className={`flex flex-col items-center gap-2 rounded-lg p-3 transition-colors ${
                    option.available ? 'active:bg-gray-800' : 'cursor-not-allowed opacity-50'
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-800 text-2xl">
                    {option.icon}
                  </div>
                  <span className="text-xs text-gray-300">{option.label}</span>
                  {!option.available && (
                    <span className="text-[10px] text-gray-500">Not available</span>
                  )}
                </button>
              ))}
            </div>

            {/* Honest feedback when an action could not be completed */}
            {notice && (
              <p role="status" className="px-6 pb-2 text-center text-xs text-amber-300">
                {notice}
              </p>
            )}

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
