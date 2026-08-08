'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { showToast } from './InboxToast';

interface ThreadMuteProps {
  threadId: string;
  subject: string;
  isMuted?: boolean;
  onMute: (threadId: string) => Promise<void>;
  onUnmute: (threadId: string) => Promise<void>;
}

/**
 * Thread Mute — silences a noisy email thread.
 * Gmail buries this in a menu. We make it a prominent one-click action
 * shown when a thread has many participants or frequent replies.
 */
export function ThreadMute({ threadId, subject, isMuted = false, onMute, onUnmute }: ThreadMuteProps) {
  const [muted, setMuted] = useState(isMuted);
  const [loading, setLoading] = useState(false);

  const handleToggle = useCallback(async () => {
    setLoading(true);
    try {
      if (muted) {
        await onUnmute(threadId);
        setMuted(false);
        showToast({ text: 'Thread unmuted — new replies will appear in inbox', type: 'info' });
      } else {
        await onMute(threadId);
        setMuted(true);
        showToast({
          text: `Thread muted — "${subject.slice(0, 30)}${subject.length > 30 ? '…' : ''}" won't bother you`,
          type: 'success',
          undoAction: async () => {
            await onUnmute(threadId);
            setMuted(false);
          },
        });
      }
    } catch {
      showToast({ text: 'Could not update mute status', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [muted, onMute, onUnmute, subject, threadId]);

  return (
    <button
      type="button"
      className={`thread-mute-btn ${muted ? 'is-muted' : ''}`}
      onClick={handleToggle}
      disabled={loading}
      aria-pressed={muted}
      title={muted ? 'Unmute thread' : 'Mute thread'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        {muted ? (
          <>
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </>
        ) : (
          <>
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </>
        )}
      </svg>
      <span>{muted ? 'Muted' : 'Mute'}</span>
    </button>
  );
}
