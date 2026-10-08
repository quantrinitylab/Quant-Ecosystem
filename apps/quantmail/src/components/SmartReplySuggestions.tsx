'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../services/api-client';
import { QuantyEvidenceLinks } from './QuantyEvidenceLinks';

interface SuggestionView {
  content: string;
  confidence: number;
  evidence: Array<{
    label: string;
    quote?: string;
    quoteTruncated?: boolean;
    deepLink?: string;
  }>;
}

interface SmartReplySuggestionsProps {
  emailId: string;
  onSelectReply: (text: string) => void;
}

export function SmartReplySuggestions({ emailId, onSelectReply }: SmartReplySuggestionsProps) {
  const [suggestions, setSuggestions] = useState<SuggestionView[]>([]);
  const [costCredits, setCostCredits] = useState<number | null>(null);
  const [contextTruncated, setContextTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDismissed(false);

    // No canned fallbacks: a placeholder chip ("Thanks, got it!") is a reply
    // the model never wrote for this thread, and tapping one sends words the
    // user did not mean. When the backend cannot generate, the chips simply
    // do not render.
    //
    // QM-QUANTY-002: the envelope carries evidence refs (which source
    // messages informed each suggestion), provenance, and the upfront cost.
    // Evidence shown under the chips is exactly what the backend returned —
    // never reconstructed on the client.
    apiClient
      .aiSuggestReplies(emailId)
      .then((response) => {
        if (!active) return;
        if (response.success && response.data?.suggestions?.length) {
          setSuggestions(
            response.data.suggestions.slice(0, 3).map((s) => ({
              content: s.content,
              confidence: s.confidence,
              evidence: (s.evidence ?? []).map((e) => ({
                label: e.label,
                quote: e.quote,
                quoteTruncated: e.quoteTruncated,
                deepLink: e.deepLink,
              })),
            })),
          );
          setCostCredits(response.data.cost?.credits ?? null);
          setContextTruncated(response.data.provenance?.contextTruncated ?? false);
        } else {
          setSuggestions([]);
          setCostCredits(null);
        }
      })
      .catch(() => {
        if (active) {
          setSuggestions([]);
          setCostCredits(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [emailId]);

  const handleSelect = useCallback(
    (text: string) => {
      onSelectReply(text);
      setDismissed(true);
    },
    [onSelectReply],
  );

  if (dismissed || loading) return null;

  // Union of evidence across the shown suggestions, de-duplicated by label.
  const evidence = (() => {
    const seen = new Set<string>();
    const out: SuggestionView['evidence'] = [];
    for (const s of suggestions) {
      for (const e of s.evidence) {
        if (!seen.has(e.label)) {
          seen.add(e.label);
          out.push(e);
        }
      }
    }
    return out;
  })();

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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
            </svg>
            Quick replies
            {costCredits !== null && costCredits > 0 && (
              <span className="smart-replies-cost" title="Estimated AI cost for these suggestions">
                · ~{costCredits} credits
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
            {suggestions.map((s) => (
              <button
                key={s.content}
                type="button"
                className="smart-reply-chip shrink-0 whitespace-nowrap text-[11px] sm:text-xs px-2.5 py-1"
                onClick={() => handleSelect(s.content)}
              >
                {s.content}
              </button>
            ))}
          </div>
          <QuantyEvidenceLinks evidence={evidence} />
          {contextTruncated && (
            <p className="smart-replies-truncated" role="note">
              Older thread messages were left out to fit the context budget.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
