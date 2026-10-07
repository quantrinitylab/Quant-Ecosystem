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

export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: number;
  recurring: boolean;
}

export interface FinanceInsight {
  totalSpending: number;
  categoryBreakdown: Record<string, number>;
  topCategory: string;
  averageDaily: number;
  recurringTotal: number;
}

export class FinancePilot extends IntelligentAgent {
  private lastInsight: FinanceInsight | null = null;
  private readonly optIn: boolean;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
    optIn: boolean;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'finance-pilot',
      name: 'Finance Pilot',
      icon: 'dollar-sign',
      defaultPermission: PermissionLevel.OBSERVE,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.optIn = deps.optIn;
    this.registerFinanceTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('finance');
  }

  protected getSystemPrompt(): string {
    return (
      'You are a financial data assistant. Categorize expenses, summarize spending patterns, ' +
      'and detect anomalies. You operate in READ-ONLY mode and NEVER execute trades, ' +
      'transfers, or any financial transactions. Only analyze and report on data.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    // Opt-in guard: refuse to execute if user has not explicitly opted in
    if (!this.optIn) {
      this.stateMachine.transition(AgentState.FAILED);
      this.logAction('Finance pilot requires explicit opt-in', 'failure', false);
      return;
    }

    const expenses = (task.params?.['expenses'] as Expense[] | undefined) ?? [];

    // Use AI for categorization and insight generation
    this.lastInsight = await this.analyzeWithAI(expenses);

    // Run parent planning loop for tool execution
    await super.execute(task);
  }

  getInsight(): FinanceInsight | null {
    return this.lastInsight;
  }

  private async analyzeWithAI(expenses: Expense[]): Promise<FinanceInsight> {
    if (expenses.length === 0) {
      return {
        totalSpending: 0,
        categoryBreakdown: {},
        topCategory: 'none',
        averageDaily: 0,
        recurringTotal: 0,
      };
    }

    const expenseData = expenses
      .map((e) => `${e.category}: $${e.amount} - ${e.description} (recurring: ${e.recurring})`)
      .join('\n');

    const prompt =
      `Analyze the following expenses and provide insights.\n\nExpenses:\n${expenseData}\n\n` +
      `Respond with JSON: { "totalSpending": number, "categoryBreakdown": {category: amount}, ` +
      `"topCategory": string, "averageDaily": number, "recurringTotal": number }`;

    const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

    try {
      const parsed = JSON.parse(result.content) as FinanceInsight;
      return {
        totalSpending: parsed.totalSpending ?? 0,
        categoryBreakdown: parsed.categoryBreakdown ?? {},
        topCategory: parsed.topCategory ?? 'none',
        averageDaily: parsed.averageDaily ?? 0,
        recurringTotal: parsed.recurringTotal ?? 0,
      };
    } catch {
      return {
        totalSpending: 0,
        categoryBreakdown: {},
        topCategory: 'none',
        averageDaily: 0,
        recurringTotal: 0,
      };
    }
  }

  private registerFinanceTools(): void {
    const categorizeTool: ToolDefinition = {
      name: 'finance.categorize',
      description: 'Categorize an expense into a spending category',
      parameters: [
        {
          name: 'description',
          type: 'string',
          description: 'Expense description',
          required: true,
        },
        { name: 'amount', type: 'number', description: 'Expense amount', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'finance',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { category: 'uncategorized', description: args['description'] },
          undoable: false,
        };
      },
    };

    const summarizeSpendingTool: ToolDefinition = {
      name: 'finance.summarize_spending',
      description: 'Generate a spending summary for a time period',
      parameters: [
        {
          name: 'period',
          type: 'string',
          description: 'Time period (e.g. weekly)',
          required: true,
        },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'finance',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { period: args['period'], summary: '' },
          undoable: false,
        };
      },
    };

    const detectAnomalyTool: ToolDefinition = {
      name: 'finance.detect_anomaly',
      description: 'Detect unusual spending patterns or anomalies',
      parameters: [
        {
          name: 'expenses',
          type: 'array',
          description: 'List of expenses to analyze',
          required: true,
        },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'finance',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { anomalies: [], expenses: args['expenses'] },
          undoable: false,
        };
      },
    };

    this.toolRegistry.registerTool(categorizeTool);
    this.toolRegistry.registerTool(summarizeSpendingTool);
    this.toolRegistry.registerTool(detectAnomalyTool);
  }
}
