// ============================================================================
// Moderation - Appeals Queue
// Priority queue ordered by SLA deadline for human review
// ============================================================================

import type { AppealRecord, QueuePriority } from '../types';

export interface QueueStats {
  pending: number;
  inProgress: number;
  overdue: number;
  avgResolutionTime: number;
}

export interface ReviewerWorkload {
  reviewerId: string;
  assigned: number;
  resolved: number;
}

/**
 * AppealsQueue - Priority queue for human moderation review
 *
 * Orders appeals by SLA urgency (most overdue or closest to deadline first).
 * Supports filtering by category and reviewer workload tracking.
 */
export class AppealsQueue {
  private queue: AppealRecord[] = [];
  private assignedRecords: Map<string, AppealRecord[]> = new Map();
  private resolvedRecords: AppealRecord[] = [];

  /** Enqueue an appeal with a given priority */
  enqueue(appeal: AppealRecord, priority?: QueuePriority): void {
    if (priority && !appeal.priority) {
      appeal.priority = priority;
    }
    this.queue.push(appeal);
    this.sortQueue();
  }

  /** Dequeue the most urgent case (closest/past SLA deadline) and assign to reviewer */
  dequeue(reviewerId: string, category?: string): AppealRecord | undefined {
    let filtered = this.queue;
    if (category) {
      filtered = this.queue.filter((r) => r.reason.includes(category));
    }

    if (filtered.length === 0) return undefined;

    const item = filtered[0]!;
    const idx = this.queue.indexOf(item);
    this.queue.splice(idx, 1);

    item.status = 'human_review';
    item.assignedTo = reviewerId;
    item.updatedAt = Date.now();

    const assigned = this.assignedRecords.get(reviewerId) ?? [];
    assigned.push(item);
    this.assignedRecords.set(reviewerId, assigned);

    return item;
  }

  /** Get queue statistics */
  getQueueStats(now?: number): QueueStats {
    const currentTime = now ?? Date.now();
    const pending = this.queue.length;
    let inProgress = 0;
    for (const records of this.assignedRecords.values()) {
      inProgress += records.filter((r) => r.status !== 'approved' && r.status !== 'denied').length;
    }

    const overdue = this.queue.filter(
      (r) => r.slaDeadline !== undefined && r.slaDeadline < currentTime,
    ).length;

    let avgResolutionTime = 0;
    if (this.resolvedRecords.length > 0) {
      const totalTime = this.resolvedRecords.reduce(
        (sum, r) => sum + ((r.resolvedAt ?? r.createdAt) - r.createdAt),
        0,
      );
      avgResolutionTime = totalTime / this.resolvedRecords.length;
    }

    return { pending, inProgress, overdue, avgResolutionTime };
  }

  /** Get workload for a specific reviewer */
  getReviewerWorkload(reviewerId: string): ReviewerWorkload {
    const assigned = this.assignedRecords.get(reviewerId) ?? [];
    const resolved = assigned.filter(
      (r) => r.status === 'approved' || r.status === 'denied',
    ).length;

    return {
      reviewerId,
      assigned: assigned.length,
      resolved,
    };
  }

  /** Mark a record as resolved (for stats tracking) */
  markResolved(appeal: AppealRecord): void {
    this.resolvedRecords.push(appeal);
  }

  /** Get all pending items */
  getPendingItems(): AppealRecord[] {
    return [...this.queue];
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const deadlineA = a.slaDeadline ?? Number.MAX_SAFE_INTEGER;
      const deadlineB = b.slaDeadline ?? Number.MAX_SAFE_INTEGER;
      return deadlineA - deadlineB;
    });
  }
}
