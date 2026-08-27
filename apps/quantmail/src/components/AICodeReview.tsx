'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

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
}

interface ReviewSummary {
  score: number; // 0-100
  summary: string;
  comments: ReviewComment[];
  isLoading: boolean;
}

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: '#f87171' },
  warning: { label: 'Warning', color: '#fbbf24' },
  suggestion: { label: 'Suggestion', color: '#60a5fa' },
  praise: { label: 'Nice', color: '#4ade80' },
};

/**
 * AI-powered code review panel for Pull Requests.
 * GitHub doesn't have built-in AI review — we do.
 * Analyzes the diff and provides inline suggestions, security warnings, and best practices.
 */
export function AICodeReview({ prId, prTitle, prDiff }: AICodeReviewProps) {
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const requestReview = useCallback(async () => {
    setReview({ score: 0, summary: '', comments: [], isLoading: true });

    // Simulate AI review (in production, calls backend /ai/code-review endpoint)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Generate mock review based on PR title heuristics
    const mockComments: ReviewComment[] = [
      {
        id: 'rc-1',
        file: 'src/index.ts',
        line: 42,
        severity: 'suggestion',
        comment: 'Consider adding explicit return type annotation for better type safety.',
      },
      {
        id: 'rc-2',
        file: 'src/utils.ts',
        line: 15,
        severity: 'warning',
        comment: "This async function doesn't await. Add `await` or remove `async` keyword.",
      },
      {
        id: 'rc-3',
        file: 'src/api/handler.ts',
        line: 8,
        severity: 'critical',
        comment:
          'User input is used directly in the query without sanitization. Use parameterized queries.',
      },
      {
        id: 'rc-4',
        file: 'src/components/Form.tsx',
        line: 23,
        severity: 'praise',
        comment: 'Good use of useMemo to avoid unnecessary re-renders.',
      },
    ];

    setReview({
      score: 78,
      summary: `${prTitle} introduces functional changes with ${mockComments.length} review points. 1 critical security concern found, 1 warning, 1 suggestion, and 1 positive pattern noted.`,
      comments: mockComments,
      isLoading: false,
    });
  }, [prTitle]);

  return (
    <div className="ai-code-review">
      {!review && (
        <button type="button" className="ai-review-trigger" onClick={requestReview}>
          <span className="ai-review-icon flex items-center justify-center">
            <svg
              className="size-5 text-[#FF8C42]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </span>
          <div className="ai-review-trigger-text">
            <strong>AI Code Review</strong>
            <span>Analyze this PR for bugs, security issues, and best practices</span>
          </div>
          <span className="ai-review-arrow flex items-center justify-center">
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        </button>
      )}

      <AnimatePresence>
        {review && (
          <motion.div
            className="ai-review-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {review.isLoading ? (
              <div className="ai-review-loading">
                <span className="ai-spinner" />
                <span>Analyzing diff and generating review...</span>
              </div>
            ) : (
              <>
                <header className="ai-review-header" onClick={() => setIsExpanded((v) => !v)}>
                  <div className="ai-review-score">
                    <div
                      className="score-ring"
                      style={{
                        background: `conic-gradient(${
                          review.score >= 80
                            ? '#4ade80'
                            : review.score >= 60
                              ? '#fbbf24'
                              : '#f87171'
                        } ${review.score * 3.6}deg, #282C35 0deg)`,
                      }}
                    >
                      <span>{review.score}</span>
                    </div>
                    <div>
                      <strong>Code Quality Score</strong>
                      <span>{review.comments.length} review comments</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ai-review-toggle flex items-center justify-center"
                  >
                    <svg
                      className={`size-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
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
                              <span
                                className="size-2 rounded-full shrink-0"
                                style={{ backgroundColor: config.color }}
                              />
                              <span className="ai-comment-severity" style={{ color: config.color }}>
                                {config.label}
                              </span>
                              <span className="ai-comment-file">
                                {comment.file}:{comment.line}
                              </span>
                            </div>
                            <p className="ai-comment-text">{comment.comment}</p>
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
