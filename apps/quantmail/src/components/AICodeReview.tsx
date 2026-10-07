'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { browserApiRequest } from '../services/browser-api-request';

interface AICodeReviewProps {
  prId: string;
  prTitle: string;
  prDiff?: string;
}

interface ReviewComment {
  id: string;
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion' | 'praise';
  comment: string;
  suggestedFix?: string;
}

interface ReviewSummary {
  score: number;
  summary: string;
  comments: ReviewComment[];
  isLoading: boolean;
}

interface CodeReviewResponse {
  success: boolean;
  data?: {
    findings: Array<{
      filePath: string;
      line: number;
      severity: ReviewComment['severity'];
      message: string;
      suggestedFix?: string;
    }>;
    summary: string;
    score: number;
  };
  error?: { message?: string };
}

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: '#f87171' },
  warning: { label: 'Warning', color: '#fbbf24' },
  suggestion: { label: 'Suggestion', color: '#60a5fa' },
  praise: { label: 'Nice', color: '#4ade80' },
};

export function AICodeReview({ prId, prTitle, prDiff }: AICodeReviewProps) {
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const requestReview = useCallback(async () => {
    if (!prDiff?.trim()) {
      setError('This pull request has no diff to review.');
      return;
    }

    setError(null);
    setReview({ score: 0, summary: '', comments: [], isLoading: true });
    try {
      const response = await browserApiRequest('/api/ai/code-review', {
        method: 'POST',
        body: JSON.stringify({ diff: prDiff, prTitle, prDescription: `Pull request ${prId}` }),
      });
      const payload = (await response.json().catch(() => null)) as CodeReviewResponse | null;
      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.error?.message || `Code review failed (${response.status})`);
      }

      setReview({
        score: payload.data.score,
        summary: payload.data.summary,
        comments: payload.data.findings.map((finding, index) => ({
          id: `${finding.filePath}:${finding.line}:${index}`,
          file: finding.filePath,
          line: finding.line,
          severity: finding.severity,
          comment: finding.message,
          suggestedFix: finding.suggestedFix,
        })),
        isLoading: false,
      });
    } catch (requestError) {
      setReview(null);
      setError(
        requestError instanceof Error ? requestError.message : 'Code review is temporarily unavailable.',
      );
    }
  }, [prDiff, prId, prTitle]);

  return (
    <div className="ai-code-review">
      {!review && (
        <>
          <button type="button" className="ai-review-trigger" onClick={() => void requestReview()}>
            <span className="ai-review-icon flex items-center justify-center">
              <svg className="size-5 text-[#FF8C42]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
              </svg>
            </span>
            <div className="ai-review-trigger-text">
              <strong>AI Code Review</strong>
              <span>Analyze this PR for bugs, security issues, and best practices</span>
            </div>
            <span className="ai-review-arrow">→</span>
          </button>
          {error && <p className="ai-review-summary" role="alert">{error}</p>}
        </>
      )}

      <AnimatePresence>
        {review && (
          <motion.div className="ai-review-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            {review.isLoading ? (
              <div className="ai-review-loading"><span className="ai-spinner" /><span>Analyzing the real pull request diff…</span></div>
            ) : (
              <>
                <header className="ai-review-header">
                  <button type="button" className="ai-review-score" onClick={() => setIsExpanded((value) => !value)} aria-expanded={isExpanded}>
                    <div className="score-ring" style={{ background: `conic-gradient(${review.score >= 80 ? '#4ade80' : review.score >= 60 ? '#fbbf24' : '#f87171'} ${review.score * 3.6}deg, #282C35 0deg)` }}><span>{review.score}</span></div>
                    <div><strong>Code Quality Score</strong><span>{review.comments.length} review comments</span></div>
                  </button>
                  <button type="button" className="ai-review-toggle" onClick={() => setIsExpanded((value) => !value)} aria-label={isExpanded ? 'Collapse review' : 'Expand review'}>⌄</button>
                </header>
                {isExpanded && (
                  <>
                    <p className="ai-review-summary">{review.summary}</p>
                    <div className="ai-review-comments">
                      {review.comments.map((comment) => {
                        const config = SEVERITY_CONFIG[comment.severity];
                        return (
                          <div key={comment.id} className="ai-review-comment">
                            <div className="ai-comment-header flex items-center gap-1.5">
                              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                              <span className="ai-comment-severity" style={{ color: config.color }}>{config.label}</span>
                              <span className="ai-comment-file">{comment.file}:{comment.line}</span>
                            </div>
                            <p className="ai-comment-text">{comment.comment}</p>
                            {comment.suggestedFix && <pre className="ai-code-content"><code>{comment.suggestedFix}</code></pre>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
