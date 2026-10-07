// ============================================================================
// Moderation - Ad Policy Enforcement Service
// Validates ad content against platform policies
// ============================================================================

import type { AdPolicyCheckResult, AdPolicyViolation, Severity } from '../types';

interface AdPolicyEnforcementConfig {
  prohibitedCategories: string[];
  misleadingPatterns: RegExp[];
  minAgeTarget: number;
}

const DEFAULT_PROHIBITED_CATEGORIES = [
  'tobacco',
  'weapons',
  'gambling',
  'adult',
  'drugs',
  'counterfeit',
];

const DEFAULT_MISLEADING_PATTERNS: RegExp[] = [
  /guaranteed\s+(results|income|cure)/i,
  /100%\s+(safe|effective|cure)/i,
  /miracle\s+(cure|solution)/i,
  /no\s+risk/i,
];

const DEFAULT_CONFIG: AdPolicyEnforcementConfig = {
  prohibitedCategories: DEFAULT_PROHIBITED_CATEGORIES,
  misleadingPatterns: DEFAULT_MISLEADING_PATTERNS,
  minAgeTarget: 18,
};

/**
 * AdPolicyEnforcementService - Ad content policy validation
 *
 * Validates ads against platform policies including prohibited categories,
 * misleading claims, audience targeting restrictions, and creative compliance.
 */
export class AdPolicyEnforcementService {
  private config: AdPolicyEnforcementConfig;

  constructor(config: Partial<AdPolicyEnforcementConfig> = {}) {
    this.config = {
      prohibitedCategories: config.prohibitedCategories || DEFAULT_PROHIBITED_CATEGORIES,
      misleadingPatterns: config.misleadingPatterns || DEFAULT_MISLEADING_PATTERNS,
      minAgeTarget: config.minAgeTarget ?? DEFAULT_CONFIG.minAgeTarget,
    };
  }

  /** Check ad content against all policies */
  checkAd(params: {
    content: string;
    category?: string;
    targetAgeMin?: number;
    imageTextRatio?: number;
  }): AdPolicyCheckResult {
    const { content, category, targetAgeMin, imageTextRatio } = params;
    const violations: AdPolicyViolation[] = [];

    // Check prohibited category
    if (category) {
      const categoryViolation = this.checkCategory(category);
      if (categoryViolation) violations.push(categoryViolation);
    }

    // Check misleading claims
    const misleadingViolations = this.checkMisleadingClaims(content);
    violations.push(...misleadingViolations);

    // Check targeting minors
    if (targetAgeMin !== undefined && targetAgeMin < this.config.minAgeTarget) {
      violations.push({
        type: 'targeting_minors',
        description: `Target age minimum ${targetAgeMin} is below platform minimum of ${this.config.minAgeTarget}`,
        severity: 'critical' as Severity,
      });
    }

    // Check creative compliance (image/text ratio)
    if (imageTextRatio !== undefined && imageTextRatio > 0.8) {
      violations.push({
        type: 'creative_violation',
        description: `Image text ratio ${imageTextRatio} exceeds maximum of 0.8`,
        severity: 'low' as Severity,
      });
    }

    // Determine decision
    const decision = this.determineDecision(violations);

    return {
      decision,
      violations,
      checkedAt: Date.now(),
    };
  }

  /** Add a prohibited category */
  addProhibitedCategory(category: string): void {
    if (!this.config.prohibitedCategories.includes(category.toLowerCase())) {
      this.config.prohibitedCategories.push(category.toLowerCase());
    }
  }

  /** Add a misleading pattern */
  addMisleadingPattern(pattern: RegExp): void {
    this.config.misleadingPatterns.push(pattern);
  }

  // --- Private Methods ---

  private checkCategory(category: string): AdPolicyViolation | null {
    const lowerCategory = category.toLowerCase();
    if (this.config.prohibitedCategories.includes(lowerCategory)) {
      return {
        type: 'prohibited_category',
        description: `Category '${category}' is prohibited`,
        severity: 'high' as Severity,
      };
    }
    return null;
  }

  private checkMisleadingClaims(content: string): AdPolicyViolation[] {
    const violations: AdPolicyViolation[] = [];

    for (const pattern of this.config.misleadingPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: 'misleading_claim',
          description: `Misleading claim detected matching pattern: ${pattern.source}`,
          severity: 'medium' as Severity,
        });
      }
    }

    return violations;
  }

  private determineDecision(
    violations: AdPolicyViolation[],
  ): 'approved' | 'rejected' | 'needs_review' {
    if (violations.length === 0) return 'approved';

    const hasCritical = violations.some((v) => v.severity === 'critical');
    const hasHigh = violations.some((v) => v.severity === 'high');

    if (hasCritical || hasHigh) return 'rejected';
    return 'needs_review';
  }
}
