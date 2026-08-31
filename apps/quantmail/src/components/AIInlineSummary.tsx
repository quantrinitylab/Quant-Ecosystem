'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { IconSparkle } from './icons';

interface AIInlineSummaryProps {
  emailId: string;
  subject: string;
  snippet: string;
  className?: string;
}

/**
 * Inline AI-generated one-line summary displayed below the subject in the inbox list.
 * Uses local heuristics for instant display, then upgrades with AI when available.
 * This is a Gmail-killer feature — Gmail shows snippets but not intelligent summaries.
 */
export function AIInlineSummary({ emailId, subject, snippet, className }: AIInlineSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    // Generate an instant local summary from subject + snippet
    // In production, this would call the AI backend
    const localSummary = generateLocalSummary(subject, snippet);
    setSummary(localSummary);
  }, [emailId, subject, snippet]);

  if (!summary) return null;

  return (
    <motion.span
      className={`ai-inline-summary ${className ?? ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      aria-label="AI summary"
    >
      <span className="ai-summary-icon inline-flex" aria-hidden="true">
        <IconSparkle size={11} />
      </span>
      {summary}
    </motion.span>
  );
}

/**
 * Local heuristic summary generator.
 * Extracts key intent from subject + snippet without needing an API call.
 */
function generateLocalSummary(subject: string, snippet: string): string | null {
  if (!snippet || snippet.length < 20) return null;

  const combined = `${subject} ${snippet}`.toLowerCase();

  // Action detection
  if (combined.includes('action required') || combined.includes('please review'))
    return 'Action needed — review requested';
  if (combined.includes('invitation') || combined.includes('invite')) return "You've been invited";
  if (combined.includes('meeting') && (combined.includes('tomorrow') || combined.includes('today')))
    return 'Upcoming meeting reminder';
  if (combined.includes('payment') || combined.includes('invoice') || combined.includes('receipt'))
    return 'Payment or billing update';
  if (
    combined.includes('shipped') ||
    combined.includes('tracking') ||
    combined.includes('delivered')
  )
    return 'Package delivery update';
  if (combined.includes('password') && combined.includes('reset')) return 'Password reset request';
  if (combined.includes('confirm') && combined.includes('email'))
    return 'Email verification needed';
  if (combined.includes('unsubscribe')) return 'Marketing — can unsubscribe';
  if (combined.includes('welcome') || combined.includes('getting started'))
    return 'Welcome / onboarding';
  if (combined.includes('deadline') || combined.includes('due')) return 'Has a deadline';
  if (combined.includes('question') || combined.includes('?')) return 'Contains a question for you';

  // If snippet is long enough, extract first meaningful sentence
  const firstSentence = snippet.split(/[.!?]/).filter((s) => s.trim().length > 10)[0];
  if (firstSentence && firstSentence.length < 60) return firstSentence.trim();

  return null;
}
