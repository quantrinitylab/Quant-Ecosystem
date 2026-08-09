'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AISummaryCardProps {
  emailId: string;
  onSummarize: (emailId: string) => Promise<string>;
}

/**
 * AI Summary Card — expandable card that shows AI-generated email summary.
 * Triggered by clicking "Summarize" on any email.
 * Uses Cloudflare Workers AI (Llama 3.2) via the backend.
 */
export function AISummaryCard({ emailId, onSummarize }: AISummaryCardProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSummarize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await onSummarize(emailId);
      setSummary(result);
    } catch {
      setError('Could not generate summary. Try again.');
    } finally {
      setLoading(false);
    }
  }, [emailId, onSummarize]);

  if (!summary && !loading && !error) {
    return (
      <button type="button" className="ai-summary-trigger" onClick={handleSummarize}>
        <span className="ai-spark">✦</span>
        Summarize with AI
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
          <div className="ai-summary-loading">
            <div className="ai-loading-dots">
              <span /><span /><span />
            </div>
            <span>Generating summary…</span>
          </div>
        )}
        {error && (
          <div className="ai-summary-error">
            <span>⚠️ {error}</span>
            <button type="button" onClick={handleSummarize}>Retry</button>
          </div>
        )}
        {summary && (
          <div className="ai-summary-result">
            <header className="ai-summary-result-header">
              <span className="ai-spark">✦</span>
              <strong>AI Summary</strong>
              <button type="button" onClick={() => setSummary(null)}>×</button>
            </header>
            <p className="ai-summary-text">{summary}</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
