// ============================================================================
// QuantMax - Dating Swipe Cards (Tinder-style) with Framer Motion
// ============================================================================

import React, { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { ErrorState } from '@quant/shared-ui';
import { useMatching } from '../hooks/useMatching';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

const cardVariants = {
  enter: { opacity: 0, scale: 0.9, y: 30 },
  center: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: -20 },
};

const MatchingPage: React.FC = () => {
  const matching = useMatching();

  const currentProfile = matching.currentProfile;

  const handleLike = useCallback(() => {
    if (currentProfile) {
      matching.like(currentProfile.id);
    }
  }, [matching, currentProfile]);

  const handlePass = useCallback(() => {
    if (currentProfile) {
      matching.pass(currentProfile.id);
    }
  }, [matching, currentProfile]);

  const handleSuperLike = useCallback(() => {
    if (currentProfile) {
      matching.superLike(currentProfile.id);
    }
  }, [matching, currentProfile]);

  if (matching.isLoading && !currentProfile) {
    return <LoadingSkeleton variant="swipe-card" />;
  }

  if (matching.error) {
    return <ErrorState message={matching.error} onRetry={() => window.location.reload()} />;
  }

  if (!currentProfile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--quant-background)] px-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', ...spring.bouncy }}
          className="text-6xl"
        >
          &#128149;
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-4 text-xl font-bold text-[var(--quant-foreground)]"
        >
          No more profiles nearby
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-2 text-center text-sm text-[var(--quant-muted-foreground)]"
        >
          Check back later or expand your search distance to find new people
        </motion.p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--quant-background)] px-4 py-8">
      {/* Card Stack */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentProfile.id}
          variants={cardVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', ...spring.gentle }}
          className="w-full max-w-sm"
        >
          <div className="overflow-hidden rounded-2xl bg-[var(--quant-card)] shadow-xl">
            {/* Photo with Swipe Dots */}
            <div className="relative">
              {currentProfile.photos &&
                currentProfile.photos.length > 0 &&
                currentProfile.photos[0] && (
                  <img
                    className="h-[400px] w-full object-cover"
                    src={currentProfile.photos[0].url}
                    alt={currentProfile.displayName}
                  />
                )}
              {/* Photo Dots */}
              {currentProfile.photos && currentProfile.photos.length > 1 && (
                <div className="absolute top-3 inset-x-3 flex gap-1">
                  {currentProfile.photos.map((_: unknown, idx: number) => (
                    <div
                      key={idx}
                      className={`h-0.5 flex-1 rounded-full ${idx === 0 ? 'bg-white' : 'bg-white/40'}`}
                    />
                  ))}
                </div>
              )}
              {currentProfile.verified === 'verified' && (
                <div className="absolute right-3 top-3 rounded-full bg-[var(--quant-info)] p-1.5">
                  <span className="text-xs text-white">&#10003;</span>
                </div>
              )}
              {/* Distance Badge */}
              {currentProfile.location && (
                <div className="absolute left-3 top-3 rounded-full bg-black/50 backdrop-blur-sm px-2.5 py-1">
                  <span className="text-xs text-white font-medium">
                    {currentProfile.location.city}
                  </span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
            </div>

            {/* Info */}
            <div className="p-4">
              <h2 className="text-lg font-bold text-[var(--quant-foreground)]">
                {currentProfile.displayName}, {currentProfile.age}
              </h2>
              {currentProfile.location && (
                <span className="text-sm text-[var(--quant-muted-foreground)]">
                  {currentProfile.location.city}
                </span>
              )}
              {currentProfile.bio && (
                <p className="mt-2 text-sm text-[var(--foreground-secondary)] line-clamp-2">
                  {currentProfile.bio}
                </p>
              )}
              {currentProfile.interests && currentProfile.interests.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {currentProfile.interests.map((interest: string) => (
                    <span
                      key={interest}
                      className="rounded-full border border-brand-app/30 bg-brand-app/10 px-2.5 py-0.5 text-xs font-medium text-brand-app"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="mt-6 flex items-center justify-center gap-4">
        {/* Undo */}
        {matching.canUndo && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--quant-warning)] text-[var(--quant-warning)] shadow-lg"
            onClick={() => matching.undo()}
            aria-label="Undo last action"
          >
            <span className="text-sm">&#8630;</span>
          </motion.button>
        )}

        {/* Pass (X) */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--quant-destructive)] text-[var(--quant-destructive)] shadow-lg"
          onClick={handlePass}
          aria-label="Pass"
        >
          <motion.span
            className="text-xl"
            animate={{ rotate: 0 }}
            whileTap={{ rotate: -15, scale: 1.2 }}
          >
            &#10005;
          </motion.span>
        </motion.button>

        {/* Super Like (Star) */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--quant-info)] text-[var(--quant-info)] shadow-lg"
          onClick={handleSuperLike}
          aria-label="Super Like"
        >
          <motion.span className="text-lg" whileTap={{ scale: 1.4, y: -5 }}>
            &#11088;
          </motion.span>
        </motion.button>

        {/* Like (Heart) */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--quant-success)] text-[var(--quant-success)] shadow-lg"
          onClick={handleLike}
          aria-label="Like"
        >
          <motion.span className="text-xl" whileTap={{ scale: 1.3 }}>
            &#9829;
          </motion.span>
        </motion.button>

        {/* Boost */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-purple-500 text-purple-500 shadow-lg"
          aria-label="Boost your profile"
        >
          <span className="text-sm">&#9889;</span>
        </motion.button>
      </div>

      {/* Match Celebration */}
      <AnimatePresence>
        {matching.matchCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={() => matching.dismissCelebration()}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', ...spring.bouncy }}
              className="mx-4 max-w-sm rounded-2xl bg-[var(--quant-card)] p-8 text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-5xl">&#127881;</div>
              <h1 className="mt-4 text-2xl font-bold text-[var(--quant-foreground)]">
                It is a Match!
              </h1>
              <p className="mt-2 text-sm text-[var(--quant-muted-foreground)]">
                You and {matching.matchCelebration.profileName} liked each other
              </p>
              <button
                className="mt-6 w-full rounded-xl bg-brand-app py-3 font-semibold text-white"
                onClick={() => matching.dismissCelebration()}
              >
                Send a Message
              </button>
              <button
                className="mt-2 w-full rounded-xl py-3 text-sm text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
                onClick={() => matching.dismissCelebration()}
              >
                Keep Swiping
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MatchingPage;
