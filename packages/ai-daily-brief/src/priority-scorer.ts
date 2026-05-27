// ============================================================================
// Priority Scorer - Scores items by urgency, importance, and freshness
// ============================================================================

import type { BriefItem } from './types';

export class PriorityScorer {
  private vipUsers: Set<string> = new Set();
  private urgentKeywords: string[] = ['urgent', 'asap', 'critical', 'deadline', 'overdue'];

  addVipUser(userId: string): void {
    this.vipUsers.add(userId);
  }

  removeVipUser(userId: string): boolean {
    return this.vipUsers.delete(userId);
  }

  setUrgentKeywords(keywords: string[]): void {
    this.urgentKeywords = keywords;
  }

  score(item: BriefItem): number {
    let score = 0;

    // Priority base score
    score += this.priorityScore(item.priority);

    // Time-to-deadline urgency
    score += this.deadlineScore(item.dueAt);

    // Keyword importance
    score += this.keywordScore(item.title, item.description);

    return Math.min(score, 10);
  }

  private priorityScore(priority: string): number {
    switch (priority) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      case 'low':
        return 1;
      default:
        return 0;
    }
  }

  private deadlineScore(dueAt: number | undefined): number {
    if (dueAt == null) return 0;

    const now = Date.now();
    const hoursUntilDue = (dueAt - now) / (1000 * 60 * 60);

    if (hoursUntilDue < 0) return 4; // Overdue
    if (hoursUntilDue < 2) return 3; // Due within 2 hours
    if (hoursUntilDue < 24) return 2; // Due within 24 hours
    if (hoursUntilDue < 72) return 1; // Due within 3 days
    return 0;
  }

  private keywordScore(title: string, description: string): number {
    const text = `${title} ${description}`.toLowerCase();
    let score = 0;

    for (const keyword of this.urgentKeywords) {
      if (text.includes(keyword)) {
        score += 1;
        break;
      }
    }

    return score;
  }
}
