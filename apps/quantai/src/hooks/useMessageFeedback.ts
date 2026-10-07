// ============================================================================
// QuantAI - useMessageFeedback Hook
// Persists thumbs-up / thumbs-down feedback on an assistant message via
// POST /api/sessions/:id/messages/:messageId/feedback. Optimistic with rollback.
// ============================================================================

import { useState, useCallback } from 'react';
import { getAuthToken } from '../lib/auth';

export type Feedback = 'POSITIVE' | 'NEGATIVE' | null;

interface UseMessageFeedbackReturn {
  /** Current local feedback value per messageId. */
  feedbackByMessage: Record<string, Feedback>;
  isSaving: boolean;
  error: string | null;
  /** Set or toggle feedback. Passing the current value again clears it. */
  setFeedback: (messageId: string, value: Exclude<Feedback, null>) => Promise<void>;
}

export function useMessageFeedback(
  sessionId: string,
  initial: Record<string, Feedback> = {},
): UseMessageFeedbackReturn {
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, Feedback>>(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFeedback = useCallback(
    async (messageId: string, value: Exclude<Feedback, null>) => {
      if (!sessionId) return;

      const previous = feedbackByMessage[messageId] ?? null;
      // Toggle off when re-pressing the active button.
      const next: Feedback = previous === value ? null : value;

      // Optimistic update.
      setFeedbackByMessage((prev) => ({ ...prev, [messageId]: next }));
      setIsSaving(true);
      setError(null);

      try {
        const token = getAuthToken();
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(
            messageId,
          )}/feedback`,
          { method: 'POST', headers, body: JSON.stringify({ feedback: next }) },
        );

        if (!res.ok) {
          throw new Error(`Failed to save feedback: ${res.status}`);
        }
      } catch (err) {
        // Rollback on failure.
        setFeedbackByMessage((prev) => ({ ...prev, [messageId]: previous }));
        setError(err instanceof Error ? err.message : 'Failed to save feedback');
      } finally {
        setIsSaving(false);
      }
    },
    [sessionId, feedbackByMessage],
  );

  return { feedbackByMessage, isSaving, error, setFeedback };
}

export default useMessageFeedback;
