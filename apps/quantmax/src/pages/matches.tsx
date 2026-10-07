// ============================================================================
// QuantMax - Match List
// Horizontal scrollable new matches row, conversations list with last message
// ============================================================================

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { ErrorState, EmptyState, StaggerList } from '@quant/shared-ui';
import { useMatching } from '../hooks/useMatching';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

const avatarVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', ...spring.snappy },
  },
};

const MatchesPage: React.FC = () => {
  const matching = useMatching();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const matches = matching.matches || [];

  if (matching.isLoading && matches.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--quant-background)] p-4">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Avatar row skeleton */}
          <div className="flex gap-3 overflow-hidden pb-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-[var(--quant-muted)] animate-pulse" />
                <div className="w-12 h-3 rounded bg-[var(--quant-muted)] animate-pulse" />
              </div>
            ))}
          </div>
          {/* Conversation list skeleton */}
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--quant-card)]">
              <div className="w-12 h-12 rounded-full bg-[var(--quant-muted)] animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-[var(--quant-muted)] animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-[var(--quant-muted)] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (matching.error) {
    return (
      <div className="min-h-screen bg-[var(--quant-background)] flex items-center justify-center">
        <ErrorState message={matching.error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--quant-background)] flex items-center justify-center">
        <EmptyState title="No matches yet" description="Keep swiping to find your matches!" />
      </div>
    );
  }

  const newMatches = matches.filter(
    (m: { unread?: boolean; lastMessage?: string }) => !m.lastMessage,
  );
  const conversations = matches.filter((m: { lastMessage?: string }) => m.lastMessage);

  return (
    <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Messages</h1>

        {newMatches.length > 0 && (
          <section className="mb-6">
            <h3 className="text-sm font-semibold text-[var(--quant-muted-foreground)] mb-3">
              New Matches
            </h3>
            <motion.div
              className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
            >
              {newMatches.map(
                (match: {
                  id: string;
                  matchedProfile?: { displayName?: string; photos?: string[] };
                }) => (
                  <motion.button
                    key={match.id}
                    variants={avatarVariants}
                    whileTap={{ scale: 0.92 }}
                    className="flex flex-col items-center gap-1.5 flex-shrink-0 min-w-[68px]"
                    onClick={() => setSelectedMatchId(match.id)}
                  >
                    <div className="p-[2px] rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--quant-info)]">
                      <div className="p-[2px] rounded-full bg-[var(--quant-background)]">
                        <img
                          className="w-14 h-14 rounded-full object-cover"
                          src={match.matchedProfile?.photos?.[0] || ''}
                          alt={match.matchedProfile?.displayName || ''}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-[var(--quant-foreground)] truncate w-16 text-center">
                      {match.matchedProfile?.displayName}
                    </span>
                  </motion.button>
                ),
              )}
            </motion.div>
          </section>
        )}

        <section>
          <h3 className="text-sm font-semibold text-[var(--quant-muted-foreground)] mb-3">
            Conversations
          </h3>
          {conversations.length === 0 ? (
            <EmptyState
              title="No conversations yet"
              description="Send a message to your matches!"
            />
          ) : (
            <StaggerList staggerDelay={0.04} className="space-y-1">
              {conversations.map(
                (match: {
                  id: string;
                  matchedProfile?: { displayName?: string; photos?: string[] };
                  lastMessage?: string;
                  unread?: boolean;
                }) => (
                  <div
                    key={match.id}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-[var(--quant-card)] ${match.unread ? 'bg-[var(--quant-card)]' : ''}`}
                    onClick={() => setSelectedMatchId(match.id)}
                  >
                    <img
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      src={match.matchedProfile?.photos?.[0] || ''}
                      alt={match.matchedProfile?.displayName || ''}
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-sm ${match.unread ? 'font-bold' : 'font-medium'} text-[var(--quant-foreground)] block truncate`}
                      >
                        {match.matchedProfile?.displayName}
                      </span>
                      <span className="text-xs text-[var(--quant-muted-foreground)] block truncate">
                        {match.lastMessage}
                      </span>
                    </div>
                    {match.unread && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[var(--brand-primary)] flex-shrink-0" />
                    )}
                  </div>
                ),
              )}
            </StaggerList>
          )}
        </section>
      </div>
    </div>
  );
};

export default MatchesPage;
