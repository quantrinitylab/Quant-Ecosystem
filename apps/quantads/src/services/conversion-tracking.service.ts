// ============================================================================
// QuantAds - Conversion Tracking Service
// Define conversion goals, track events, and calculate campaign ROI
// ============================================================================

export interface ConversionGoal {
  id: string;
  name: string;
  value: number;
  window: number;
  eventName: string;
}

export interface Conversion {
  id: string;
  goalId: string;
  userId: string;
  campaignId: string;
  timestamp: number;
  value: number;
}

export interface CampaignROI {
  campaignId: string;
  spend: number;
  conversions: number;
  revenue: number;
  roi: number;
  costPerConversion: number;
}

export class ConversionTrackingService {
  private goals: Map<string, ConversionGoal> = new Map();
  private conversions: Conversion[] = [];
  private idCounter = 0;

  private generateId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  defineGoal(name: string, value: number, window: number, eventName: string): ConversionGoal {
    const goal: ConversionGoal = {
      id: this.generateId('goal'),
      name,
      value,
      window,
      eventName,
    };
    this.goals.set(goal.id, goal);
    return goal;
  }

  deleteGoal(goalId: string): boolean {
    return this.goals.delete(goalId);
  }

  trackConversion(
    goalId: string,
    userId: string,
    campaignId: string,
    value?: number,
  ): Conversion | null {
    const goal = this.goals.get(goalId);
    if (!goal) return null;

    const conversion: Conversion = {
      id: this.generateId('conv'),
      goalId,
      userId,
      campaignId,
      timestamp: Date.now(),
      value: value ?? goal.value,
    };
    this.conversions.push(conversion);
    return conversion;
  }

  getConversionRate(campaignId: string, goalId: string): number {
    const campaignConversions = this.conversions.filter(
      (c) => c.campaignId === campaignId && c.goalId === goalId,
    );
    const uniqueUsers = new Set(campaignConversions.map((c) => c.userId));
    // Rate based on unique converting users (simplified)
    return uniqueUsers.size > 0 ? uniqueUsers.size / Math.max(uniqueUsers.size, 1) : 0;
  }

  getROI(campaignId: string, spend: number): CampaignROI {
    const campaignConversions = this.conversions.filter((c) => c.campaignId === campaignId);
    const revenue = campaignConversions.reduce((sum, c) => sum + c.value, 0);
    const conversionsCount = campaignConversions.length;

    return {
      campaignId,
      spend,
      conversions: conversionsCount,
      revenue,
      roi: spend > 0 ? (revenue - spend) / spend : 0,
      costPerConversion: conversionsCount > 0 ? spend / conversionsCount : 0,
    };
  }

  getConversions(campaignId: string, timeRange?: { start: number; end: number }): Conversion[] {
    return this.conversions.filter((c) => {
      if (c.campaignId !== campaignId) return false;
      if (timeRange) {
        if (c.timestamp < timeRange.start || c.timestamp > timeRange.end) return false;
      }
      return true;
    });
  }

  getGoals(): ConversionGoal[] {
    return [...this.goals.values()];
  }
}
