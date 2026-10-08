'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconSparkle, IconWarning, IconX } from './icons';
import { htmlToPlainText } from '../lib/email-body';

export interface ThreadSummaryResult {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  messageCount: number;
}

export interface SummarySourceMessage {
  from?: { name?: string; email?: string } | null;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  receivedAt?: string | Date;
}

/**
 * Maps thread messages to the backend `POST /ai/summarize-thread` payload.
 * Bodies are capped at 8000 chars each so a huge thread can't blow the
 * AI context budget. Pure and unit-tested.
 */
export function messagesToSummaryPayload(messages: SummarySourceMessage[]) {
  return messages.map((m) => ({
    from: m.from?.name || m.from?.email || 'Unknown',
    subject: m.subject || '',
    body: (m.bodyHtml ? htmlToPlainText(m.bodyHtml) : m.bodyText || m.snippet || '').slice(0, 8000),
    date:
      m.receivedAt instanceof Date
        ? m.receivedAt.toISOString()
        : typeof m.receivedAt === 'string'
          ? m.receivedAt
          : undefined,
  }));
}

interface ThreadSummaryCardProps {
  /** Calls the real backend thread-summarization service. Must not invent content. */
  onSummarize: () => Promise<ThreadSummaryResult>;
}

/**
 * Thread Summary Card — entry point for real AI thread summarization in the
 * thread view. Renders a "Summarize thread" trigger; on click it calls the
 * real backend (`POST /api/ai/summarize-thread` → `AISummarizeService`)
 * and renders the returned summary, key points and action items.
 * Honest loading and error states; never fabricates a summary.
 */
export function ThreadSummaryCard({ onSummarize }: ThreadSummaryCardProps) {
  const [result, setResult] = useState<ThreadSummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSummarize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await onSummarize();
      setResult(r);
    } catch {
      setError('Could not generate summary. Try again.');
    } finally {
      setLoading(false);
    }
  }, [onSummarize]);

  if (!result && !loading && !error) {
    return (
      <button
        type="button"
        className="ai-summary-trigger"
        onClick={handleSummarize}
        aria-label="Summarize this conversation"
      >
        <span className="ai-spark inline-flex">
          <IconSparkle size={12} />
        </span>
        Summarize thread
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="ai-summary-card"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2 }}
      >
        {loading && (
          <div className="ai-summary-loading" role="status" aria-live="polite">
            <div className="ai-loading-dots">
              <span />
              <span />
              <span />
            </div>
            <span>Generating summary…</span>
          </div>
        )}
        {error && (
          <div className="ai-summary-error" role="alert">
            <span className="inline-flex items-center gap-1.5">
              <IconWarning size={12} />
              {error}
            </span>
            <button type="button" onClick={handleSummarize}>
              Retry
            </button>
          </div>
        )}
        {result && (
          <div className="ai-summary-result">
            <header className="ai-summary-result-header">
              <span className="ai-spark inline-flex">
                <IconSparkle size={12} />
              </span>
              <strong>Thread summary</strong>
              <button
                type="button"
                onClick={() => setResult(null)}
                aria-label="Dismiss summary"
                className="inline-flex items-center justify-center"
              >
                <IconX size={13} />
              </button>
            </header>
            <p className="ai-summary-text">{result.summary}</p>
            {result.keyPoints && result.keyPoints.length > 0 && (
              <div className="mt-2">
                <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-[#FF9B5A]">
                  Key points
                </p>
                <ul className="mt-1 space-y-1">
                  {result.keyPoints.map((point, i) => (
                    <li key={i} className="text-[0.72rem] leading-snug text-[#bbb]">
                      · {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.actionItems && result.actionItems.length > 0 && (
              <div className="mt-2">
                <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-[#FF9B5A]">
                  Action items
                </p>
                <ul className="mt-1 space-y-1">
                  {result.actionItems.map((item, i) => (
                    <li key={i} className="text-[0.72rem] leading-snug text-[#bbb]">
                      ☐ {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
