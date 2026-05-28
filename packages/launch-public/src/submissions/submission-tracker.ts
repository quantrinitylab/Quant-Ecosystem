import type { AppStore, StoreSubmission, StoreSubmissionStatus } from '../types.js';

const VALID_TRANSITIONS: Record<StoreSubmissionStatus, StoreSubmissionStatus[]> = {
  draft: ['submitted'],
  submitted: ['in_review'],
  in_review: ['approved', 'rejected'],
  approved: ['live'],
  rejected: ['draft'],
  live: [],
};

export class SubmissionTracker {
  private submissions = new Map<string, StoreSubmission>();

  create(store: AppStore): StoreSubmission {
    const sub: StoreSubmission = {
      id: crypto.randomUUID(),
      store,
      status: 'draft',
      submittedAt: null,
    };
    this.submissions.set(sub.id, sub);
    return sub;
  }

  transition(id: string, newStatus: StoreSubmissionStatus): boolean {
    const sub = this.submissions.get(id);
    if (!sub) return false;
    const allowed = VALID_TRANSITIONS[sub.status];
    if (!allowed.includes(newStatus)) return false;
    if (newStatus === 'submitted') {
      sub.submittedAt = Date.now();
    }
    sub.status = newStatus;
    return true;
  }

  reject(id: string, reason: string): boolean {
    const sub = this.submissions.get(id);
    if (!sub || sub.status !== 'in_review') return false;
    sub.status = 'rejected';
    sub.rejectionReason = reason;
    return true;
  }

  resubmit(id: string): boolean {
    const sub = this.submissions.get(id);
    if (!sub || sub.status !== 'rejected') return false;
    sub.status = 'draft';
    sub.rejectionReason = undefined;
    return true;
  }

  approve(id: string): boolean {
    const sub = this.submissions.get(id);
    if (!sub || sub.status !== 'in_review') return false;
    sub.status = 'approved';
    if (sub.submittedAt) {
      sub.reviewTimeMs = Date.now() - sub.submittedAt;
    }
    return true;
  }

  getSubmission(id: string): StoreSubmission | null {
    return this.submissions.get(id) ?? null;
  }

  getByStore(store: AppStore): StoreSubmission[] {
    return [...this.submissions.values()].filter((s) => s.store === store);
  }

  getByStatus(status: StoreSubmissionStatus): StoreSubmission[] {
    return [...this.submissions.values()].filter((s) => s.status === status);
  }
}
