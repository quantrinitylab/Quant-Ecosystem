// ============================================================================
// Moderation - Appeal Service
// Appeal lifecycle with automatic pre-screening and human escalation
// ============================================================================

import type { Appeal, ModerationAction, ContentCategory } from '../types';

interface AppealServiceConfig {
  maxAppealsPerUser: number;
  cooldownDays: number;
  autoReviewCategories: ContentCategory[];
  autoApproveThreshold: number;
  escalationTimeoutHours: number;
}

const DEFAULT_CONFIG: AppealServiceConfig = {
  maxAppealsPerUser: 3,
  cooldownDays: 30,
  autoReviewCategories: ['spam', 'profanity'],
  autoApproveThreshold: 0.8,
  escalationTimeoutHours: 48,
};

interface AppealMetrics {
  totalAppeals: number;
  approved: number;
  denied: number;
  autoReviewed: number;
  humanReviewed: number;
  avgResolutionTime: number;
  approvalRate: number;
}

/**
 * AppealService - Manages content moderation appeals
 *
 * Handles the full appeal lifecycle from submission through resolution,
 * with automatic pre-screening for eligible categories and human
 * escalation for complex cases.
 */
export class AppealService {
  private config: AppealServiceConfig;
  private appeals: Map<string, Appeal>;
  private userAppeals: Map<string, string[]>;
  private appealCounter: number = 0;
  private reviewerWorkload: Map<string, number>;
  private contentModerationScores: Map<string, { category: ContentCategory; score: number }>;

  constructor(config: Partial<AppealServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.appeals = new Map();
    this.userAppeals = new Map();
    this.reviewerWorkload = new Map();
    this.contentModerationScores = new Map();
  }

  /** Submit a new appeal */
  async createAppeal(params: {
    userId: string;
    contentId: string;
    originalAction: ModerationAction;
    reason: string;
    evidence?: string[];
  }): Promise<Appeal> {
    // Check appeal limits
    const userAppeals = this.userAppeals.get(params.userId) || [];
    const recentAppeals = userAppeals.filter((id) => {
      const appeal = this.appeals.get(id);
      return appeal && Date.now() - appeal.createdAt < this.config.cooldownDays * 86400000;
    });

    if (recentAppeals.length >= this.config.maxAppealsPerUser) {
      throw new Error(
        `Maximum appeals (${this.config.maxAppealsPerUser}) reached within cooldown period`,
      );
    }

    // Check for existing appeal on same content
    const existingAppeal = userAppeals.find((id) => {
      const a = this.appeals.get(id);
      return (
        a &&
        a.contentId === params.contentId &&
        (a.status === 'submitted' || a.status === 'auto_reviewing' || a.status === 'human_review')
      );
    });
    if (existingAppeal) {
      throw new Error('An appeal for this content is already pending');
    }

    this.appealCounter++;
    const appeal: Appeal = {
      id: `appeal_${Date.now()}_${this.appealCounter}`,
      userId: params.userId,
      contentId: params.contentId,
      originalAction: params.originalAction,
      reason: params.reason,
      evidence: params.evidence || [],
      status: 'submitted',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.appeals.set(appeal.id, appeal);
    userAppeals.push(appeal.id);
    this.userAppeals.set(params.userId, userAppeals);

    return appeal;
  }

  /** Review an appeal (manual) */
  async review(appealId: string, reviewerId: string): Promise<Appeal> {
    const appeal = this.getAppealOrThrow(appealId);
    if (appeal.status === 'approved' || appeal.status === 'denied') {
      throw new Error(`Appeal already resolved with status: ${appeal.status}`);
    }
    appeal.status = 'human_review';
    appeal.reviewerId = reviewerId;
    appeal.updatedAt = Date.now();

    const workload = this.reviewerWorkload.get(reviewerId) || 0;
    this.reviewerWorkload.set(reviewerId, workload + 1);

    return appeal;
  }

  /** Approve an appeal */
  async approve(
    appealId: string,
    params: { reviewerId: string; reason: string; newAction?: ModerationAction },
  ): Promise<Appeal> {
    const appeal = this.getAppealOrThrow(appealId);
    if (appeal.status === 'approved' || appeal.status === 'denied') {
      throw new Error('Appeal is already resolved');
    }

    appeal.status = 'approved';
    appeal.decision = 'overturned';
    appeal.decisionReason = params.reason;
    appeal.reviewerId = params.reviewerId;
    appeal.newAction = params.newAction || 'approve';
    appeal.resolvedAt = Date.now();
    appeal.updatedAt = Date.now();

    this.updateReviewerWorkload(params.reviewerId);
    return appeal;
  }

  /** Deny an appeal */
  async deny(appealId: string, params: { reviewerId: string; reason: string }): Promise<Appeal> {
    const appeal = this.getAppealOrThrow(appealId);
    if (appeal.status === 'approved' || appeal.status === 'denied') {
      throw new Error('Appeal is already resolved');
    }

    appeal.status = 'denied';
    appeal.decision = 'upheld';
    appeal.decisionReason = params.reason;
    appeal.reviewerId = params.reviewerId;
    appeal.resolvedAt = Date.now();
    appeal.updatedAt = Date.now();

    this.updateReviewerWorkload(params.reviewerId);
    return appeal;
  }

  /** Get appeal history for a user */
  async getHistory(userId: string, limit: number = 50): Promise<Appeal[]> {
    const appealIds = this.userAppeals.get(userId) || [];
    const appeals = appealIds
      .map((id) => this.appeals.get(id))
      .filter((a): a is Appeal => a !== undefined)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    return appeals;
  }

  /** Auto-review eligible appeals */
  async autoReview(
    appealId: string,
  ): Promise<{ processed: boolean; decision?: 'approved' | 'denied'; reason?: string }> {
    const appeal = this.getAppealOrThrow(appealId);
    appeal.status = 'auto_reviewing';
    appeal.updatedAt = Date.now();

    // Check if category is eligible for auto-review
    const contentScore = this.contentModerationScores.get(appeal.contentId);
    if (!contentScore) {
      return { processed: false, reason: 'No moderation score available for auto-review' };
    }

    if (!this.config.autoReviewCategories.includes(contentScore.category)) {
      return {
        processed: false,
        reason: `Category ${contentScore.category} requires human review`,
      };
    }

    // Auto-approve if original score was borderline
    if (contentScore.score < this.config.autoApproveThreshold) {
      appeal.status = 'approved';
      appeal.decision = 'overturned';
      appeal.decisionReason =
        'Auto-approved: Original classification was below confidence threshold';
      appeal.newAction = 'approve';
      appeal.resolvedAt = Date.now();
      appeal.updatedAt = Date.now();
      return { processed: true, decision: 'approved', reason: 'Below confidence threshold' };
    }

    // Otherwise escalate to human
    appeal.status = 'human_review';
    appeal.updatedAt = Date.now();
    return {
      processed: false,
      reason: 'Score above auto-approve threshold - escalated to human review',
    };
  }

  /** Escalate an appeal to human review */
  async escalateToHuman(appealId: string, reason?: string): Promise<Appeal> {
    const appeal = this.getAppealOrThrow(appealId);
    appeal.status = 'escalated';
    appeal.updatedAt = Date.now();
    if (reason && appeal.evidence) {
      appeal.evidence.push(`Escalation: ${reason}`);
    }
    return appeal;
  }

  /** Get appeal statistics */
  async getStats(): Promise<AppealMetrics> {
    const allAppeals = Array.from(this.appeals.values());
    const resolved = allAppeals.filter((a) => a.resolvedAt);
    const approved = resolved.filter((a) => a.decision === 'overturned');
    const denied = resolved.filter((a) => a.decision === 'upheld');
    const autoReviewed = resolved.filter((a) => !a.reviewerId);
    const totalResolutionTime = resolved.reduce((sum, a) => sum + (a.resolvedAt! - a.createdAt), 0);

    return {
      totalAppeals: allAppeals.length,
      approved: approved.length,
      denied: denied.length,
      autoReviewed: autoReviewed.length,
      humanReviewed: resolved.length - autoReviewed.length,
      avgResolutionTime: resolved.length > 0 ? totalResolutionTime / resolved.length : 0,
      approvalRate: resolved.length > 0 ? approved.length / resolved.length : 0,
    };
  }

  /** Register content moderation score (for auto-review decisions) */
  registerModerationScore(contentId: string, category: ContentCategory, score: number): void {
    this.contentModerationScores.set(contentId, { category, score });
  }

  // --- Private Methods ---

  private getAppealOrThrow(id: string): Appeal {
    const appeal = this.appeals.get(id);
    if (!appeal) throw new Error(`Appeal not found: ${id}`);
    return appeal;
  }

  private updateReviewerWorkload(reviewerId: string): void {
    const workload = this.reviewerWorkload.get(reviewerId) || 0;
    this.reviewerWorkload.set(reviewerId, Math.max(0, workload - 1));
  }
}
