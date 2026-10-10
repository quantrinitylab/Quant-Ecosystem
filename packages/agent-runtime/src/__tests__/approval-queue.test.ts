import { describe, it, expect } from 'vitest';
import { ApprovalQueue, ApprovalRequest, ApprovalDecisionContext } from '../approval-queue.js';

// QM-QUANTY-009: decisions require an authenticated, step-up-verified decider
// who is not the requesting agent ('agent-1').
const CTX: ApprovalDecisionContext = { decidedBy: 'user-owner', stepUpVerified: true };

describe('ApprovalQueue', () => {
  function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
    return {
      id: `req-${Date.now()}`,
      agentId: 'agent-1',
      action: 'delete-user-data',
      riskLevel: 'high',
      ...overrides,
    };
  }

  it('submits requests', () => {
    const queue = new ApprovalQueue();
    queue.submit(makeRequest({ id: 'req-1' }));
    expect(queue.getPending()).toHaveLength(1);
  });

  it('validates requests with Zod', () => {
    const queue = new ApprovalQueue();
    expect(() => queue.submit({ invalid: true } as unknown as ApprovalRequest)).toThrow();
  });

  it('approves pending requests', () => {
    const queue = new ApprovalQueue();
    queue.submit(makeRequest({ id: 'req-1' }));
    queue.approve('req-1', CTX);

    const item = queue.getById('req-1');
    expect(item?.status).toBe('approved');
    expect(item?.resolvedAt).toBeDefined();
  });

  it('rejects pending requests', () => {
    const queue = new ApprovalQueue();
    queue.submit(makeRequest({ id: 'req-1' }));
    queue.reject('req-1', CTX);

    const item = queue.getById('req-1');
    expect(item?.status).toBe('rejected');
    expect(item?.resolvedAt).toBeDefined();
  });

  it('throws when approving non-existent request', () => {
    const queue = new ApprovalQueue();
    expect(() => queue.approve('nonexistent', CTX)).toThrow(/not found/);
  });

  it('throws when rejecting non-existent request', () => {
    const queue = new ApprovalQueue();
    expect(() => queue.reject('nonexistent', CTX)).toThrow(/not found/);
  });

  it('throws when approving already resolved request', () => {
    const queue = new ApprovalQueue();
    queue.submit(makeRequest({ id: 'req-1' }));
    queue.approve('req-1', CTX);
    expect(() => queue.approve('req-1', CTX)).toThrow(/already approved/);
  });

  it('throws when rejecting already resolved request', () => {
    const queue = new ApprovalQueue();
    queue.submit(makeRequest({ id: 'req-1' }));
    queue.reject('req-1', CTX);
    expect(() => queue.reject('req-1', CTX)).toThrow(/already rejected/);
  });

  it('getPending only returns pending items', () => {
    const queue = new ApprovalQueue();
    queue.submit(makeRequest({ id: 'req-1' }));
    queue.submit(makeRequest({ id: 'req-2' }));
    queue.submit(makeRequest({ id: 'req-3' }));
    queue.approve('req-1', CTX);
    queue.reject('req-2', CTX);

    const pending = queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.request.id).toBe('req-3');
  });

  it('getById returns undefined for non-existent', () => {
    const queue = new ApprovalQueue();
    expect(queue.getById('nonexistent')).toBeUndefined();
  });

  it('blocks high-risk action until approved', () => {
    const queue = new ApprovalQueue();
    queue.submit(makeRequest({ id: 'high-risk', riskLevel: 'critical' }));

    // Action is pending (blocked)
    const entry = queue.getById('high-risk');
    expect(entry?.status).toBe('pending');

    // Approve it
    queue.approve('high-risk', CTX);
    expect(queue.getById('high-risk')?.status).toBe('approved');
  });
});
