'use client';

import { useMemo } from 'react';

interface WritingMetricsProps {
  text: string;
  className?: string;
}

/**
 * Live writing metrics shown at the bottom of the compose area.
 * Shows word count, character count, and estimated read time.
 * 
 * Neither Gmail nor Superhuman show this — writers love knowing their message length
 * before sending. Keeps emails concise.
 */
export function WritingMetrics({ text, className = '' }: WritingMetricsProps) {
  const metrics = useMemo(() => {
    if (!text.trim()) return null;
    const chars = text.length;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
    const readMinutes = Math.max(1, Math.ceil(words / 238));
    const avgWordsPerSentence = sentences > 0 ? Math.round(words / sentences) : 0;

    // Tone indicator based on sentence length
    let toneHint = '';
    if (avgWordsPerSentence > 25) toneHint = 'Consider shorter sentences';
    else if (avgWordsPerSentence > 18) toneHint = 'Slightly verbose';
    else if (words > 5) toneHint = 'Clear and concise';

    return { chars, words, sentences, readMinutes, avgWordsPerSentence, toneHint };
  }, [text]);

  if (!metrics) return null;

  return (
    <div className={`writing-metrics ${className}`}>
      <span className="wm-item">{metrics.words} words</span>
      <span className="wm-divider">·</span>
      <span className="wm-item">{metrics.chars} chars</span>
      <span className="wm-divider">·</span>
      <span className="wm-item">{metrics.readMinutes} min read</span>
      {metrics.toneHint && (
        <>
          <span className="wm-divider">·</span>
          <span className={`wm-item wm-tone ${metrics.avgWordsPerSentence > 25 ? 'wm-tone--warning' : 'wm-tone--good'}`}>
            {metrics.toneHint}
          </span>
        </>
      )}
    </div>
  );
}
