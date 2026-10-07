// ============================================================================
// Payments - Dispute Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { DisputeService } from '../dispute.service';

describe('DisputeService', () => {
  let service: DisputeService;

  beforeEach(() => {
    service = new DisputeService();
  });

  describe('openDispute', () => {
    it('should create a dispute with opened status', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      expect(dispute.id).toMatch(/^disp_/);
      expect(dispute.transactionId).toBe('txn_1');
      expect(dispute.customerId).toBe('cust_1');
      expect(dispute.amount).toBe(99.99);
      expect(dispute.reason).toBe('fraud');
      expect(dispute.status).toBe('opened');
      expect(dispute.evidence).toHaveLength(0);
      expect(dispute.createdAt).toBeGreaterThan(0);
      expect(dispute.updatedAt).toBeGreaterThan(0);
    });

    it('should support all dispute reasons', () => {
      const reasons = ['fraud', 'not_received', 'product_issue', 'duplicate', 'other'] as const;

      for (const reason of reasons) {
        const dispute = service.openDispute({
          transactionId: `txn_${reason}`,
          customerId: 'cust_1',
          amount: 50,
          reason,
        });
        expect(dispute.reason).toBe(reason);
      }
    });

    it('should reject invalid params', () => {
      expect(() =>
        service.openDispute({
          transactionId: '',
          customerId: 'cust_1',
          amount: 50,
          reason: 'fraud',
        }),
      ).toThrow();

      expect(() =>
        service.openDispute({
          transactionId: 'txn_1',
          customerId: 'cust_1',
          amount: -10,
          reason: 'fraud',
        }),
      ).toThrow();
    });
  });

  describe('submitEvidence', () => {
    it('should add evidence to a dispute', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      const evidence = service.submitEvidence(dispute.id, {
        submittedBy: 'customer',
        type: 'receipt',
        content: 'Receipt showing charge was unauthorized',
      });

      expect(evidence.id).toMatch(/^evid_/);
      expect(evidence.disputeId).toBe(dispute.id);
      expect(evidence.submittedBy).toBe('customer');
      expect(evidence.type).toBe('receipt');
      expect(evidence.content).toBe('Receipt showing charge was unauthorized');
      expect(evidence.submittedAt).toBeGreaterThan(0);
    });

    it('should allow evidence from both parties', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'not_received',
      });

      service.submitEvidence(dispute.id, {
        submittedBy: 'customer',
        type: 'screenshot',
        content: 'No delivery received',
      });

      service.submitEvidence(dispute.id, {
        submittedBy: 'merchant',
        type: 'tracking',
        content: 'Tracking number: ABC123',
      });

      const updated = service.getDispute(dispute.id);
      expect(updated.evidence).toHaveLength(2);
    });

    it('should throw for resolved dispute', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      service.resolve(dispute.id, {
        won: true,
        resolution: 'Refund issued',
        financialImpact: 99.99,
      });

      expect(() =>
        service.submitEvidence(dispute.id, {
          submittedBy: 'customer',
          type: 'doc',
          content: 'Late evidence',
        }),
      ).toThrow('resolved dispute');
    });

    it('should throw for unknown dispute', () => {
      expect(() =>
        service.submitEvidence('unknown', {
          submittedBy: 'customer',
          type: 'doc',
          content: 'Evidence',
        }),
      ).toThrow('not found');
    });
  });

  describe('requestEvidence', () => {
    it('should transition from opened to evidence_requested', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      const updated = service.requestEvidence(dispute.id);
      expect(updated.status).toBe('evidence_requested');
    });

    it('should throw if not in opened status', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      service.requestEvidence(dispute.id);

      expect(() => service.requestEvidence(dispute.id)).toThrow();
    });

    it('should throw for unknown dispute', () => {
      expect(() => service.requestEvidence('unknown')).toThrow('not found');
    });
  });

  describe('startReview', () => {
    it('should transition from opened to under_review', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      const updated = service.startReview(dispute.id);
      expect(updated.status).toBe('under_review');
    });

    it('should transition from evidence_requested to under_review', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      service.requestEvidence(dispute.id);
      const updated = service.startReview(dispute.id);
      expect(updated.status).toBe('under_review');
    });

    it('should throw if already under review or resolved', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      service.startReview(dispute.id);
      expect(() => service.startReview(dispute.id)).toThrow();
    });

    it('should throw for unknown dispute', () => {
      expect(() => service.startReview('unknown')).toThrow('not found');
    });
  });

  describe('resolve', () => {
    it('should resolve dispute as won', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      const resolved = service.resolve(dispute.id, {
        won: true,
        resolution: 'Refund issued to customer',
        financialImpact: 99.99,
      });

      expect(resolved.status).toBe('resolved_won');
      expect(resolved.resolution).toBe('Refund issued to customer');
      expect(resolved.financialImpact).toBe(99.99);
      expect(resolved.resolvedAt).toBeGreaterThan(0);
    });

    it('should resolve dispute as lost', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      const resolved = service.resolve(dispute.id, {
        won: false,
        resolution: 'Evidence supports merchant',
        financialImpact: 0,
      });

      expect(resolved.status).toBe('resolved_lost');
    });

    it('should throw if already resolved', () => {
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      service.resolve(dispute.id, {
        won: true,
        resolution: 'Refund',
        financialImpact: 99.99,
      });

      expect(() =>
        service.resolve(dispute.id, {
          won: false,
          resolution: 'Changed mind',
          financialImpact: 0,
        }),
      ).toThrow('already resolved');
    });

    it('should throw for unknown dispute', () => {
      expect(() =>
        service.resolve('unknown', {
          won: true,
          resolution: 'Test',
          financialImpact: 0,
        }),
      ).toThrow('not found');
    });
  });

  describe('getDispute', () => {
    it('should retrieve a dispute by ID', () => {
      const created = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 99.99,
        reason: 'fraud',
      });

      const retrieved = service.getDispute(created.id);
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.transactionId).toBe('txn_1');
    });

    it('should throw for unknown dispute', () => {
      expect(() => service.getDispute('unknown')).toThrow('not found');
    });
  });

  describe('getDisputesForCustomer', () => {
    it('should return all disputes for a customer', () => {
      service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 50,
        reason: 'fraud',
      });

      service.openDispute({
        transactionId: 'txn_2',
        customerId: 'cust_1',
        amount: 75,
        reason: 'not_received',
      });

      service.openDispute({
        transactionId: 'txn_3',
        customerId: 'cust_2',
        amount: 30,
        reason: 'other',
      });

      const disputes = service.getDisputesForCustomer('cust_1');
      expect(disputes).toHaveLength(2);
      expect(disputes.every((d) => d.customerId === 'cust_1')).toBe(true);
    });

    it('should return empty array for unknown customer', () => {
      const disputes = service.getDisputesForCustomer('unknown');
      expect(disputes).toHaveLength(0);
    });
  });

  describe('full lifecycle', () => {
    it('should handle complete dispute lifecycle', () => {
      // Open dispute
      const dispute = service.openDispute({
        transactionId: 'txn_1',
        customerId: 'cust_1',
        amount: 150,
        reason: 'product_issue',
      });
      expect(dispute.status).toBe('opened');

      // Request evidence
      const evidenceRequested = service.requestEvidence(dispute.id);
      expect(evidenceRequested.status).toBe('evidence_requested');

      // Submit evidence from both parties
      service.submitEvidence(dispute.id, {
        submittedBy: 'customer',
        type: 'photo',
        content: 'Product was damaged on arrival',
      });

      service.submitEvidence(dispute.id, {
        submittedBy: 'merchant',
        type: 'shipping_log',
        content: 'Package was insured and delivered intact',
      });

      // Start review
      const underReview = service.startReview(dispute.id);
      expect(underReview.status).toBe('under_review');

      // Resolve
      const resolved = service.resolve(dispute.id, {
        won: true,
        resolution: 'Customer provided photo evidence of damage',
        financialImpact: 150,
      });

      expect(resolved.status).toBe('resolved_won');
      expect(resolved.evidence).toHaveLength(2);
      expect(resolved.financialImpact).toBe(150);
    });
  });
});
