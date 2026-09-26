// ============================================================================
// QuantGram - Guest Interaction Gate Modal
// Prompts unauthenticated guests to sign in when clicking Like, Comment, Bookmark, or Follow
// ============================================================================

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';

export interface GuestInteractionGateProps {
  isOpen: boolean;
  onClose: () => void;
  action?: 'like' | 'comment' | 'bookmark' | 'follow' | string;
}

export const GuestInteractionGate: React.FC<GuestInteractionGateProps> = ({
  isOpen,
  onClose,
  action = 'interact',
}) => {
  if (!isOpen) return null;

  const handleSignIn = () => {
    const returnTo = encodeURIComponent(
      typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/reels',
    );
    window.location.href = `/login?returnTo=${returnTo}`;
  };

  const getActionHeadline = () => {
    switch (action) {
      case 'like':
        return 'Like this reel';
      case 'comment':
        return 'Join the conversation';
      case 'bookmark':
        return 'Save to your collection';
      case 'follow':
        return 'Follow this creator';
      default:
        return 'Interact with creators';
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-gate-title"
        data-testid="guest-interaction-gate"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', ...spring.snappy }}
          className="relative w-full max-w-md rounded-3xl bg-[#141419] border border-white/10 p-6 md:p-8 text-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Ambient Glow */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-600/30 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-rose-600/25 rounded-full blur-3xl pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>

          {/* Badge Icon */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-rose-500 flex items-center justify-center text-2xl shadow-lg mb-5">
            {action === 'like' && '❤️'}
            {action === 'comment' && '💬'}
            {action === 'bookmark' && '🔖'}
            {action === 'follow' && '✨'}
            {!['like', 'comment', 'bookmark', 'follow'].includes(action) && '⚡'}
          </div>

          <h3
            id="guest-gate-title"
            className="text-xl md:text-2xl font-bold tracking-tight text-white mb-2"
          >
            {getActionHeadline()}
          </h3>

          <p className="text-sm font-medium text-purple-300 mb-4">
            Sign in with Quant Account to interact with creators
          </p>

          <p className="text-xs text-white/60 leading-relaxed mb-6">
            Free guests can explore and watch everything. To like, comment, bookmark, and follow
            creators with your sovereign profile, connect your Quant Account.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleSignIn}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-purple-600 to-rose-500 hover:from-purple-500 hover:to-rose-400 font-semibold text-sm text-white shadow-lg transition-all active:scale-[0.98]"
              data-testid="guest-gate-signin-btn"
            >
              Sign in with Quant Account
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              data-testid="guest-gate-cancel-btn"
            >
              Keep browsing as guest
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default GuestInteractionGate;
