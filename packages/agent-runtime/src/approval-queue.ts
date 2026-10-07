import { z } from 'zod';

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  action: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  timeout: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface QueuedRequest {
  request: ApprovalRequest;
  status: ApprovalStatus;
  submittedAt: number;
  resolvedAt?: number;
}

export class ApprovalQueue {
  private queue: Map<string, QueuedRequest> = new Map();

  submit(request: ApprovalRequest): void {
    const parsed = ApprovalRequestSchema.parse(request);
    this.queue.set(parsed.id, {
      request: parsed,
      status: 'pending',
      submittedAt: Date.now(),
    });
  }

  approve(requestId: string): void {
    const entry = this.queue.get(requestId);
    if (!entry) {
      throw new Error(`Request ${requestId} not found`);
    }
    if (entry.status !== 'pending') {
      throw new Error(`Request ${requestId} is already ${entry.status}`);
    }
    entry.status = 'approved';
    entry.resolvedAt = Date.now();
  }

  reject(requestId: string): void {
    const entry = this.queue.get(requestId);
    if (!entry) {
      throw new Error(`Request ${requestId} not found`);
    }
    if (entry.status !== 'pending') {
      throw new Error(`Request ${requestId} is already ${entry.status}`);
    }
    entry.status = 'rejected';
    entry.resolvedAt = Date.now();
  }

  getPending(): ReadonlyArray<QueuedRequest> {
    return Array.from(this.queue.values()).filter((e) => e.status === 'pending');
  }

  getById(requestId: string): QueuedRequest | undefined {
    return this.queue.get(requestId);
  }

  getAll(): ReadonlyArray<QueuedRequest> {
    return Array.from(this.queue.values());
  }
}
