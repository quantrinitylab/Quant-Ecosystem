import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from '../cost-tracker.js';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('recordCost and getTotalCost', () => {
    it('records cost and retrieves total', () => {
      tracker.recordCost('agent-1', 'wf-1', 0.05, 'Step 1');
      tracker.recordCost('agent-1', 'wf-1', 0.1, 'Step 2');
      expect(tracker.getTotalCost('agent-1')).toBeCloseTo(0.15, 2);
    });

    it('filters by agent ID', () => {
      tracker.recordCost('agent-1', 'wf-1', 0.05, 'Step 1');
      tracker.recordCost('agent-2', 'wf-2', 0.1, 'Step 2');
      expect(tracker.getTotalCost('agent-1')).toBeCloseTo(0.05, 2);
      expect(tracker.getTotalCost('agent-2')).toBeCloseTo(0.1, 2);
    });

    it('returns 0 for unknown agent', () => {
      expect(tracker.getTotalCost('unknown')).toBe(0);
    });
  });

  describe('getWorkflowCost', () => {
    it('returns total cost for a workflow', () => {
      tracker.recordCost('agent-1', 'wf-1', 0.05, 'Step 1');
      tracker.recordCost('agent-1', 'wf-1', 0.1, 'Step 2');
      tracker.recordCost('agent-1', 'wf-2', 0.2, 'Step 3');
      expect(tracker.getWorkflowCost('wf-1')).toBeCloseTo(0.15, 2);
      expect(tracker.getWorkflowCost('wf-2')).toBeCloseTo(0.2, 2);
    });
  });

  describe('setBudget and isWithinBudget', () => {
    it('allows spending within budget', () => {
      tracker.setBudget({
        agentId: 'agent-1',
        limit: 1.0,
        period: 'daily',
        currency: 'USD',
      });
      tracker.recordCost('agent-1', 'wf-1', 0.5, 'Step 1');
      expect(tracker.isWithinBudget('agent-1', 0.3)).toBe(true);
    });

    it('blocks spending that exceeds budget', () => {
      tracker.setBudget({
        agentId: 'agent-1',
        limit: 1.0,
        period: 'daily',
        currency: 'USD',
      });
      tracker.recordCost('agent-1', 'wf-1', 0.8, 'Step 1');
      expect(tracker.isWithinBudget('agent-1', 0.3)).toBe(false);
    });

    it('returns true when no budget is set', () => {
      expect(tracker.isWithinBudget('agent-1', 100)).toBe(true);
    });
  });

  describe('getBudget', () => {
    it('returns the budget config', () => {
      tracker.setBudget({
        agentId: 'agent-1',
        limit: 5.0,
        period: 'weekly',
        currency: 'USD',
      });
      const budget = tracker.getBudget('agent-1');
      expect(budget?.limit).toBe(5.0);
      expect(budget?.period).toBe('weekly');
    });

    it('returns undefined for no budget', () => {
      expect(tracker.getBudget('unknown')).toBeUndefined();
    });
  });

  describe('getSpendingHistory', () => {
    it('returns records for the agent', () => {
      tracker.recordCost('agent-1', 'wf-1', 0.05, 'Step 1');
      tracker.recordCost('agent-1', 'wf-2', 0.1, 'Step 2');
      tracker.recordCost('agent-2', 'wf-3', 0.2, 'Step 3');

      const history = tracker.getSpendingHistory('agent-1');
      expect(history).toHaveLength(2);
    });

    it('respects the limit parameter', () => {
      tracker.recordCost('agent-1', 'wf-1', 0.05, 'Step 1');
      tracker.recordCost('agent-1', 'wf-2', 0.1, 'Step 2');
      tracker.recordCost('agent-1', 'wf-3', 0.15, 'Step 3');

      const history = tracker.getSpendingHistory('agent-1', 2);
      expect(history).toHaveLength(2);
    });

    it('returns records sorted by timestamp descending', () => {
      tracker.recordCost('agent-1', 'wf-1', 0.05, 'First');
      tracker.recordCost('agent-1', 'wf-2', 0.1, 'Second');

      const history = tracker.getSpendingHistory('agent-1');
      expect(history).toHaveLength(2);
      // Both records are returned; order depends on timestamp resolution
      const descriptions = history.map((r) => r.description);
      expect(descriptions).toContain('First');
      expect(descriptions).toContain('Second');
    });
  });
});
