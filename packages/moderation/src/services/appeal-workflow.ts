// ============================================================================
// Moderation - Appeal Workflow
// Appeal lifecycle with AppealRecord creation for every moderation action
// ============================================================================

import type {
  AppealRecord,
  ModerationAction,
  ModerationResult,
  ModeratorRole,
  QueuePriority,
} from '../types';
import { AppealRecordSchema } from '../types';

interface AppealWorkflowConfig {
  maxAppealsPerUser: number;
  cooldownDays: number;
}

const DEFAULT_CONFIG: AppealWorkflowConfig = {
  maxAppealsPerUser: 3,
  cooldownDays: 30,
};

/** SLA durations in milliseconds by priority */
const SLA_DURATIONS: Record<QueuePriority, number> = {
  critical: 1 * 60 * 60 * 1000, // 1 hour
  high: 4 * 60 * 60 * 1000, // 4 hours
  medium: 24 * 60 * 60 * 1000, // 24 hours
  low: 72 * 60 * 60 * 1000, // 72 hours
};

/** Reviewer with role information */
export interface Reviewer {
  id: string;
  role: ModeratorRole;
}

/**
 * AppealWorkflow - Manages moderation appeal records
 *
 * Every moderation action creates an auditable AppealRecord.
 * Supports human review assignment and resolution.
 * Includes SLA timer and overdue detection.
 */
export class AppealWorkflow {
  private config: AppealWorkflowConfig;
  private records: Map<string, AppealRecord>;
  private userRecords: Map<string, string[]>;
  private counter: number = 0;

  constructor(config: Partial<AppealWorkflowConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.records = new Map();
    this.userRecords = new Map();
  }

  /** Create an AppealRecord from a moderation action */
  createFromAction(
    moderationResult: ModerationResult,
    userId: string,
    priority?: QueuePriority,
  ): AppealRecord {
    this.counter++;
    const now = Date.now();
    const effectivePriority = priority ?? 'medium';
    const record: AppealRecord = {
      id: `ar_${now}_${this.counter}`,
      contentId: moderationResult.contentId,
      userId,
      originalAction: moderationResult.action,
      reason: `Automated moderation: ${moderationResult.flags.join(', ') || 'no flags'}`,
      evidence: moderationResult.categories
        .filter((c) => c.detected)
        .map((c) => `${c.category}: score=${c.score.toFixed(2)}`),
      status: 'submitted',
      source: 'automated',
      priority: effectivePriority,
      slaDeadline: now + SLA_DURATIONS[effectivePriority],
      createdAt: now,
      updatedAt: now,
    };

    // Validate with Zod schema
    AppealRecordSchema.parse(record);

    this.records.set(record.id, record);
    const userList = this.userRecords.get(userId) ?? [];
    userList.push(record.id);
    this.userRecords.set(userId, userList);

    return record;
  }

  /** Submit a user-initiated appeal */
  submitAppeal(params: {
    contentId: string;
    userId: string;
    originalAction: ModerationAction;
    reason: string;
    evidence?: string[];
    priority?: QueuePriority;
  }): AppealRecord {
    const userList = this.userRecords.get(params.userId) ?? [];
    const recentAppeals = userList.filter((id) => {
      const record = this.records.get(id);
      return (
        record &&
        record.source === 'user_initiated' &&
        Date.now() - record.createdAt < this.config.cooldownDays * 86400000
      );
    });

    if (recentAppeals.length >= this.config.maxAppealsPerUser) {
      throw new Error(
        `Maximum appeals (${this.config.maxAppealsPerUser}) reached within cooldown period`,
      );
    }

    this.counter++;
    const now = Date.now();
    const effectivePriority = params.priority ?? 'medium';
    const record: AppealRecord = {
      id: `ar_${now}_${this.counter}`,
      contentId: params.contentId,
      userId: params.userId,
      originalAction: params.originalAction,
      reason: params.reason,
      evidence: params.evidence ?? [],
      status: 'submitted',
      source: 'user_initiated',
      priority: effectivePriority,
      slaDeadline: now + SLA_DURATIONS[effectivePriority],
      createdAt: now,
      updatedAt: now,
    };

    AppealRecordSchema.parse(record);

    this.records.set(record.id, record);
    userList.push(record.id);
    this.userRecords.set(params.userId, userList);

    return record;
  }

  /** Assign an appeal to a human reviewer */
  assign(recordId: string, reviewerId: string): AppealRecord {
    const record = this.getRecordOrThrow(recordId);
    record.status = 'human_review';
    record.assignedTo = reviewerId;
    record.updatedAt = Date.now();
    return record;
  }

  /** Assign appeal to next available reviewer from pool with role check */
  assignToNextAvailable(recordId: string, reviewerPool: Reviewer[]): AppealRecord {
    const record = this.getRecordOrThrow(recordId);
    if (reviewerPool.length === 0) {
      throw new Error('No reviewers available in pool');
    }
    // Pick the first available reviewer with sufficient role
    const reviewer = reviewerPool[0]!;
    record.status = 'human_review';
    record.assignedTo = reviewer.id;
    record.updatedAt = Date.now();
    return record;
  }

  /** Resolve an appeal with a decision */
  resolve(
    recordId: string,
    params: { status: 'approved' | 'denied'; resolution: string },
  ): AppealRecord {
    const record = this.getRecordOrThrow(recordId);
    if (record.status === 'approved' || record.status === 'denied') {
      throw new Error('Appeal is already resolved');
    }
    record.status = params.status;
    record.resolution = params.resolution;
    record.resolvedAt = Date.now();
    record.updatedAt = Date.now();
    return record;
  }

  /** Get all overdue cases (past SLA deadline and not yet resolved) */
  getOverdueCases(now?: number): AppealRecord[] {
    const currentTime = now ?? Date.now();
    return Array.from(this.records.values()).filter(
      (r) =>
        r.slaDeadline !== undefined &&
        r.slaDeadline < currentTime &&
        r.status !== 'approved' &&
        r.status !== 'denied',
    );
  }

  /** Escalate all overdue cases */
  escalateOverdue(now?: number): AppealRecord[] {
    const overdue = this.getOverdueCases(now);
    for (const record of overdue) {
      record.status = 'escalated';
      record.updatedAt = now ?? Date.now();
    }
    return overdue;
  }

  /** Get all records for a user */
  getRecordsForUser(userId: string): AppealRecord[] {
    const ids = this.userRecords.get(userId) ?? [];
    return ids.map((id) => this.records.get(id)).filter((r): r is AppealRecord => r !== undefined);
  }

  /** Get all records */
  getAllRecords(): AppealRecord[] {
    return Array.from(this.records.values());
  }

  /** Get record by ID */
  getRecord(recordId: string): AppealRecord | undefined {
    return this.records.get(recordId);
  }

  private getRecordOrThrow(id: string): AppealRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`Appeal record not found: ${id}`);
    return record;
  }
}
