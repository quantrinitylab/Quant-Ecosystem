// ============================================================================
// Moderation - AI Output Safety Service
// Validates AI-generated content for PII leaks, harmful content, and labeling
// ============================================================================

import type { AIOutputSafetyIssue, AIOutputSafetyResult, Severity } from '../types';

interface AIOutputSafetyConfig {
  piiPatterns: RegExp[];
  prohibitedTopics: string[];
  minConfidenceThreshold: number;
}

const DEFAULT_PII_PATTERNS: RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
];

const DEFAULT_CONFIG: AIOutputSafetyConfig = {
  piiPatterns: DEFAULT_PII_PATTERNS,
  prohibitedTopics: [],
  minConfidenceThreshold: 0.7,
};

/**
 * AIOutputSafetyService - AI output validation and labeling
 *
 * Checks AI-generated content for PII leakage, prohibited topics,
 * confidence thresholds, and ensures proper AI-generated labeling.
 *
 * **PII detection limitations:** Only SSN, credit card number, and email patterns
 * are currently checked. Phone numbers, passport numbers, and other PII types
 * are known gaps to be addressed in future iterations.
 */
export class AIOutputSafetyService {
  private config: AIOutputSafetyConfig;

  constructor(config: Partial<AIOutputSafetyConfig> = {}) {
    this.config = {
      piiPatterns: config.piiPatterns || DEFAULT_PII_PATTERNS,
      prohibitedTopics: config.prohibitedTopics || DEFAULT_CONFIG.prohibitedTopics,
      minConfidenceThreshold:
        config.minConfidenceThreshold ?? DEFAULT_CONFIG.minConfidenceThreshold,
    };
  }

  /** Check AI output for safety issues */
  checkOutput(params: {
    content: string;
    confidence?: number;
    source?: string;
  }): AIOutputSafetyResult {
    const { content, confidence, source: _source } = params;
    const issues: AIOutputSafetyIssue[] = [];

    // Check PII patterns
    const piiIssues = this.checkPII(content);
    issues.push(...piiIssues);

    // Check prohibited topics
    const topicIssues = this.checkProhibitedTopics(content);
    issues.push(...topicIssues);

    // Check confidence threshold
    if (confidence !== undefined && confidence < this.config.minConfidenceThreshold) {
      issues.push({
        type: 'low_confidence',
        description: `Output confidence ${confidence} is below threshold ${this.config.minConfidenceThreshold}`,
        severity: 'medium' as Severity,
      });
    }

    return {
      safe: issues.length === 0,
      issues,
      labelApplied: false,
      checkedAt: Date.now(),
    };
  }

  /** Apply AI-generated label to content */
  applyAILabel(content: string): {
    content: string;
    metadata: { aiGenerated: true; labeledAt: number };
  } {
    return {
      content: `[AI Generated] ${content}`,
      metadata: {
        aiGenerated: true,
        labeledAt: Date.now(),
      },
    };
  }

  /** Check if metadata indicates AI label is present */
  isLabeled(metadata: Record<string, unknown>): boolean {
    return metadata['aiGenerated'] === true;
  }

  // --- Private Methods ---

  private checkPII(content: string): AIOutputSafetyIssue[] {
    const issues: AIOutputSafetyIssue[] = [];

    for (const pattern of this.config.piiPatterns) {
      if (pattern.test(content)) {
        issues.push({
          type: 'pii_leak',
          description: `PII pattern detected: ${pattern.source}`,
          severity: 'high' as Severity,
        });
      }
    }

    return issues;
  }

  private checkProhibitedTopics(content: string): AIOutputSafetyIssue[] {
    const issues: AIOutputSafetyIssue[] = [];
    const lowerContent = content.toLowerCase();

    for (const topic of this.config.prohibitedTopics) {
      if (lowerContent.includes(topic.toLowerCase())) {
        issues.push({
          type: 'prohibited_topic',
          description: `Prohibited topic detected: ${topic}`,
          severity: 'high' as Severity,
        });
      }
    }

    return issues;
  }
}
