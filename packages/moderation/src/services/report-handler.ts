// ============================================================================
// Moderation - Report Handler
// Full report queue management with priority scoring and reviewer assignment
// ============================================================================

import type {
  Report,
  ReportStatus,
  ReportCategory,
  QueuePriority,
  ModerationAction,
} from '../types';

interface ReportHandlerConfig {
  maxQueueSize: number;
  autoEscalateThreshold: number;
  maxReportsPerTarget: number;
  staleDays: number;
  priorityWeights: Record<ReportCategory, number>;
}

const DEFAULT_CONFIG: ReportHandlerConfig = {
  maxQueueSize: 10000,
  autoEscalateThreshold: 10,
  maxReportsPerTarget: 50,
  staleDays: 7,
  priorityWeights: {
    spam: 1,
    harassment: 3,
    hate_speech: 4,
    violence: 5,
    nsfw: 2,
    impersonation: 3,
    copyright: 2,
    misinformation: 2,
    self_harm: 5,
    other: 1,
  },
};

interface ReviewerStats {
  reviewerId: string;
  assigned: number;
  resolved: number;
  avgResolutionTime: number;
  accuracy: number;
  specializations: ReportCategory[];
}

/**
 * ReportHandler - Moderation report queue management
 *
 * Manages user-submitted content reports with priority-based queuing,
 * reviewer assignment, escalation, bulk operations, and statistics.
 */
export class ReportHandler {
  private config: ReportHandlerConfig;
  private reports: Map<string, Report>;
  private reportsByTarget: Map<string, string[]>;
  private reportsByReporter: Map<string, string[]>;
  private reviewers: Map<string, ReviewerStats>;
  private reportCounter: number = 0;

  constructor(config: Partial<ReportHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reports = new Map();
    this.reportsByTarget = new Map();
    this.reportsByReporter = new Map();
    this.reviewers = new Map();
  }

  /** Create a new report */
  async createReport(params: {
    reporterId: string;
    targetContentId: string;
    targetUserId: string;
    category: ReportCategory;
    description: string;
    evidence?: string[];
  }): Promise<Report> {
    // Check for duplicate reports
    const existingReports = this.reportsByTarget.get(params.targetContentId) || [];
    const duplicateByUser = existingReports.find((id) => {
      const r = this.reports.get(id);
      return r && r.reporterId === params.reporterId && r.status === 'open';
    });
    if (duplicateByUser) {
      throw new Error('You have already reported this content');
    }

    this.reportCounter++;
    const priority = this.calculatePriority(params.category, existingReports.length);

    const report: Report = {
      id: `rpt_${Date.now()}_${this.reportCounter}`,
      reporterId: params.reporterId,
      targetContentId: params.targetContentId,
      targetUserId: params.targetUserId,
      category: params.category,
      description: params.description,
      evidence: params.evidence || [],
      status: 'open',
      priority,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.reports.set(report.id, report);

    // Track by target
    existingReports.push(report.id);
    this.reportsByTarget.set(params.targetContentId, existingReports);

    // Track by reporter
    const reporterReports = this.reportsByReporter.get(params.reporterId) || [];
    reporterReports.push(report.id);
    this.reportsByReporter.set(params.reporterId, reporterReports);

    // Auto-escalate if threshold reached
    if (existingReports.length >= this.config.autoEscalateThreshold) {
      report.status = 'escalated';
      report.priority = 'critical';
    }

    return report;
  }

  /** Assign a reviewer to a report */
  async assignReviewer(reportId: string, reviewerId: string): Promise<Report> {
    const report = this.getReportOrThrow(reportId);
    if (report.status === 'resolved' || report.status === 'dismissed') {
      throw new Error(`Cannot assign reviewer to ${report.status} report`);
    }

    report.assignedTo = reviewerId;
    report.status = 'assigned';
    report.updatedAt = Date.now();

    // Update reviewer stats
    const stats = this.getOrCreateReviewer(reviewerId);
    stats.assigned++;

    return report;
  }

  /** Resolve a report with action */
  async resolveReport(
    reportId: string,
    resolution: {
      action: ModerationAction;
      reason: string;
      reviewerId: string;
    },
  ): Promise<Report> {
    const report = this.getReportOrThrow(reportId);

    report.status = 'resolved';
    report.resolution = resolution.reason;
    report.actionTaken = resolution.action;
    report.resolvedAt = Date.now();
    report.updatedAt = Date.now();

    // Update reviewer stats
    const stats = this.getOrCreateReviewer(resolution.reviewerId);
    stats.resolved++;
    const resolutionTime = report.resolvedAt - report.createdAt;
    stats.avgResolutionTime =
      (stats.avgResolutionTime * (stats.resolved - 1) + resolutionTime) / stats.resolved;

    return report;
  }

  /** Escalate a report to higher priority */
  async escalate(reportId: string, reason: string): Promise<Report> {
    const report = this.getReportOrThrow(reportId);
    report.status = 'escalated';
    report.priority = 'critical';
    report.updatedAt = Date.now();
    if (report.evidence) {
      report.evidence.push(`Escalation reason: ${reason}`);
    }
    return report;
  }

  /** Get report queue with filtering */
  async getQueue(options?: {
    status?: ReportStatus;
    priority?: QueuePriority;
    category?: ReportCategory;
    assignedTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: Report[]; total: number }> {
    let results = Array.from(this.reports.values());

    if (options?.status) results = results.filter((r) => r.status === options.status);
    if (options?.priority) results = results.filter((r) => r.priority === options.priority);
    if (options?.category) results = results.filter((r) => r.category === options.category);
    if (options?.assignedTo) results = results.filter((r) => r.assignedTo === options.assignedTo);

    const total = results.length;
    results = results.sort((a, b) => {
      const priorityOrder: Record<QueuePriority, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.createdAt - b.createdAt;
    });

    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    results = results.slice(offset, offset + limit);

    return { reports: results, total };
  }

  /** Get prioritized reports (highest priority first) */
  async getPrioritized(limit: number = 20): Promise<Report[]> {
    const openReports = Array.from(this.reports.values()).filter(
      (r) => r.status === 'open' || r.status === 'escalated',
    );

    return openReports
      .sort((a, b) => {
        const priorityOrder: Record<QueuePriority, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, limit);
  }

  /** Get moderation statistics */
  async getStats(): Promise<{
    totalReports: number;
    openReports: number;
    resolvedReports: number;
    avgResolutionTime: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    const reports = Array.from(this.reports.values());
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const report of reports) {
      byCategory[report.category] = (byCategory[report.category] || 0) + 1;
      byPriority[report.priority] = (byPriority[report.priority] || 0) + 1;
      byStatus[report.status] = (byStatus[report.status] || 0) + 1;
      if (report.resolvedAt) {
        totalResolutionTime += report.resolvedAt - report.createdAt;
        resolvedCount++;
      }
    }

    return {
      totalReports: reports.length,
      openReports: reports.filter((r) => r.status === 'open' || r.status === 'assigned').length,
      resolvedReports: resolvedCount,
      avgResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
      byCategory,
      byPriority,
      byStatus,
    };
  }

  /** Bulk resolve reports for a target */
  async bulkResolve(
    targetContentId: string,
    action: ModerationAction,
    reason: string,
    _reviewerId: string,
  ): Promise<number> {
    const reportIds = this.reportsByTarget.get(targetContentId) || [];
    let resolved = 0;

    for (const id of reportIds) {
      const report = this.reports.get(id);
      if (report && report.status !== 'resolved' && report.status !== 'dismissed') {
        report.status = 'resolved';
        report.actionTaken = action;
        report.resolution = reason;
        report.resolvedAt = Date.now();
        report.updatedAt = Date.now();
        resolved++;
      }
    }

    return resolved;
  }

  /** Register a reviewer */
  registerReviewer(reviewerId: string, specializations: ReportCategory[]): void {
    this.reviewers.set(reviewerId, {
      reviewerId,
      assigned: 0,
      resolved: 0,
      avgResolutionTime: 0,
      accuracy: 1,
      specializations,
    });
  }

  // --- Private Methods ---

  private getReportOrThrow(id: string): Report {
    const report = this.reports.get(id);
    if (!report) throw new Error(`Report not found: ${id}`);
    return report;
  }

  private calculatePriority(category: ReportCategory, existingCount: number): QueuePriority {
    const baseWeight = this.config.priorityWeights[category] || 1;
    const countBoost = Math.min(3, existingCount * 0.5);
    const score = baseWeight + countBoost;

    if (score >= 5) return 'critical';
    if (score >= 3) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  private getOrCreateReviewer(reviewerId: string): ReviewerStats {
    let stats = this.reviewers.get(reviewerId);
    if (!stats) {
      stats = {
        reviewerId,
        assigned: 0,
        resolved: 0,
        avgResolutionTime: 0,
        accuracy: 1,
        specializations: [],
      };
      this.reviewers.set(reviewerId, stats);
    }
    return stats;
  }
}
