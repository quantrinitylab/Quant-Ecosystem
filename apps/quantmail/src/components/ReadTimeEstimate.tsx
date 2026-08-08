'use client';

interface ReadTimeEstimateProps {
  text: string;
  className?: string;
}

/**
 * Estimates read time based on average reading speed of 238 words per minute.
 * Shows "< 1 min" for short emails, exact minutes for longer ones.
 */
export function ReadTimeEstimate({ text, className = '' }: ReadTimeEstimateProps) {
  if (!text) return null;

  const wordCount = text.trim().split(/\s+/).length;

  if (wordCount < 50) return null; // Don't show for very short emails

  const minutes = Math.max(1, Math.ceil(wordCount / 238));
  const label = minutes === 1 ? '1 min read' : `${minutes} min read`;

  return (
    <span
      className={`read-time-estimate ${className}`}
      aria-label={label}
      title="Based on 238 words per minute average reading speed"
    >
      {label}
    </span>
  );
}
