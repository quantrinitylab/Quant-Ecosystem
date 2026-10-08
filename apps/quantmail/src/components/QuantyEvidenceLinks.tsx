'use client';

/**
 * QM-QUANTY-002 — Evidence links for Quanty outputs inside QuantMail.
 *
 * Every Quanty output (reply suggestion, summary, draft assist) carries
 * EvidenceRefs: typed pointers back to the source mail/thread that informed
 * it. This component renders them honestly:
 * - renders only the refs it is given — never invents sources;
 * - renders nothing at all when there is no evidence;
 * - shows the verbatim quote (when present) as an accessible tooltip;
 * - exposes the canonical deep link in the title for debugging; it does not
 *   fabricate in-app navigation for quant:// links the web shell cannot route.
 */

export interface EvidenceRefView {
  label: string;
  quote?: string;
  quoteTruncated?: boolean;
  deepLink?: string;
}

interface QuantyEvidenceLinksProps {
  evidence: EvidenceRefView[];
  /** Compact one-line rendering for inline surfaces (default) vs wrapped list. */
  variant?: 'inline' | 'list';
  className?: string;
}

export function QuantyEvidenceLinks({
  evidence,
  variant = 'inline',
  className = '',
}: QuantyEvidenceLinksProps) {
  if (!evidence || evidence.length === 0) return null;

  return (
    <div
      className={`quanty-evidence ${variant === 'list' ? 'quanty-evidence-list' : 'quanty-evidence-inline'} ${className}`}
      aria-label={`Based on ${evidence.length} source${evidence.length === 1 ? '' : 's'}`}
    >
      <span className="quanty-evidence-caption" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" className="size-3">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        Sources
      </span>
      {evidence.map((ref, i) => (
        <span
          key={`${ref.label}-${i}`}
          className="quanty-evidence-chip"
          title={[
            ref.quote ? `“${ref.quote}”${ref.quoteTruncated ? ' (truncated)' : ''}` : null,
            ref.deepLink ? `Ref: ${ref.deepLink}` : null,
          ]
            .filter(Boolean)
            .join('\n') || ref.label}
        >
          {ref.label}
        </span>
      ))}
    </div>
  );
}
