import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentState } from '../state-machine.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface HealthMetric {
  type: string;
  value: number;
  unit: string;
  timestamp: number;
}

export interface HealthReminder {
  id: string;
  message: string;
  dueTime: number;
  recurring: boolean;
}

export interface HealthResult {
  metrics: HealthMetric[];
  reminders: HealthReminder[];
  trends: Array<{ metric: string; trend: 'up' | 'down' | 'stable' }>;
}

export class HealthPilot extends IntelligentAgent {
  private lastResult: HealthResult | null = null;
  private readonly optIn: boolean;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
    optIn: boolean;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'health-pilot',
      name: 'Health Pilot',
      icon: 'heart',
      defaultPermission: PermissionLevel.OBSERVE,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.optIn = deps.optIn;
    this.registerHealthTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('health');
  }

  protected getSystemPrompt(): string {
    return (
      'You are a health data assistant. NEVER provide medical advice, diagnoses, or treatment ' +
      'recommendations. Only summarize and visualize user health data. Track metrics, identify ' +
      'trends, and generate weekly digests. Use available tools: health.track_metric to record ' +
      'data, health.generate_digest to create summaries, health.trend_analysis to detect patterns.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    // Opt-in guard: refuse to execute if user has not explicitly opted in
    if (!this.optIn) {
      this.stateMachine.transition(AgentState.FAILED);
      this.logAction('Health pilot requires explicit opt-in', 'failure', false);
      return;
    }

    const metrics = (task.params?.['metrics'] as HealthMetric[] | undefined) ?? [];
    const reminders = (task.params?.['reminders'] as HealthReminder[] | undefined) ?? [];

    // Use AI for trend analysis
    this.lastResult = await this.analyzeWithAI(metrics, reminders);

    // Run parent planning loop for tool execution
    await super.execute(task);
  }

  getHealthResult(): HealthResult | null {
    return this.lastResult;
  }

  private async analyzeWithAI(
    metrics: HealthMetric[],
    reminders: HealthReminder[],
  ): Promise<HealthResult> {
    if (metrics.length === 0) {
      return { metrics, reminders, trends: [] };
    }

    const metricData = metrics
      .map((m) => `${m.type}: ${m.value} ${m.unit} at ${m.timestamp}`)
      .join('\n');

    const prompt =
      `Analyze the following health metrics and identify trends.\n\nMetrics:\n${metricData}\n\n` +
      `Respond with JSON: { "trends": [{"metric": string, "trend": "up"|"down"|"stable"}] }`;

    const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

    try {
      const parsed = JSON.parse(result.content) as {
        trends: Array<{ metric: string; trend: 'up' | 'down' | 'stable' }>;
      };
      return {
        metrics,
        reminders,
        trends: parsed.trends ?? [],
      };
    } catch {
      return { metrics, reminders, trends: [] };
    }
  }

  private registerHealthTools(): void {
    const trackMetricTool: ToolDefinition = {
      name: 'health.track_metric',
      description: 'Record a health metric data point',
      parameters: [
        { name: 'type', type: 'string', description: 'Metric type (e.g. steps)', required: true },
        { name: 'value', type: 'number', description: 'Metric value', required: true },
        { name: 'unit', type: 'string', description: 'Unit of measurement', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'health',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { type: args['type'], value: args['value'], unit: args['unit'] },
          undoable: false,
        };
      },
    };

    const generateDigestTool: ToolDefinition = {
      name: 'health.generate_digest',
      description: 'Generate a weekly health data digest',
      parameters: [
        {
          name: 'period',
          type: 'string',
          description: 'Digest period (e.g. weekly)',
          required: true,
        },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'health',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { period: args['period'], digest: '' },
          undoable: false,
        };
      },
    };

    const trendAnalysisTool: ToolDefinition = {
      name: 'health.trend_analysis',
      description: 'Analyze trends in health metric data over time',
      parameters: [
        { name: 'metric', type: 'string', description: 'Metric type to analyze', required: true },
        {
          name: 'dataPoints',
          type: 'array',
          description: 'Data points for analysis',
          required: true,
        },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'health',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { metric: args['metric'], trend: 'stable' },
          undoable: false,
        };
      },
    };

    this.toolRegistry.registerTool(trackMetricTool);
    this.toolRegistry.registerTool(generateDigestTool);
    this.toolRegistry.registerTool(trendAnalysisTool);
  }
}
