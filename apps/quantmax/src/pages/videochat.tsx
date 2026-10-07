// ============================================================================
// QuantMax - Random Video Chat (Omegle-style)
//
// HONESTY REWRITE (2026-10-07): this page previously fabricated everything —
// a random "User{N}" match, a fake country, fake avatar CDN URLs, jittered
// connection stats, and canned bot replies ("Hey!", "Nice to meet you!…") that
// made it look like you were chatting with a real person. It is now wired to
// the REAL backend (POST /videochat/join|skip|end via the Fastify
// VideoChatService): real interest-based matchmaking against the live waiting
// queue, real session records, real report endpoint. Because the frontend has
// no LiveKit client SDK yet, live video/audio cannot start on this client —
// the page says so honestly instead of faking a video call.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { ErrorState } from '@quant/shared-ui';
import { apiClient } from '../services/api-client';

interface VideoChatSessionView {
  id: string;
  participants: string[];
  status: string;
  matchedInterests: string[];
  hasTextFallback: boolean;
  startedAt: string;
}

interface JoinResult {
  status: 'waiting' | 'matched';
  session?: VideoChatSessionView;
  roomName?: string;
  /** The other real participant's user id — used for report actions only. */
  partnerUserId?: string | null;
  /** Present only when LiveKit is configured server-side. */
  selfToken?: string;
}

type ConnectionState =
  | 'idle'
  | 'searching'
  | 'connected'
  | 'disconnected'
  | 'error';

const SUGGESTED_INTERESTS = [
  'Music',
  'Gaming',
  'Travel',
  'Tech',
  'Sports',
  'Art',
  'Movies',
  'Cooking',
  'Fitness',
  'Books',
  'Photography',
  'Dance',
  'Comedy',
  'Fashion',
  'Science',
  'Nature',
  'Languages',
  'Anime',
  'Coding',
];

const POLL_INTERVAL_MS = 2500;

const VideoChatPage: React.FC = () => {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('idle');
  const [session, setSession] = useState<VideoChatSessionView | null>(null);
  const [partnerUserId, setPartnerUserId] = useState<string | null>(null);
  const [hasMediaToken, setHasMediaToken] = useState<boolean>(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [searchDuration, setSearchDuration] = useState<number>(0);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('');
  const [reportSubmitting, setReportSubmitting] = useState<boolean>(false);
  const [reportDone, setReportDone] = useState<boolean>(false);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const stopTimers = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    pollTimerRef.current = null;
    searchTimerRef.current = null;
    callTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      stopTimers();
      // Best-effort: leave any queue/session on unmount.
      apiClient.endVideoChat().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Call duration timer, ticked from the backend's real startedAt.
  useEffect(() => {
    if (connectionState === 'connected' && session?.startedAt) {
      const startedAt = new Date(session.startedAt).getTime();
      const tick = () =>
        setCallDuration(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      tick();
      callTimerRef.current = setInterval(tick, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      callTimerRef.current = null;
      if (connectionState !== 'connected') setCallDuration(0);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    };
  }, [connectionState, session]);

  const handleMatch = useCallback((result: JoinResult) => {
    if (!result.session) return;
    // The partner is a REAL user paired by the backend. We intentionally show
    // them anonymously — never a fabricated name, country, or avatar.
    setSession(result.session);
    setPartnerUserId(result.partnerUserId ?? null);
    setHasMediaToken(Boolean(result.selfToken));
    setError(null);
    setConnectionState('connected');
  }, []);

  /**
   * Calls join (idempotent server-side). Returns 'matched' when a real partner
   * was found, 'waiting' when still queued, 'error' when state was set.
   */
  const pollForMatch = useCallback(
    async (prefs: { interests: string[] }): Promise<'matched' | 'waiting' | 'error'> => {
      try {
        const res = await apiClient.joinVideoChat(prefs);
        if (cancelledRef.current) return 'error';
        if (!res.success) {
          setError(res.error?.message || 'Matchmaking failed. Please try again.');
          setConnectionState('error');
          return 'error';
        }
        const result = res.data as unknown as JoinResult;
        if (result.status === 'matched') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (searchTimerRef.current) clearInterval(searchTimerRef.current);
          handleMatch(result);
          return 'matched';
        }
        // status === 'waiting': keep polling; backend join() is idempotent and
        // returns the match as soon as a compatible real user queues up.
        return 'waiting';
      } catch {
        if (cancelledRef.current) return 'error';
        setError('Could not reach the matchmaking service. Please try again.');
        setConnectionState('error');
        return 'error';
      }
    },
    [handleMatch],
  );

  const startSearch = useCallback(async () => {
    cancelledRef.current = false;
    stopTimers();
    setError(null);
    setSession(null);
    setPartnerUserId(null);
    setHasMediaToken(false);
    setReportDone(false);
    setSearchDuration(0);
    setConnectionState('searching');

    const prefs = { interests };

    searchTimerRef.current = setInterval(() => {
      setSearchDuration((prev) => prev + 1);
    }, 1000);

    const outcome = await pollForMatch(prefs);
    if (outcome !== 'waiting') return; // matched or errored — nothing to poll
    if (cancelledRef.current) return;
    pollTimerRef.current = setInterval(() => {
      void pollForMatch(prefs);
    }, POLL_INTERVAL_MS);
  }, [interests, pollForMatch, stopTimers]);

  const handleSkip = useCallback(async () => {
    stopTimers();
    setConnectionState('searching');
    setSession(null);
    setPartnerUserId(null);
    setSearchDuration(0);
    searchTimerRef.current = setInterval(() => {
      setSearchDuration((prev) => prev + 1);
    }, 1000);
    try {
      const res = await apiClient.skipVideoChat();
      if (cancelledRef.current) return;
      if (!res.success) {
        setError(res.error?.message || 'Skip failed. Please try again.');
        setConnectionState('error');
        return;
      }
      const result = (res.data as unknown as { data?: JoinResult }).data ??
        (res.data as unknown as JoinResult);
      if (result.status === 'matched') {
        if (searchTimerRef.current) clearInterval(searchTimerRef.current);
        handleMatch(result);
      } else {
        pollTimerRef.current = setInterval(() => {
          void pollForMatch({ interests });
        }, POLL_INTERVAL_MS);
      }
    } catch {
      if (cancelledRef.current) return;
      setError('Could not reach the matchmaking service. Please try again.');
      setConnectionState('error');
    }
  }, [handleMatch, interests, pollForMatch, stopTimers]);

  const handleDisconnect = useCallback(async () => {
    cancelledRef.current = true;
    stopTimers();
    try {
      await apiClient.endVideoChat();
    } catch {
      // Ending is best-effort; the UI still returns to idle.
    }
    setSession(null);
    setPartnerUserId(null);
    setConnectionState('idle');
  }, [stopTimers]);

  const handleAddInterest = useCallback(
    (interest: string) => {
      const trimmed = interest.trim();
      if (trimmed && !interests.includes(trimmed) && interests.length < 10) {
        setInterests((prev) => [...prev, trimmed]);
        setInterestInput('');
      }
    },
    [interests],
  );

  const handleRemoveInterest = useCallback((interest: string) => {
    setInterests((prev) => prev.filter((i) => i !== interest));
  }, []);

  const handleReport = useCallback(async () => {
    if (!reportReason.trim() || !partnerUserId) return;
    setReportSubmitting(true);
    try {
      const res = await apiClient.reportUser(partnerUserId, reportReason, 'Reported from random video chat');
      if (res.success) {
        setReportDone(true);
        setShowReportModal(false);
        setReportReason('');
        // Leave this session after reporting — same as skipping.
        await handleSkip();
      } else {
        setError(res.error?.message || 'Report failed. Please try again.');
      }
    } catch {
      setError('Could not submit the report. Please try again.');
    } finally {
      setReportSubmitting(false);
    }
  }, [reportReason, partnerUserId, handleSkip]);

  const formatDuration = (totalSeconds: number): string => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Idle state - interest selection and start
  if (connectionState === 'idle') {
    return (
      <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
        <div className="max-w-md mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', ...spring.gentle }}
            className="text-center mb-8"
          >
            <h1 className="text-2xl font-bold mb-2">Video Chat</h1>
            <p className="text-sm text-[var(--quant-muted-foreground)]">
              Meet real people with shared interests
            </p>
          </motion.div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-[var(--quant-muted-foreground)] mb-3">
              Your Interests
            </h3>
            <div className="flex gap-2 mb-3">
              <input
                className="flex-1 h-11 px-4 rounded-lg bg-[var(--quant-card)] border border-[var(--quant-border)] text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--brand-primary)]"
                placeholder="Add an interest..."
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddInterest(interestInput)}
              />
              <button
                className="h-11 w-11 rounded-lg bg-[var(--brand-primary)] text-white font-bold flex items-center justify-center"
                onClick={() => handleAddInterest(interestInput)}
              >
                +
              </button>
            </div>
            {interests.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {interests.map((interest) => (
                  <span
                    key={interest}
                    className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] text-sm font-medium border border-[var(--brand-primary)]/30"
                  >
                    {interest}
                    <button
                      className="ml-0.5 text-xs hover:opacity-70"
                      onClick={() => handleRemoveInterest(interest)}
                    >
                      &#10005;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="mb-4">
              <h4 className="text-xs font-medium text-[var(--quant-muted-foreground)] mb-2">
                Suggested
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_INTERESTS.filter((s) => !interests.includes(s))
                  .slice(0, 12)
                  .map((suggestion) => (
                    <button
                      key={suggestion}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--quant-card)] border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] transition-colors"
                      onClick={() => handleAddInterest(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-3 min-h-[44px] rounded-xl bg-[var(--brand-primary)] text-white font-semibold text-base hover:opacity-90 transition-opacity"
            onClick={startSearch}
          >
            Start Matching
          </motion.button>

          {reportDone && (
            <p className="text-center text-xs text-green-500 mt-4">
              Report submitted. Thanks for keeping QuantMax safe.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Searching state
  if (connectionState === 'searching') {
    return (
      <div className="min-h-screen bg-[var(--quant-background)] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', ...spring.gentle }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative w-24 h-24">
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-[var(--brand-primary)] opacity-30"
              animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-2 rounded-full border-2 border-[var(--brand-primary)] opacity-30"
              animate={{ scale: [1, 1.6], opacity: [0.3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
            />
            <motion.div
              className="absolute inset-4 rounded-full border-2 border-[var(--brand-primary)] opacity-30"
              animate={{ scale: [1, 1.4], opacity: [0.3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">
              &#128269;
            </div>
          </div>
          <h2 className="text-xl font-bold text-[var(--quant-foreground)]">
            Finding someone real...
          </h2>
          <p className="text-sm text-[var(--quant-muted-foreground)]">
            Searching for {searchDuration}s — waiting for a real person to match
            your interests.
          </p>
          {interests.length > 0 && (
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              Looking for: {interests.join(', ')}
            </p>
          )}
          <button
            className="mt-4 px-6 py-2 min-h-[44px] text-sm font-medium border border-[var(--quant-border)] rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-card)] transition-colors"
            onClick={handleDisconnect}
          >
            Cancel
          </button>
        </motion.div>
      </div>
    );
  }

  // Error state
  if (connectionState === 'error') {
    return (
      <div className="min-h-screen bg-[var(--quant-background)] flex items-center justify-center">
        <ErrorState
          message={error || 'Connection failed. Please try again.'}
          onRetry={startSearch}
        />
      </div>
    );
  }

  // Disconnected state
  if (connectionState === 'disconnected') {
    return (
      <div className="min-h-screen bg-[var(--quant-background)] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[var(--quant-foreground)] mb-2">
            Chat ended
          </h2>
          <button
            className="mt-4 px-6 py-2 min-h-[44px] text-sm font-medium rounded-lg bg-[var(--brand-primary)] text-white"
            onClick={startSearch}
          >
            Match again
          </button>
        </div>
      </div>
    );
  }

  // Connected state — a REAL matched session, real data only.
  return (
    <div className="videochat-page connected">
      <div className="videochat-session-card">
        <h2 className="text-xl font-bold text-[var(--quant-foreground)] mb-1">
          You&apos;re matched 🎉
        </h2>
        <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
          With a real QuantMax user, paired by shared interests.
        </p>

        {session && session.matchedInterests.length > 0 && (
          <div className="matched-interests-banner mb-4">
            <span className="match-label">Common interests:</span>
            {session.matchedInterests.map((interest) => (
              <span key={interest} className="matched-interest-tag">
                {interest}
              </span>
            ))}
          </div>
        )}

        <div className="session-meta mb-4">
          <span className="call-timer" aria-label="Session duration">
            {formatDuration(callDuration)}
          </span>
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            Matched partner is anonymous until you both opt to share profiles.
          </span>
        </div>

        {!hasMediaToken && (
          <div className="media-unavailable-notice">
            <p>
              📹 Live video isn&apos;t available yet — this client has no
              real-time media wired up, so we&apos;re not faking a video call.
              The match above is real; video/audio starts when media support
              ships.
            </p>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="videochat-controls">
        <button className="control-btn skip-btn" onClick={handleSkip}>
          <span className="control-icon">⏭️</span>
          <span className="control-label">Next</span>
        </button>
        <button
          className="control-btn report-btn"
          onClick={() => setShowReportModal(true)}
        >
          <span className="control-icon">⚠️</span>
          <span className="control-label">Report</span>
        </button>
        <button className="control-btn end-btn" onClick={handleDisconnect}>
          <span className="control-icon">📞</span>
          <span className="control-label">End</span>
        </button>
      </div>

      {/* Report Modal — wired to the real safety/report endpoint */}
      {showReportModal && (
        <div
          className="report-modal-overlay"
          onClick={() => setShowReportModal(false)}
        >
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="report-title">Report User</h3>
            <div className="report-reasons">
              {[
                'Inappropriate content',
                'Harassment',
                'Spam',
                'Underage user',
                'Other',
              ].map((reason) => (
                <button
                  key={reason}
                  className={`report-reason-btn ${
                    reportReason === reason ? 'selected' : ''
                  }`}
                  onClick={() => setReportReason(reason)}
                >
                  {reason}
                </button>
              ))}
            </div>
            <div className="report-actions">
              <button
                className="cancel-report"
                onClick={() => setShowReportModal(false)}
              >
                Cancel
              </button>
              <button
                className="submit-report"
                onClick={handleReport}
                disabled={!reportReason || reportSubmitting}
              >
                {reportSubmitting ? 'Reporting…' : 'Report & Skip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoChatPage;
