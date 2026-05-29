import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface TripPlan {
  destination: string;
  startDate: number;
  endDate: number;
  budget: number;
  activities: TripActivity[];
}

export interface TripActivity {
  name: string;
  date: number;
  estimatedCost: number;
  category: 'transport' | 'accommodation' | 'food' | 'activity' | 'other';
  booked: boolean;
}

export interface TravelResult {
  plan: TripPlan | null;
  totalEstimatedCost: number;
  withinBudget: boolean;
  suggestions: string[];
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Rule-based travel planning
 * Production path: Integrate LLM + travel APIs
 */
export class TravelPilot extends IntelligentAgent {
  private lastResult: TravelResult | null = null;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'travel-pilot',
      name: 'Travel Pilot',
      icon: 'map-pin',
      defaultPermission: PermissionLevel.ACT_HIGH,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.registerTravelTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('travel');
  }

  protected getSystemPrompt(): string {
    return (
      'You are an intelligent travel planning assistant. Create detailed itineraries, find ' +
      'flights and hotels, estimate costs, and provide budget-aware recommendations. Use ' +
      'available tools: travel.plan_trip to create itineraries, travel.find_flights to search ' +
      'flights, travel.book_hotel to reserve accommodation.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    const destination = (task.params?.['destination'] as string) ?? '';
    const budget = (task.params?.['budget'] as number) ?? 1000;
    const startDate = (task.params?.['startDate'] as number) ?? Date.now();
    const endDate = (task.params?.['endDate'] as number) ?? startDate + 7 * 24 * 60 * 60 * 1000;

    this.lastResult = await this.planTripWithAI(destination, budget, startDate, endDate);

    await super.execute(task);
  }

  getTravelResult(): TravelResult | null {
    return this.lastResult;
  }

  private async planTripWithAI(
    destination: string,
    budget: number,
    startDate: number,
    endDate: number,
  ): Promise<TravelResult> {
    const days = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));

    const prompt =
      `Plan a trip to ${destination} for ${days} days with a budget of $${budget}.\n` +
      `Start: ${new Date(startDate).toISOString()}, End: ${new Date(endDate).toISOString()}\n\n` +
      `Respond with JSON: { "activities": [{"name","date","estimatedCost","category","booked"}], "suggestions": ["..."] }`;

    const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

    let activities: TripActivity[];
    let suggestions: string[];

    try {
      const parsed = JSON.parse(result.content) as {
        activities?: TripActivity[];
        suggestions?: string[];
      };
      activities = parsed.activities ?? this.defaultActivities(destination, startDate, days);
      suggestions = parsed.suggestions ?? [];
    } catch {
      activities = this.defaultActivities(destination, startDate, days);
      suggestions = [];
    }

    const totalEstimatedCost = activities.reduce((sum, a) => sum + a.estimatedCost, 0);
    const withinBudget = totalEstimatedCost <= budget;

    if (suggestions.length === 0) {
      if (!withinBudget) {
        suggestions.push(`Consider shorter stay to fit within $${budget} budget`);
        suggestions.push('Look for budget accommodation options');
      } else {
        suggestions.push(
          `You have $${budget - totalEstimatedCost} remaining for extras in ${destination}`,
        );
      }
    }

    const plan: TripPlan = {
      destination,
      startDate,
      endDate,
      budget,
      activities,
    };

    return { plan, totalEstimatedCost, withinBudget, suggestions };
  }

  private defaultActivities(destination: string, startDate: number, days: number): TripActivity[] {
    const activities: TripActivity[] = [
      {
        name: `Flight to ${destination}`,
        date: startDate,
        estimatedCost: 300,
        category: 'transport',
        booked: false,
      },
      {
        name: `Hotel in ${destination}`,
        date: startDate,
        estimatedCost: 100 * days,
        category: 'accommodation',
        booked: false,
      },
    ];

    for (let i = 0; i < Math.min(days, 5); i++) {
      activities.push({
        name: `Day ${i + 1} activity in ${destination}`,
        date: startDate + i * 24 * 60 * 60 * 1000,
        estimatedCost: 50,
        category: 'activity',
        booked: false,
      });
    }

    return activities;
  }

  private registerTravelTools(): void {
    const planTripTool: ToolDefinition = {
      name: 'travel.plan_trip',
      description: 'Create a trip itinerary with AI recommendations',
      parameters: [
        { name: 'destination', type: 'string', description: 'Travel destination', required: true },
        { name: 'days', type: 'number', description: 'Number of days', required: true },
        { name: 'budget', type: 'number', description: 'Trip budget', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'travel',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { planned: args }, undoable: false };
      },
    };

    const findFlightsTool: ToolDefinition = {
      name: 'travel.find_flights',
      description: 'Search for available flights',
      parameters: [
        { name: 'origin', type: 'string', description: 'Origin city', required: true },
        { name: 'destination', type: 'string', description: 'Destination city', required: true },
        { name: 'date', type: 'number', description: 'Travel date', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'travel',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { flights: [], route: args }, undoable: false };
      },
    };

    const bookHotelTool: ToolDefinition = {
      name: 'travel.book_hotel',
      description: 'Book a hotel reservation',
      parameters: [
        { name: 'destination', type: 'string', description: 'City', required: true },
        { name: 'checkIn', type: 'number', description: 'Check-in date', required: true },
        { name: 'checkOut', type: 'number', description: 'Check-out date', required: true },
      ],
      requiredTier: AgentActionTier.Tier3_HighRisk,
      category: 'travel',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { booked: args['destination'], checkIn: args['checkIn'] },
          undoable: true,
        };
      },
    };

    this.toolRegistry.registerTool(planTripTool);
    this.toolRegistry.registerTool(findFlightsTool);
    this.toolRegistry.registerTool(bookHotelTool);
  }
}
