// ============================================================================
// QuanTube - Guest Hero Banner
// Non-intrusive welcoming hero banner for unauthenticated visitors
// ============================================================================

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface GuestHeroBannerProps {
  onSignIn?: () => void;
  className?: string;
}

export const GuestHeroBanner: React.FC<GuestHeroBannerProps> = ({ onSignIn, className = '' }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleSignIn = () => {
    if (onSignIn) {
      onSignIn();
      return;
    }
    const returnTo = encodeURIComponent(
      typeof window !== 'undefined' ? window.location.pathname : '/',
    );
    window.location.href = `/login?returnTo=${returnTo}`;
  };

  return (
    <AnimatePresence>
      <motion.section
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className={`mb-6 p-4 md:p-6 rounded-2xl bg-gradient-to-r from-[var(--brand-primary,#8b5cf6)]/15 via-[var(--surface-elevated,#18181b)] to-[var(--brand-primary,#8b5cf6)]/5 border border-[var(--brand-primary,#8b5cf6)]/30 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden ${className}`}
        aria-label="Welcome banner for guests"
        data-testid="guest-hero-banner"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--brand-primary,#8b5cf6)] text-white flex items-center justify-center font-bold text-xl shadow-md flex-shrink-0">
            ▶
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-[var(--quant-foreground,#ffffff)] tracking-tight">
              Welcome to QuanTube — Explore trending videos, creators, and music.
            </h2>
            <p className="text-sm text-[var(--quant-muted-foreground,#a1a1aa)] mt-0.5">
              Enjoy free, smooth video &amp; music streaming. Sign in anytime to follow creators,
              like, and save favorites.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-shrink-0">
          <button
            onClick={handleSignIn}
            className="px-6 py-2.5 rounded-full bg-[var(--brand-primary,#8b5cf6)] hover:bg-[var(--brand-primary,#8b5cf6)]/90 text-white font-medium text-sm transition-all shadow hover:shadow-md whitespace-nowrap w-full md:w-auto text-center"
            data-testid="guest-banner-signin-btn"
          >
            Sign in / Join Quant
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--quant-muted-foreground,#a1a1aa)] hover:text-[var(--quant-foreground,#ffffff)] hover:bg-white/10 transition-colors"
            aria-label="Dismiss welcome banner"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </motion.section>
    </AnimatePresence>
  );
};

export default GuestHeroBanner;
