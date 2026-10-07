import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDeal,
  updateDealStage,
  calculatePipelineForecast,
  listDealsByStage,
  getDealById,
  updateDeal,
  deleteDeal,
  getStageAging,
  clearDealsForTesting,
  STAGE_DEFINITIONS,
  ALL_DEAL_STAGES,
  type DealStage,
} from '../services/crm-pipeline.service';

describe('Optimer v3.1.0-Grade CRM Deal Pipeline Service', () => {
  const WORKSPACE_A = 'ws-optimer-enterprise-01';
  const WORKSPACE_B = 'ws-optimer-startup-02';

  beforeEach(() => {
    clearDealsForTesting();
  });

  describe('Standard Stage Configurations', () => {
    it('defines standard Optimer v3.1.0 stages and default probabilities', () => {
      expect(STAGE_DEFINITIONS.LEAD.defaultProbability).toBe(10);
      expect(STAGE_DEFINITIONS.QUALIFIED.defaultProbability).toBe(25);
      expect(STAGE_DEFINITIONS.PROPOSAL.defaultProbability).toBe(50);
      expect(STAGE_DEFINITIONS.NEGOTIATION.defaultProbability).toBe(75);
      expect(STAGE_DEFINITIONS.WON.defaultProbability).toBe(100);
      expect(STAGE_DEFINITIONS.LOST.defaultProbability).toBe(0);

      expect(ALL_DEAL_STAGES).toEqual([
        'LEAD',
        'QUALIFIED',
        'PROPOSAL',
        'NEGOTIATION',
        'WON',
        'LOST',
      ]);
    });
  });

  describe('createDeal', () => {
    it('sets correct default stage (LEAD), default probability (10%), and initial stageHistory', () => {
      const deal = createDeal(WORKSPACE_A, {
        title: 'Acme Enterprise License',
        contactName: 'Alice Johnson',
        contactEmail: 'alice@acme.com',
        value: 50000,
        expectedCloseDate: '2026-12-31T00:00:00.000Z',
      });

      expect(deal.id).toBeDefined();
      expect(deal.id.startsWith('deal_')).toBe(true);
      expect(deal.workspaceId).toBe(WORKSPACE_A);
      expect(deal.title).toBe('Acme Enterprise License');
      expect(deal.contactName).toBe('Alice Johnson');
      expect(deal.contactEmail).toBe('alice@acme.com');
      expect(deal.value).toBe(50000);
      expect(deal.currency).toBe('USD');
      expect(deal.stage).toBe('LEAD');
      expect(deal.probability).toBe(10);
      expect(deal.expectedCloseDate).toBe('2026-12-31T00:00:00.000Z');
      expect(deal.lostReason).toBeUndefined();

      expect(deal.stageHistory).toHaveLength(1);
      expect(deal.stageHistory[0].stage).toBe('LEAD');
      expect(deal.stageHistory[0].enteredAt).toBeDefined();
      expect(deal.createdAt).toBeDefined();
      expect(deal.updatedAt).toBeDefined();
    });

    it('creates deal with explicit stage and corresponding default probability', () => {
      const deal = createDeal(WORKSPACE_A, {
        title: 'Globex Cloud Migration',
        contactName: 'Bob Smith',
        contactEmail: 'bob@globex.org',
        value: 120000,
        currency: 'EUR',
        stage: 'PROPOSAL',
        expectedCloseDate: '2026-11-15T00:00:00.000Z',
      });

      expect(deal.stage).toBe('PROPOSAL');
      expect(deal.probability).toBe(50);
      expect(deal.currency).toBe('EUR');
      expect(deal.stageHistory).toHaveLength(1);
      expect(deal.stageHistory[0].stage).toBe('PROPOSAL');
    });

    it('validates required inputs and throws meaningful errors', () => {
      expect(() =>
        createDeal('', {
          title: 'Deal',
          contactName: 'Name',
          contactEmail: 'test@example.com',
          value: 1000,
          expectedCloseDate: '2026-10-01',
        }),
      ).toThrow('workspaceId is required');

      expect(() =>
        createDeal(WORKSPACE_A, {
          title: '',
          contactName: 'Name',
          contactEmail: 'test@example.com',
          value: 1000,
          expectedCloseDate: '2026-10-01',
        }),
      ).toThrow('Deal title is required');

      expect(() =>
        createDeal(WORKSPACE_A, {
          title: 'Valid Title',
          contactName: '',
          contactEmail: 'test@example.com',
          value: 1000,
          expectedCloseDate: '2026-10-01',
        }),
      ).toThrow('Contact name is required');

      expect(() =>
        createDeal(WORKSPACE_A, {
          title: 'Valid Title',
          contactName: 'Valid Name',
          contactEmail: '',
          value: 1000,
          expectedCloseDate: '2026-10-01',
        }),
      ).toThrow('Contact email is required');

      expect(() =>
        createDeal(WORKSPACE_A, {
          title: 'Valid Title',
          contactName: 'Valid Name',
          contactEmail: 'test@example.com',
          value: -500,
          expectedCloseDate: '2026-10-01',
        }),
      ).toThrow('Deal value must be a non-negative number');

      expect(() =>
        createDeal(WORKSPACE_A, {
          title: 'Valid Title',
          contactName: 'Valid Name',
          contactEmail: 'test@example.com',
          value: 1000,
          expectedCloseDate: '',
        }),
      ).toThrow('Expected close date is required');
    });
  });

  describe('updateDealStage', () => {
    it('records stage history and updates probability on transition', () => {
      const deal = createDeal(WORKSPACE_A, {
        title: 'SaaS Expansion',
        contactName: 'Carol White',
        contactEmail: 'carol@white.io',
        value: 80000,
        expectedCloseDate: '2026-10-30',
      });

      expect(deal.stage).toBe('LEAD');
      expect(deal.probability).toBe(10);
      expect(deal.stageHistory).toHaveLength(1);

      // Transition to QUALIFIED (25%)
      const qualifiedDeal = updateDealStage(deal.id, 'QUALIFIED');
      expect(qualifiedDeal.stage).toBe('QUALIFIED');
      expect(qualifiedDeal.probability).toBe(25);
      expect(qualifiedDeal.stageHistory).toHaveLength(2);
      expect(qualifiedDeal.stageHistory[1].stage).toBe('QUALIFIED');

      // Transition to NEGOTIATION (75%)
      const negotiationDeal = updateDealStage(deal.id, 'NEGOTIATION');
      expect(negotiationDeal.stage).toBe('NEGOTIATION');
      expect(negotiationDeal.probability).toBe(75);
      expect(negotiationDeal.stageHistory).toHaveLength(3);
      expect(negotiationDeal.stageHistory[2].stage).toBe('NEGOTIATION');

      // Transition to WON (100%)
      const wonDeal = updateDealStage(deal.id, 'WON');
      expect(wonDeal.stage).toBe('WON');
      expect(wonDeal.probability).toBe(100);
      expect(wonDeal.stageHistory).toHaveLength(4);
      expect(wonDeal.stageHistory[3].stage).toBe('WON');
      expect(wonDeal.lostReason).toBeUndefined();
    });

    it('records lostReason when moving to LOST and clears it if reactivated', () => {
      const deal = createDeal(WORKSPACE_A, {
        title: 'Infrastructure Deal',
        contactName: 'Dave Miller',
        contactEmail: 'dave@infratech.net',
        value: 45000,
        expectedCloseDate: '2026-11-20',
      });

      const lostDeal = updateDealStage(
        deal.id,
        'LOST',
        'Competitor provided lower initial pricing',
      );

      expect(lostDeal.stage).toBe('LOST');
      expect(lostDeal.probability).toBe(0);
      expect(lostDeal.lostReason).toBe('Competitor provided lower initial pricing');
      expect(lostDeal.stageHistory).toHaveLength(2);
      expect(lostDeal.stageHistory[1].stage).toBe('LOST');

      // Reactivate deal into NEGOTIATION
      const reactivated = updateDealStage(deal.id, 'NEGOTIATION');
      expect(reactivated.stage).toBe('NEGOTIATION');
      expect(reactivated.probability).toBe(75);
      expect(reactivated.lostReason).toBeUndefined();
      expect(reactivated.stageHistory).toHaveLength(3);
      expect(reactivated.stageHistory[2].stage).toBe('NEGOTIATION');
    });

    it('throws error when deal ID does not exist', () => {
      expect(() => updateDealStage('non-existent-deal-id', 'QUALIFIED')).toThrow(
        'Deal with id "non-existent-deal-id" not found',
      );
    });

    it('throws error when stage is invalid', () => {
      const deal = createDeal(WORKSPACE_A, {
        title: 'Invalid Stage Test',
        contactName: 'User',
        contactEmail: 'user@test.com',
        value: 1000,
        expectedCloseDate: '2026-12-01',
      });

      expect(() => updateDealStage(deal.id, 'UNKNOWN_STAGE' as DealStage)).toThrow(
        'Invalid deal stage: UNKNOWN_STAGE',
      );
    });
  });

  describe('calculatePipelineForecast & Weighted Value', () => {
    it('correctly sums total active pipeline value and weighted forecast value', () => {
      // Create 5 deals in workspace A:
      // Deal 1: LEAD $10,000 (10% -> $1,000)
      createDeal(WORKSPACE_A, {
        title: 'Deal 1',
        contactName: 'Lead 1',
        contactEmail: 'l1@test.com',
        value: 10000,
        stage: 'LEAD',
        expectedCloseDate: '2026-12-01',
      });

      // Deal 2: QUALIFIED $20,000 (25% -> $5,000)
      createDeal(WORKSPACE_A, {
        title: 'Deal 2',
        contactName: 'Lead 2',
        contactEmail: 'l2@test.com',
        value: 20000,
        stage: 'QUALIFIED',
        expectedCloseDate: '2026-12-01',
      });

      // Deal 3: PROPOSAL $40,000 (50% -> $20,000)
      createDeal(WORKSPACE_A, {
        title: 'Deal 3',
        contactName: 'Lead 3',
        contactEmail: 'l3@test.com',
        value: 40000,
        stage: 'PROPOSAL',
        expectedCloseDate: '2026-12-01',
      });

      // Deal 4: WON $30,000 (100% -> $30,000)
      createDeal(WORKSPACE_A, {
        title: 'Deal 4',
        contactName: 'Lead 4',
        contactEmail: 'l4@test.com',
        value: 30000,
        stage: 'WON',
        expectedCloseDate: '2026-12-01',
      });

      // Deal 5: LOST $25,000 (0% -> $0)
      const deal5 = createDeal(WORKSPACE_A, {
        title: 'Deal 5',
        contactName: 'Lead 5',
        contactEmail: 'l5@test.com',
        value: 25000,
        stage: 'LEAD',
        expectedCloseDate: '2026-12-01',
      });
      updateDealStage(deal5.id, 'LOST', 'Budget cancelled');

      // Active deals = 10,000 + 20,000 + 40,000 + 30,000 = $100,000 (excluding LOST $25k)
      // Weighted forecast = (10k * 0.10) + (20k * 0.25) + (40k * 0.50) + (30k * 1.00) + (25k * 0.0)
      //                   = 1,000 + 5,000 + 20,000 + 30,000 + 0 = $56,000

      const forecast = calculatePipelineForecast(WORKSPACE_A);

      expect(forecast.workspaceId).toBe(WORKSPACE_A);
      expect(forecast.totalDealsCount).toBe(5);
      expect(forecast.totalPipelineValue).toBe(100000);
      expect(forecast.weightedForecastValue).toBe(56000);

      // Verify breakdown per stage
      expect(forecast.stageBreakdown.LEAD).toEqual({
        count: 1,
        totalValue: 10000,
        weightedValue: 1000,
      });
      expect(forecast.stageBreakdown.QUALIFIED).toEqual({
        count: 1,
        totalValue: 20000,
        weightedValue: 5000,
      });
      expect(forecast.stageBreakdown.PROPOSAL).toEqual({
        count: 1,
        totalValue: 40000,
        weightedValue: 20000,
      });
      expect(forecast.stageBreakdown.NEGOTIATION).toEqual({
        count: 0,
        totalValue: 0,
        weightedValue: 0,
      });
      expect(forecast.stageBreakdown.WON).toEqual({
        count: 1,
        totalValue: 30000,
        weightedValue: 30000,
      });
      expect(forecast.stageBreakdown.LOST).toEqual({
        count: 1,
        totalValue: 25000,
        weightedValue: 0,
      });
    });

    it('isolates pipeline forecast across different workspaces', () => {
      createDeal(WORKSPACE_A, {
        title: 'Deal Workspace A',
        contactName: 'User A',
        contactEmail: 'a@test.com',
        value: 50000,
        stage: 'PROPOSAL',
        expectedCloseDate: '2026-12-01',
      });

      createDeal(WORKSPACE_B, {
        title: 'Deal Workspace B',
        contactName: 'User B',
        contactEmail: 'b@test.com',
        value: 15000,
        stage: 'NEGOTIATION',
        expectedCloseDate: '2026-12-01',
      });

      const forecastA = calculatePipelineForecast(WORKSPACE_A);
      expect(forecastA.totalDealsCount).toBe(1);
      expect(forecastA.totalPipelineValue).toBe(50000);
      expect(forecastA.weightedForecastValue).toBe(25000); // 50% of 50000

      const forecastB = calculatePipelineForecast(WORKSPACE_B);
      expect(forecastB.totalDealsCount).toBe(1);
      expect(forecastB.totalPipelineValue).toBe(15000);
      expect(forecastB.weightedForecastValue).toBe(11250); // 75% of 15000
    });
  });

  describe('Win Rate Percentage Computation', () => {
    it('returns 0% when no deals have been closed (won or lost)', () => {
      createDeal(WORKSPACE_A, {
        title: 'Open Deal 1',
        contactName: 'Client 1',
        contactEmail: 'c1@test.com',
        value: 10000,
        stage: 'LEAD',
        expectedCloseDate: '2026-12-01',
      });
      createDeal(WORKSPACE_A, {
        title: 'Open Deal 2',
        contactName: 'Client 2',
        contactEmail: 'c2@test.com',
        value: 20000,
        stage: 'PROPOSAL',
        expectedCloseDate: '2026-12-01',
      });

      const forecast = calculatePipelineForecast(WORKSPACE_A);
      expect(forecast.winRatePercentage).toBe(0);
    });

    it('accurately computes win rate percentage based on won / (won + lost)', () => {
      // 3 Won deals
      for (let i = 1; i <= 3; i++) {
        createDeal(WORKSPACE_A, {
          title: `Won Deal ${i}`,
          contactName: `Client ${i}`,
          contactEmail: `client${i}@test.com`,
          value: 10000,
          stage: 'WON',
          expectedCloseDate: '2026-12-01',
        });
      }

      // 1 Lost deal
      const lostDeal = createDeal(WORKSPACE_A, {
        title: 'Lost Deal 1',
        contactName: 'Lost Client',
        contactEmail: 'lost@test.com',
        value: 15000,
        stage: 'LEAD',
        expectedCloseDate: '2026-12-01',
      });
      updateDealStage(lostDeal.id, 'LOST', 'Pricing mismatch');

      // 2 Open deals (should not affect closed win rate denominator)
      createDeal(WORKSPACE_A, {
        title: 'Open Deal',
        contactName: 'Open Client',
        contactEmail: 'open@test.com',
        value: 5000,
        stage: 'QUALIFIED',
        expectedCloseDate: '2026-12-01',
      });

      const forecast = calculatePipelineForecast(WORKSPACE_A);
      // Won: 3, Lost: 1. Win rate = 3 / (3 + 1) = 75%
      expect(forecast.winRatePercentage).toBe(75);
    });

    it('accurately rounds win rate percentage when ratio is fractional', () => {
      // 1 Won, 2 Lost -> 1/3 = 33.333% -> 33%
      createDeal(WORKSPACE_A, {
        title: 'Won Deal',
        contactName: 'Won Client',
        contactEmail: 'won@test.com',
        value: 10000,
        stage: 'WON',
        expectedCloseDate: '2026-12-01',
      });

      for (let i = 1; i <= 2; i++) {
        const d = createDeal(WORKSPACE_A, {
          title: `Lost Deal ${i}`,
          contactName: `Lost Client ${i}`,
          contactEmail: `lost${i}@test.com`,
          value: 10000,
          stage: 'LEAD',
          expectedCloseDate: '2026-12-01',
        });
        updateDealStage(d.id, 'LOST', 'Feature requirement unfulfilled');
      }

      const forecast = calculatePipelineForecast(WORKSPACE_A);
      expect(forecast.winRatePercentage).toBe(33);
    });
  });

  describe('listDealsByStage and Deal Operations', () => {
    it('lists deals filtered by stage or all deals', () => {
      const d1 = createDeal(WORKSPACE_A, {
        title: 'Lead Deal',
        contactName: 'Lead Contact',
        contactEmail: 'lead@test.com',
        value: 5000,
        stage: 'LEAD',
        expectedCloseDate: '2026-12-01',
      });

      const d2 = createDeal(WORKSPACE_A, {
        title: 'Proposal Deal',
        contactName: 'Proposal Contact',
        contactEmail: 'prop@test.com',
        value: 15000,
        stage: 'PROPOSAL',
        expectedCloseDate: '2026-12-01',
      });

      const allDeals = listDealsByStage(WORKSPACE_A);
      expect(allDeals).toHaveLength(2);

      const leadDeals = listDealsByStage(WORKSPACE_A, 'LEAD');
      expect(leadDeals).toHaveLength(1);
      expect(leadDeals[0].id).toBe(d1.id);

      const proposalDeals = listDealsByStage(WORKSPACE_A, 'PROPOSAL');
      expect(proposalDeals).toHaveLength(1);
      expect(proposalDeals[0].id).toBe(d2.id);

      const wonDeals = listDealsByStage(WORKSPACE_A, 'WON');
      expect(wonDeals).toHaveLength(0);
    });

    it('supports retrieving, updating metadata, and deleting deals', () => {
      const deal = createDeal(WORKSPACE_A, {
        title: 'Original Title',
        contactName: 'Original Name',
        contactEmail: 'original@test.com',
        value: 10000,
        expectedCloseDate: '2026-12-01',
      });

      expect(getDealById(deal.id)?.title).toBe('Original Title');

      const updated = updateDeal(deal.id, {
        title: 'Updated Title',
        value: 20000,
        probability: 30,
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.value).toBe(20000);
      expect(updated.probability).toBe(30);

      const deleted = deleteDeal(deal.id);
      expect(deleted).toBe(true);
      expect(getDealById(deal.id)).toBeUndefined();
    });

    it('tracks stage aging elapsed days between transitions', () => {
      const deal = createDeal(WORKSPACE_A, {
        title: 'Aging Deal',
        contactName: 'Contact',
        contactEmail: 'contact@test.com',
        value: 25000,
        expectedCloseDate: '2026-12-01',
      });

      // Simulate stage history timestamps:
      // Entered LEAD 10 days ago, entered QUALIFIED 3 days ago
      const dayMs = 24 * 60 * 60 * 1000;
      const t0 = new Date(Date.now() - 10 * dayMs).toISOString();
      const t1 = new Date(Date.now() - 3 * dayMs).toISOString();

      deal.stageHistory = [
        { stage: 'LEAD', enteredAt: t0 },
        { stage: 'QUALIFIED', enteredAt: t1 },
      ];

      const aging = getStageAging(deal);
      expect(aging).toHaveLength(2);
      expect(aging[0].stage).toBe('LEAD');
      expect(aging[0].daysInStage).toBe(7); // 10 days ago until 3 days ago = 7 days
      expect(aging[1].stage).toBe('QUALIFIED');
      expect(aging[1].daysInStage).toBe(3); // 3 days ago until now = 3 days
    });
  });
});
