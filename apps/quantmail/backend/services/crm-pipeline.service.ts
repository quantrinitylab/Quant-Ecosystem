/**
 * ============================================================================
 * Optimer v3.1.0-Grade CRM Sales Funnel & Deal Pipeline Engine Service
 * Provides sales pipeline stage transitions, weighted forecast calculations,
 * win-rate analytics, stage aging tracking, and deal closure tracking
 * for @quant/quantmail.
 * ============================================================================
 */

export type DealStage = 'LEAD' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';

export interface StageDefinition {
  stage: DealStage;
  name: string;
  defaultProbability: number; // 0 to 100
  order: number;
}

export interface CrmDeal {
  id: string;
  workspaceId: string;
  title: string;
  contactName: string;
  contactEmail: string;
  value: number; // Monetary amount
  currency: string;
  stage: DealStage;
  probability: number; // 0 to 100
  expectedCloseDate: string;
  lostReason?: string;
  stageHistory: Array<{ stage: DealStage; enteredAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineForecast {
  workspaceId: string;
  totalDealsCount: number;
  totalPipelineValue: number;
  weightedForecastValue: number;
  stageBreakdown: Record<DealStage, { count: number; totalValue: number; weightedValue: number }>;
  winRatePercentage: number;
}

/**
 * Standard Stages Configuration (Optimer v3.1.0 specification)
 * - LEAD: 10%
 * - QUALIFIED: 25%
 * - PROPOSAL: 50%
 * - NEGOTIATION: 75%
 * - WON: 100%
 * - LOST: 0%
 */
export const STAGE_DEFINITIONS: Record<DealStage, StageDefinition> = {
  LEAD: { stage: 'LEAD', name: 'Lead', defaultProbability: 10, order: 1 },
  QUALIFIED: { stage: 'QUALIFIED', name: 'Qualified', defaultProbability: 25, order: 2 },
  PROPOSAL: { stage: 'PROPOSAL', name: 'Proposal', defaultProbability: 50, order: 3 },
  NEGOTIATION: { stage: 'NEGOTIATION', name: 'Negotiation', defaultProbability: 75, order: 4 },
  WON: { stage: 'WON', name: 'Won', defaultProbability: 100, order: 5 },
  LOST: { stage: 'LOST', name: 'Lost', defaultProbability: 0, order: 6 },
};

export const ALL_DEAL_STAGES: DealStage[] = [
  'LEAD',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
];

// In-memory store for CRM deals
const dealsStore = new Map<string, CrmDeal>();

/**
 * Creates a new CRM deal with initial stage, default probability, and stageHistory.
 */
export function createDeal(
  workspaceId: string,
  data: {
    title: string;
    contactName: string;
    contactEmail: string;
    value: number;
    currency?: string;
    stage?: DealStage;
    expectedCloseDate: string;
    lostReason?: string;
  },
): CrmDeal {
  if (!workspaceId || workspaceId.trim() === '') {
    throw new Error('workspaceId is required');
  }
  if (!data.title || data.title.trim() === '') {
    throw new Error('Deal title is required');
  }
  if (!data.contactName || data.contactName.trim() === '') {
    throw new Error('Contact name is required');
  }
  if (!data.contactEmail || data.contactEmail.trim() === '') {
    throw new Error('Contact email is required');
  }
  if (typeof data.value !== 'number' || isNaN(data.value) || data.value < 0) {
    throw new Error('Deal value must be a non-negative number');
  }
  if (!data.expectedCloseDate || data.expectedCloseDate.trim() === '') {
    throw new Error('Expected close date is required');
  }

  const stage: DealStage = data.stage && STAGE_DEFINITIONS[data.stage] ? data.stage : 'LEAD';
  const probability = STAGE_DEFINITIONS[stage].defaultProbability;
  const now = new Date().toISOString();
  const id = `deal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const deal: CrmDeal = {
    id,
    workspaceId,
    title: data.title.trim(),
    contactName: data.contactName.trim(),
    contactEmail: data.contactEmail.trim(),
    value: data.value,
    currency: data.currency || 'USD',
    stage,
    probability,
    expectedCloseDate: data.expectedCloseDate,
    lostReason: stage === 'LOST' ? data.lostReason : undefined,
    stageHistory: [{ stage, enteredAt: now }],
    createdAt: now,
    updatedAt: now,
  };

  dealsStore.set(id, deal);
  return deal;
}

/**
 * Updates a deal's stage, probability, and records entry in stageHistory.
 * If stage is 'LOST', records lostReason.
 */
export function updateDealStage(dealId: string, newStage: DealStage, lostReason?: string): CrmDeal {
  const deal = dealsStore.get(dealId);
  if (!deal) {
    throw new Error(`Deal with id "${dealId}" not found`);
  }
  if (!STAGE_DEFINITIONS[newStage]) {
    throw new Error(`Invalid deal stage: ${newStage}`);
  }

  const now = new Date().toISOString();
  deal.stage = newStage;
  deal.probability = STAGE_DEFINITIONS[newStage].defaultProbability;
  deal.stageHistory.push({ stage: newStage, enteredAt: now });

  if (newStage === 'LOST') {
    deal.lostReason = lostReason;
  } else {
    deal.lostReason = undefined;
  }
  deal.updatedAt = now;

  return deal;
}

/**
 * Calculates pipeline forecast for a given workspace:
 * - totalDealsCount: count of all deals in workspace
 * - totalPipelineValue: sum of active deals (excluding LOST)
 * - weightedForecastValue: sum of (deal.value * (deal.probability / 100))
 * - stageBreakdown: count, totalValue, and weightedValue per stage
 * - winRatePercentage: Math.round((wonDeals / (wonDeals + lostDeals)) * 100) (or 0 if none closed)
 */
export function calculatePipelineForecast(workspaceId: string): PipelineForecast {
  const deals = Array.from(dealsStore.values()).filter((d) => d.workspaceId === workspaceId);

  const stageBreakdown: Record<
    DealStage,
    { count: number; totalValue: number; weightedValue: number }
  > = {
    LEAD: { count: 0, totalValue: 0, weightedValue: 0 },
    QUALIFIED: { count: 0, totalValue: 0, weightedValue: 0 },
    PROPOSAL: { count: 0, totalValue: 0, weightedValue: 0 },
    NEGOTIATION: { count: 0, totalValue: 0, weightedValue: 0 },
    WON: { count: 0, totalValue: 0, weightedValue: 0 },
    LOST: { count: 0, totalValue: 0, weightedValue: 0 },
  };

  let totalPipelineValue = 0;
  let weightedForecastValue = 0;
  let wonDeals = 0;
  let lostDeals = 0;

  for (const deal of deals) {
    const stage = deal.stage;
    const stageWeighted = deal.value * (deal.probability / 100);

    if (stageBreakdown[stage]) {
      stageBreakdown[stage].count += 1;
      stageBreakdown[stage].totalValue += deal.value;
      stageBreakdown[stage].weightedValue += stageWeighted;
    }

    // Active pipeline excludes LOST deals
    if (stage !== 'LOST') {
      totalPipelineValue += deal.value;
    }

    weightedForecastValue += stageWeighted;

    if (stage === 'WON') {
      wonDeals += 1;
    } else if (stage === 'LOST') {
      lostDeals += 1;
    }
  }

  // Normalize rounding to 2 decimal places
  for (const stage of Object.keys(stageBreakdown) as DealStage[]) {
    stageBreakdown[stage].totalValue = Math.round(stageBreakdown[stage].totalValue * 100) / 100;
    stageBreakdown[stage].weightedValue =
      Math.round(stageBreakdown[stage].weightedValue * 100) / 100;
  }

  const closedDeals = wonDeals + lostDeals;
  const winRatePercentage = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;

  return {
    workspaceId,
    totalDealsCount: deals.length,
    totalPipelineValue: Math.round(totalPipelineValue * 100) / 100,
    weightedForecastValue: Math.round(weightedForecastValue * 100) / 100,
    stageBreakdown,
    winRatePercentage,
  };
}

/**
 * Lists all deals for a workspace, optionally filtered by stage.
 */
export function listDealsByStage(workspaceId: string, stage?: DealStage): CrmDeal[] {
  const deals = Array.from(dealsStore.values()).filter((d) => d.workspaceId === workspaceId);
  if (stage) {
    return deals.filter((d) => d.stage === stage);
  }
  return deals;
}

/**
 * Retrieves a deal by ID.
 */
export function getDealById(dealId: string): CrmDeal | undefined {
  return dealsStore.get(dealId);
}

/**
 * Updates arbitrary deal fields (e.g. title, contact, value, custom probability, close date).
 */
export function updateDeal(
  dealId: string,
  updates: Partial<
    Pick<
      CrmDeal,
      | 'title'
      | 'contactName'
      | 'contactEmail'
      | 'value'
      | 'currency'
      | 'expectedCloseDate'
      | 'probability'
    >
  >,
): CrmDeal {
  const deal = dealsStore.get(dealId);
  if (!deal) {
    throw new Error(`Deal with id "${dealId}" not found`);
  }

  if (updates.title !== undefined) {
    if (!updates.title.trim()) throw new Error('Deal title cannot be empty');
    deal.title = updates.title.trim();
  }
  if (updates.contactName !== undefined) {
    if (!updates.contactName.trim()) throw new Error('Contact name cannot be empty');
    deal.contactName = updates.contactName.trim();
  }
  if (updates.contactEmail !== undefined) {
    if (!updates.contactEmail.trim()) throw new Error('Contact email cannot be empty');
    deal.contactEmail = updates.contactEmail.trim();
  }
  if (updates.value !== undefined) {
    if (typeof updates.value !== 'number' || isNaN(updates.value) || updates.value < 0) {
      throw new Error('Deal value must be a non-negative number');
    }
    deal.value = updates.value;
  }
  if (updates.currency !== undefined) {
    deal.currency = updates.currency || 'USD';
  }
  if (updates.expectedCloseDate !== undefined) {
    deal.expectedCloseDate = updates.expectedCloseDate;
  }
  if (updates.probability !== undefined) {
    if (
      typeof updates.probability !== 'number' ||
      updates.probability < 0 ||
      updates.probability > 100
    ) {
      throw new Error('Probability must be between 0 and 100');
    }
    deal.probability = updates.probability;
  }

  deal.updatedAt = new Date().toISOString();
  return deal;
}

/**
 * Deletes a deal by ID.
 */
export function deleteDeal(dealId: string): boolean {
  return dealsStore.delete(dealId);
}

/**
 * Calculates days spent in each stage transition (Stage Aging Tracker).
 */
export function getStageAging(
  deal: CrmDeal,
  referenceDate: Date = new Date(),
): Array<{ stage: DealStage; enteredAt: string; daysInStage: number }> {
  return deal.stageHistory.map((entry, index) => {
    const enteredTime = new Date(entry.enteredAt).getTime();
    let exitedTime: number;

    if (index < deal.stageHistory.length - 1) {
      exitedTime = new Date(deal.stageHistory[index + 1].enteredAt).getTime();
    } else {
      exitedTime = referenceDate.getTime();
    }

    const elapsedMs = Math.max(0, exitedTime - enteredTime);
    const daysInStage = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

    return {
      stage: entry.stage,
      enteredAt: entry.enteredAt,
      daysInStage,
    };
  });
}

/**
 * Clears the in-memory deals store (for test isolation).
 */
export function clearDealsForTesting(): void {
  dealsStore.clear();
}
