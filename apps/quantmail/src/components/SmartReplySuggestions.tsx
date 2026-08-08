'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../services/api-client';

interface SmartReplySuggestionsProps {
  emailId: string;
  onSelectReply: (text: string) => void;
}

const FALLBACK_REPLIES = [
  'Thanks, got it!',
  'Sounds good, let me take a look.',
  'I'll get back to you on this shortly.',
];

export function SmartReplySuggestions({ emailId, onSelectReply }: SmartReplySuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDismissed(false);

    apiClient
      .aiSuggestReplies(emailId)
      .then((response) => {
        if (!active) return;
        if (response.success && response.data?.suggestions?.length) {
          setSuggestions(response.data.suggestions.slice(0, 3));
        } else {
          setSuggestions(FALLBACK_REPLIES);
        }
      })
      .catch(() => {
        if (active) setSuggestions(FALLBACK_REPLIES);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [emailId]);

  const handleSelect = useCallback(
    (text: string) => {
      onSelectReply(text);
      setDismissed(true);
    },
    [onSelectReply],
  );

  if (dismissed || loading) return null;

  return (
    <AnimatePresence>
      {suggestions.length > 0 && (
        <motion.div
          className="smart-replies"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          aria-label="Quick reply suggestions"
        >
          <span className="smart-replies-label" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
            </svg>
            Quick replies
          </span>
          <div className="smart-replies-options">
            {suggestions.map((text) => (
              <button
                key={text}
                type="button"
                className="smart-reply-chip"
                onClick={() => handleSelect(text)}
              >
                {text}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
