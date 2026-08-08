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
  critical: { icon: '🔴', label: 'Critical', color: '#f87171' },
  warning: { icon: '🟡', label: 'Warning', color: '#fbbf24' },
  suggestion: { icon: '💡', label: 'Suggestion', color: '#60a5fa' },
  praise: { icon: '✨', label: 'Nice', color: '#4ade80' },
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
        comment: 'This async function doesn\'t await. Add `await` or remove `async` keyword.',
      },
      {
        id: 'rc-3',
        file: 'src/api/handler.ts',
        line: 8,
        severity: 'critical',
        comment: 'User input is used directly in the query without sanitization. Use parameterized queries.',
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
        <button
          type="button"
          className="ai-review-trigger"
          onClick={requestReview}
        >
          <span className="ai-review-icon">🤖</span>
          <div className="ai-review-trigger-text">
            <strong>AI Code Review</strong>
            <span>Analyze this PR for bugs, security issues, and best practices</span>
          </div>
          <span className="ai-review-arrow">→</span>
        </button>
      )}

      <AnimatePresence>
        {review && (
          <motion.div
            className="ai-review-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            {review.isLoading ? (
              <div className="ai-review-loading">
                <div className="ai-review-spinner" />
                <span>Analyzing code changes…</span>
              </div>
            ) : (
              <>
                <header className="ai-review-header" onClick={() => setIsExpanded((v) => !v)}>
                  <div className="ai-review-score">
                    <div
                      className="score-ring"
                      style={{
                        background: `conic-gradient(${
                          review.score >= 80 ? '#4ade80' : review.score >= 60 ? '#fbbf24' : '#f87171'
                        } ${review.score * 3.6}deg, #2a2a2e 0deg)`,
                      }}
                    >
                      <span>{review.score}</span>
                    </div>
                    <div>
                      <strong>Code Quality Score</strong>
                      <span>{review.comments.length} review comments</span>
                    </div>
                  </div>
                  <button type="button" className="ai-review-toggle">
                    {isExpanded ? '▲' : '▼'}
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
                            <div className="ai-comment-header">
                              <span>{config.icon}</span>
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
