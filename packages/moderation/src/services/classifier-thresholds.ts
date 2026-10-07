// ============================================================================
// Moderation - Shared Classifier Thresholds
// Configurable action thresholds used by both Text and Image classifiers
// ============================================================================

import type { ModerationAction, CategoryScore } from '../types';

/** Configurable thresholds for mapping scores to actions */
export interface ClassifierThresholds {
  removeThreshold: number;
  flagThreshold: number;
  restrictThreshold: number;
}

/** Default thresholds used when none are provided */
export const DEFAULT_CLASSIFIER_THRESHOLDS: ClassifierThresholds = {
  removeThreshold: 0.9,
  flagThreshold: 0.7,
  restrictThreshold: 0.5,
};

/**
 * Determine a moderation action based on detected category scores and thresholds.
 * Shared logic used by both TextClassifier and ImageClassifier.
 */
export function determineAction(
  categories: CategoryScore[],
  thresholds: ClassifierThresholds = DEFAULT_CLASSIFIER_THRESHOLDS,
): ModerationAction {
  const detected = categories.filter((c) => c.detected);
  if (detected.length === 0) return 'approve';
  const maxScore = Math.max(...detected.map((c) => c.score));
  if (maxScore >= thresholds.removeThreshold) return 'remove';
  if (maxScore >= thresholds.flagThreshold) return 'flag';
  if (maxScore >= thresholds.restrictThreshold) return 'restrict';
  return 'warn';
}
