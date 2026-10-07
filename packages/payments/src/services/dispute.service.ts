// ============================================================================
// Payments - Dispute Service
// Payment dispute/chargeback lifecycle management
// ============================================================================

import { z } from 'zod';
import type { Dispute, DisputeEvidence, DisputeReason, DisputeStatus } from '../types';

export const OpenDisputeSchema = z.object({
  transactionId: z.string().min(1),
  customerId: z.string().min(1),
  amount: z.number().positive(),
  reason: z.enum(['fraud', 'not_received', 'product_issue', 'duplicate', 'other']),
});

export const SubmitEvidenceSchema = z.object({
  disputeId: z.string().min(1),
  submittedBy: z.enum(['customer', 'merchant']),
  type: z.string().min(1),
  content: z.string().min(1),
});

/**
 * DisputeService - Payment dispute lifecycle management
 *
 * Handles payment disputes/chargebacks through their lifecycle:
 * opened -> evidence_requested -> under_review -> resolved(won/lost)
 * Tracks evidence from both parties and financial impact.
 */
export class DisputeService {
  private readonly disputes: Map<string, Dispute> = new Map();

  /**
   * Open a new dispute for a transaction
   */
  openDispute(params: {
    transactionId: string;
    customerId: string;
    amount: number;
    reason: DisputeReason;
  }): Dispute {
    const validated = OpenDisputeSchema.parse(params);
    const now = Date.now();

    const dispute: Dispute = {
      id: `disp_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      transactionId: validated.transactionId,
      customerId: validated.customerId,
      amount: validated.amount,
      reason: validated.reason,
      status: 'opened',
      evidence: [],
      createdAt: now,
      updatedAt: now,
    };

    this.disputes.set(dispute.id, dispute);
    return { ...dispute };
  }

  /**
   * Submit evidence for a dispute
   */
  submitEvidence(
    disputeId: string,
    evidence: { submittedBy: 'customer' | 'merchant'; type: string; content: string },
  ): DisputeEvidence {
    SubmitEvidenceSchema.parse({ disputeId, ...evidence });

    const dispute = this.disputes.get(disputeId);

    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    if (dispute.status === 'resolved_won' || dispute.status === 'resolved_lost') {
      throw new Error('Cannot submit evidence for a resolved dispute');
    }

    const evidenceRecord: DisputeEvidence = {
      id: `evid_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      disputeId,
      submittedBy: evidence.submittedBy,
      type: evidence.type,
      content: evidence.content,
      submittedAt: Date.now(),
    };

    dispute.evidence.push(evidenceRecord);
    dispute.updatedAt = Date.now();

    return { ...evidenceRecord };
  }

  /**
   * Transition dispute to evidence_requested status
   */
  requestEvidence(disputeId: string): Dispute {
    const dispute = this.disputes.get(disputeId);

    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    if (dispute.status !== 'opened') {
      throw new Error(`Cannot request evidence in status: ${dispute.status}`);
    }

    dispute.status = 'evidence_requested';
    dispute.updatedAt = Date.now();

    return { ...dispute };
  }

  /**
   * Transition dispute to under_review status
   */
  startReview(disputeId: string): Dispute {
    const dispute = this.disputes.get(disputeId);

    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    const validTransitions: DisputeStatus[] = ['opened', 'evidence_requested'];
    if (!validTransitions.includes(dispute.status)) {
      throw new Error(`Cannot start review in status: ${dispute.status}`);
    }

    dispute.status = 'under_review';
    dispute.updatedAt = Date.now();

    return { ...dispute };
  }

  /**
   * Resolve a dispute with outcome
   */
  resolve(
    disputeId: string,
    params: { won: boolean; resolution: string; financialImpact: number },
  ): Dispute {
    const dispute = this.disputes.get(disputeId);

    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    if (dispute.status === 'resolved_won' || dispute.status === 'resolved_lost') {
      throw new Error('Dispute already resolved');
    }

    dispute.status = params.won ? 'resolved_won' : 'resolved_lost';
    dispute.resolution = params.resolution;
    dispute.financialImpact = params.financialImpact;
    dispute.resolvedAt = Date.now();
    dispute.updatedAt = Date.now();

    return { ...dispute };
  }

  /**
   * Get a single dispute by ID
   */
  getDispute(disputeId: string): Dispute {
    const dispute = this.disputes.get(disputeId);

    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    return { ...dispute };
  }

  /**
   * Get all disputes for a customer
   */
  getDisputesForCustomer(customerId: string): Dispute[] {
    return Array.from(this.disputes.values())
      .filter((d) => d.customerId === customerId)
      .map((d) => ({ ...d }));
  }
}
