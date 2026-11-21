// ============================================================================
// QuantChat - Share Sheet (Task 3.7)
// Custom share menu for a reel.
//
// QC-F-025 honesty fix: a share is only counted (onShare) when a share
// actually happened. Previously every menu option — including the no-op
// Send Message / Add to Story / Save Video entries — fired onShare, which
// POSTs /reels/:id/share and inflates the reel's share count (and its
// Spotlight engagement score) for an action that never occurred.
// Send Message / Add to Story / Save Video have no working flow behind
// them in this build, so they are shown disabled and labelled
// "Not available" instead of pretending to succeed.
//
// QC-F-373 honesty fix: Copy Link and the native share attempt built a
// URL for /reels/<id> — a route that does not exist (no page segment,
// no route-access registry pattern), so every link this sheet produced
// landed on the 404 page, yet a successful clipboard write or native
// share still counted a share for it. Until QC-F-365 lands a real
// focused reel route (/reels?reel=<id>), there is no honest link to
// give out, so:
//  - Copy Link is disabled and labelled "Not available" like the other
//    options; the dead URL is not produced anywhere in this component.
//  - The native share attempt on open is removed: opening this sheet
//    now only shows the menu and never sends a dead link to the OS
//    share sheet.
//  - No interaction with this sheet fires onShare. Re-enabling the link
//    options on the real focused route is QC-F-373 Slice-2, defined in
//    specialist-qc-f-373-buildprep.md §6.4.
// ============================================================================
'use client';

import { useCallback, useEffect, useState } from 'react';
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
  { id: 'copy', label: 'Copy Link', icon: '🔗', available: false },
  { id: 'message', label: 'Send Message', icon: '💬', available: false },
  { id: 'story', label: 'Add to Story', icon: '📸', available: false },
  { id: 'download', label: 'Save Video', icon: '💾', available: false },
] as const;

type ShareOptionId = (typeof SHARE_OPTIONS)[number]['id'];

export function ShareSheet({ isOpen, onClose, reelId, caption, onShare }: ShareSheetProps) {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNotice(null);
    }
  }, [isOpen]);

  // QC-F-373: reelId / caption / onShare stay in the prop shape for the
  // Slice-2 re-enable, but no option in this build may use them — Copy
  // Link has no real destination yet and the other three options have
  // no flow behind them. Every option therefore lands on this one
  // honest guard: never copy, never share, never count.
  const handleOptionClick = useCallback((_optionId: ShareOptionId) => {
    setNotice('That share option is not available yet — no share was counted.');
  }, []);

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
