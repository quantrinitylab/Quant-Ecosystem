// ============================================================================
// Payments - Agent Spending Limit Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentSpendingLimitService } from '../agent-spending-limit.service';

describe('AgentSpendingLimitService', () => {
  let service: AgentSpendingLimitService;

  beforeEach(() => {
    service = new AgentSpendingLimitService();
  });

  describe('createBudget', () => {
    it('should create a budget for an agent', () => {
      const budget = service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      expect(budget.agentId).toBe('agent_1');
      expect(budget.userId).toBe('user_1');
      expect(budget.perTransactionLimit).toBe(50);
      expect(budget.hourlyLimit).toBe(200);
      expect(budget.dailyLimit).toBe(500);
      expect(budget.monthlyLimit).toBe(5000);
      expect(budget.hourlySpent).toBe(0);
      expect(budget.dailySpent).toBe(0);
      expect(budget.monthlySpent).toBe(0);
      expect(budget.requiresApprovalAbove).toBe(25);
      expect(budget.createdAt).toBeGreaterThan(0);
    });

    it('should reject invalid params', () => {
      expect(() =>
        service.createBudget({
          agentId: '',
          userId: 'user_1',
          perTransactionLimit: 50,
          hourlyLimit: 200,
          dailyLimit: 500,
          monthlyLimit: 5000,
          requiresApprovalAbove: 25,
        }),
      ).toThrow();

      expect(() =>
        service.createBudget({
          agentId: 'agent_1',
          userId: 'user_1',
          perTransactionLimit: -10,
          hourlyLimit: 200,
          dailyLimit: 500,
          monthlyLimit: 5000,
          requiresApprovalAbove: 25,
        }),
      ).toThrow();
    });
  });

  describe('checkSpend', () => {
    it('should allow spend within all limits', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      const result = service.checkSpend('agent_1', 10);
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });

    it('should indicate approval required for amount above threshold', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      const result = service.checkSpend('agent_1', 30);
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    it('should deny spend exceeding per-transaction limit', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      const result = service.checkSpend('agent_1', 60);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('per-transaction limit');
    });

    it('should deny spend exceeding hourly limit', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 100,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 100,
      });

      service.recordSpend('agent_1', 40, 'Spend 1');
      service.recordSpend('agent_1', 40, 'Spend 2');

      const result = service.checkSpend('agent_1', 30);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('hourly limit');
    });

    it('should deny spend exceeding daily limit', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 1000,
        dailyLimit: 100,
        monthlyLimit: 5000,
        requiresApprovalAbove: 100,
      });

      service.recordSpend('agent_1', 50, 'Spend 1');
      service.recordSpend('agent_1', 40, 'Spend 2');

      const result = service.checkSpend('agent_1', 20);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('daily limit');
    });

    it('should deny spend exceeding monthly limit', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 1000,
        dailyLimit: 1000,
        monthlyLimit: 100,
        requiresApprovalAbove: 100,
      });

      service.recordSpend('agent_1', 50, 'Spend 1');
      service.recordSpend('agent_1', 40, 'Spend 2');

      const result = service.checkSpend('agent_1', 20);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('monthly limit');
    });

    it('should deny spend for unknown agent', () => {
      const result = service.checkSpend('unknown', 10);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No budget configured');
    });
  });

  describe('recordSpend', () => {
    it('should update spending counters', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 200,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 250,
      });

      service.recordSpend('agent_1', 100, 'Purchase');
      service.recordSpend('agent_1', 80, 'Another purchase');

      // Verify by checking spend - 180 spent + 30 = 210 > 200 hourly limit
      const result = service.checkSpend('agent_1', 30);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('hourly limit');
    });

    it('should throw for unknown agent', () => {
      expect(() => service.recordSpend('unknown', 10, 'Test')).toThrow('No budget configured');
    });

    it('should reject invalid params', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      expect(() => service.recordSpend('agent_1', -5, 'Bad')).toThrow();
      expect(() => service.recordSpend('agent_1', 10, '')).toThrow();
    });
  });

  describe('approval workflow', () => {
    it('should create an approval request', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      const approval = service.requestApproval('agent_1', 30, 'Buy premium feature');
      expect(approval.id).toMatch(/^appr_/);
      expect(approval.agentId).toBe('agent_1');
      expect(approval.userId).toBe('user_1');
      expect(approval.amount).toBe(30);
      expect(approval.description).toBe('Buy premium feature');
      expect(approval.status).toBe('pending');
      expect(approval.requestedAt).toBeGreaterThan(0);
    });

    it('should approve a pending request', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      const approval = service.requestApproval('agent_1', 30, 'Buy feature');
      const resolved = service.resolveApproval(approval.id, 'approved');

      expect(resolved.status).toBe('approved');
      expect(resolved.resolvedAt).toBeGreaterThan(0);
    });

    it('should deny a pending request', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      const approval = service.requestApproval('agent_1', 30, 'Buy feature');
      const resolved = service.resolveApproval(approval.id, 'denied');

      expect(resolved.status).toBe('denied');
    });

    it('should throw when resolving already resolved approval', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      const approval = service.requestApproval('agent_1', 30, 'Buy feature');
      service.resolveApproval(approval.id, 'approved');

      expect(() => service.resolveApproval(approval.id, 'denied')).toThrow('already resolved');
    });

    it('should throw for unknown approval', () => {
      expect(() => service.resolveApproval('unknown', 'approved')).toThrow('not found');
    });

    it('should throw for unknown agent in requestApproval', () => {
      expect(() => service.requestApproval('unknown', 30, 'Test')).toThrow('No budget configured');
    });
  });

  describe('attemptSpend', () => {
    it('should atomically check and record spend within limits', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      const result = service.attemptSpend('agent_1', 10, 'Purchase item');
      expect(result.success).toBe(true);
      expect(result.requiresApproval).toBe(false);

      // Verify spend was recorded: 10 already spent + 45 = 55 is fine for hourly (200),
      // but let's verify by attempting something that would exceed it
      // Spend more to approach the hourly limit
      service.attemptSpend('agent_1', 50, 'Big purchase');
      service.attemptSpend('agent_1', 50, 'Another big purchase');
      service.attemptSpend('agent_1', 50, 'Yet another');

      // Now 10+50+50+50 = 160 spent hourly. 50 more would be 210 > 200
      const check = service.checkSpend('agent_1', 50);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('hourly limit');
    });

    it('should indicate approval required for amount above threshold', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      const result = service.attemptSpend('agent_1', 30, 'Expensive item');
      expect(result.success).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    it('should deny and not record when per-transaction limit exceeded', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      const result = service.attemptSpend('agent_1', 60, 'Too expensive');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('per-transaction limit');

      // Verify nothing was recorded
      const check = service.checkSpend('agent_1', 10);
      expect(check.allowed).toBe(true);
    });

    it('should deny when hourly limit would be exceeded', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 100,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 100,
      });

      service.attemptSpend('agent_1', 40, 'Spend 1');
      service.attemptSpend('agent_1', 40, 'Spend 2');

      const result = service.attemptSpend('agent_1', 30, 'Spend 3');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('hourly limit');
    });

    it('should deny when daily limit would be exceeded', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 1000,
        dailyLimit: 100,
        monthlyLimit: 5000,
        requiresApprovalAbove: 100,
      });

      service.attemptSpend('agent_1', 50, 'Spend 1');
      service.attemptSpend('agent_1', 40, 'Spend 2');

      const result = service.attemptSpend('agent_1', 20, 'Spend 3');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('daily limit');
    });

    it('should deny when monthly limit would be exceeded', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 1000,
        dailyLimit: 1000,
        monthlyLimit: 100,
        requiresApprovalAbove: 100,
      });

      service.attemptSpend('agent_1', 50, 'Spend 1');
      service.attemptSpend('agent_1', 40, 'Spend 2');

      const result = service.attemptSpend('agent_1', 20, 'Spend 3');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('monthly limit');
    });

    it('should deny for unknown agent', () => {
      const result = service.attemptSpend('unknown', 10, 'Test');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('No budget configured');
    });

    it('should reject invalid params', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 200,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 25,
      });

      expect(() => service.attemptSpend('agent_1', -5, 'Bad')).toThrow();
      expect(() => service.attemptSpend('agent_1', 10, '')).toThrow();
    });
  });

  describe('counter resets', () => {
    it('should reset hourly counters', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 100,
        dailyLimit: 500,
        monthlyLimit: 5000,
        requiresApprovalAbove: 100,
      });

      service.recordSpend('agent_1', 40, 'Spend');
      service.recordSpend('agent_1', 40, 'Spend');

      // Should be at hourly limit
      let result = service.checkSpend('agent_1', 30);
      expect(result.allowed).toBe(false);

      service.resetHourly();

      result = service.checkSpend('agent_1', 30);
      expect(result.allowed).toBe(true);
    });

    it('should reset daily counters', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 1000,
        dailyLimit: 100,
        monthlyLimit: 5000,
        requiresApprovalAbove: 100,
      });

      service.recordSpend('agent_1', 50, 'Spend 1');
      service.recordSpend('agent_1', 50, 'Spend 2');

      let result = service.checkSpend('agent_1', 10);
      expect(result.allowed).toBe(false);

      service.resetDaily();

      result = service.checkSpend('agent_1', 10);
      expect(result.allowed).toBe(true);
    });

    it('should reset monthly counters', () => {
      service.createBudget({
        agentId: 'agent_1',
        userId: 'user_1',
        perTransactionLimit: 50,
        hourlyLimit: 1000,
        dailyLimit: 1000,
        monthlyLimit: 100,
        requiresApprovalAbove: 100,
      });

      service.recordSpend('agent_1', 50, 'Spend 1');
      service.recordSpend('agent_1', 50, 'Spend 2');

      let result = service.checkSpend('agent_1', 10);
      expect(result.allowed).toBe(false);

      service.resetMonthly();

      result = service.checkSpend('agent_1', 10);
      expect(result.allowed).toBe(true);
    });
  });
});
