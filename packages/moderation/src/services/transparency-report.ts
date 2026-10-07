// ============================================================================
// Moderation - Transparency Report Generator
// Generates transparency reports with moderation statistics
// ============================================================================

import type { AppealRecord, ModerationResult, TransparencyReport } from '../types';

export interface TransparencyReportConfig {
  maxRecords?: number;
}

const DEFAULT_MAX_RECORDS = 100_000;

/**
 * TransparencyReportGenerator - Generates transparency reports
 *
 * Aggregates moderation actions and appeal outcomes into structured
 * reports for a given time period. Enforces a maximum record limit
 * to prevent unbounded memory growth; oldest records are evicted
 * when the limit is exceeded.
 */
export class TransparencyReportGenerator {
  private moderationActions: ModerationResult[];
  private appealRecords: AppealRecord[];
  private readonly maxRecords: number;

  constructor(config?: TransparencyReportConfig) {
    this.moderationActions = [];
    this.appealRecords = [];
    this.maxRecords = config?.maxRecords ?? DEFAULT_MAX_RECORDS;
  }

  /** Record a moderation action for reporting */
  recordAction(result: ModerationResult): void {
    this.moderationActions.push(result);
    if (this.moderationActions.length > this.maxRecords) {
      this.moderationActions = this.moderationActions.slice(-this.maxRecords);
    }
  }

  /** Record an appeal for reporting */
  recordAppeal(record: AppealRecord): void {
    this.appealRecords.push(record);
    if (this.appealRecords.length > this.maxRecords) {
      this.appealRecords = this.appealRecords.slice(-this.maxRecords);
    }
  }

  /** Generate a transparency report for the given time range */
  generate(startDate: number, endDate: number): TransparencyReport {
    const filteredActions = this.moderationActions.filter(
      (a) => a.createdAt >= startDate && a.createdAt <= endDate,
    );

    const filteredAppeals = this.appealRecords.filter(
      (a) => a.createdAt >= startDate && a.createdAt <= endDate,
    );

    const actionsByCategory: Record<string, number> = {};
    for (const action of filteredActions) {
      for (const cat of action.categories) {
        if (cat.detected) {
          actionsByCategory[cat.category] = (actionsByCategory[cat.category] ?? 0) + 1;
        }
      }
    }

    const approvedAppeals = filteredAppeals.filter((a) => a.status === 'approved');
    const deniedAppeals = filteredAppeals.filter((a) => a.status === 'denied');
    const resolvedAppeals = filteredAppeals.filter((a) => a.resolvedAt !== undefined);

    const totalResolutionTime = resolvedAppeals.reduce(
      (sum, a) => sum + ((a.resolvedAt ?? a.createdAt) - a.createdAt),
      0,
    );

    const avgResolutionTime =
      resolvedAppeals.length > 0 ? totalResolutionTime / resolvedAppeals.length : 0;

    // Sort categories by count descending
    const topCategories = Object.entries(actionsByCategory)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      startDate,
      endDate,
      totalActions: filteredActions.length,
      actionsByCategory,
      appealStats: {
        submitted: filteredAppeals.length,
        approved: approvedAppeals.length,
        denied: deniedAppeals.length,
      },
      avgResolutionTime,
      topCategories,
    };
  }

  /** Export a transparency report as a formatted markdown string */
  exportAsMarkdown(report: TransparencyReport): string {
    const startDateStr = new Date(report.startDate).toISOString().split('T')[0];
    const endDateStr = new Date(report.endDate).toISOString().split('T')[0];

    const lines: string[] = [];
    lines.push(`# Transparency Report`);
    lines.push('');
    lines.push(`**Period:** ${startDateStr} to ${endDateStr}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Total Actions:** ${report.totalActions}`);
    lines.push(`- **Appeals Submitted:** ${report.appealStats.submitted}`);
    lines.push(`- **Appeals Approved:** ${report.appealStats.approved}`);
    lines.push(`- **Appeals Denied:** ${report.appealStats.denied}`);
    lines.push(`- **Average Resolution Time:** ${formatDuration(report.avgResolutionTime)}`);
    lines.push('');

    // False positive rate
    const totalResolved = report.appealStats.approved + report.appealStats.denied;
    const falsePositiveRate =
      totalResolved > 0 ? ((report.appealStats.approved / totalResolved) * 100).toFixed(1) : '0.0';
    lines.push(`- **False Positive Rate (appeals overturned):** ${falsePositiveRate}%`);
    lines.push('');

    // Actions by Category
    lines.push('## Actions by Category');
    lines.push('');
    lines.push('| Category | Count |');
    lines.push('|----------|-------|');
    for (const [category, count] of Object.entries(report.actionsByCategory)) {
      lines.push(`| ${category} | ${count} |`);
    }
    lines.push('');

    // Top Categories
    if (report.topCategories.length > 0) {
      lines.push('## Top Violation Categories');
      lines.push('');
      for (let i = 0; i < report.topCategories.length; i++) {
        const cat = report.topCategories[i]!;
        lines.push(`${i + 1}. **${cat.category}** - ${cat.count} actions`);
      }
      lines.push('');
    }

    // Appeal Outcomes
    lines.push('## Appeal Outcomes');
    lines.push('');
    lines.push(`- Submitted: ${report.appealStats.submitted}`);
    lines.push(`- Approved (overturned): ${report.appealStats.approved}`);
    lines.push(`- Denied (upheld): ${report.appealStats.denied}`);
    lines.push('');

    return lines.join('\n');
  }
}

/** Format milliseconds to human-readable duration */
function formatDuration(ms: number): string {
  if (ms === 0) return '0ms';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds}s`);
  return parts.join(' ') || '< 1s';
}
