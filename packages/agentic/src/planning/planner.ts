import { MemoryStore } from '../memory/memory-store.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { logger } from '@quant/common';

export interface PlanStep {
  id: string;
  action: string;
  tool?: string;
  parameters?: Record<string, any>;
  description: string;
  dependencies?: string[];
}

export interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  estimatedDuration?: number;
  confidence: number;
}

export interface LLMProvider {
  infer(request: {
    prompt: string;
    systemPrompt?: string;
    userId: string;
    app: string;
    feature: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ content: string }>;
}

export class Planner {
  private llmProvider: LLMProvider | null = null;

  constructor(
    _memory: MemoryStore,
    private tools: ToolRegistry,
  ) {}

  /**
   * Set or replace the LLM provider at runtime.
   */
  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
  }

  async createPlan(goal: string, context: any = {}): Promise<Plan> {
    // Try LLM-powered planning first
    if (this.llmProvider) {
      try {
        return await this.llmPlan(goal, context);
      } catch {
        // Fall through to keyword-based planning
      }
    }

    // Fallback: keyword-based planning
    return this.keywordPlan(goal, context);
  }

  /**
   * LLM-powered planning: sends goal + available tools to the AI engine
   * and expects structured JSON output describing the plan steps.
   */
  private async llmPlan(goal: string, _context: any): Promise<Plan> {
    const availableTools = this.tools.getAvailableTools();
    const toolList = availableTools.map((t) => `- ${t.name}: ${t.description}`).join('\n');

    const systemPrompt = `You are a task planner for the Quant Ecosystem. Given a user goal, decompose it into a sequence of tool-calling steps.

Available tools:
${toolList}

Respond ONLY with valid JSON in this format:
{
  "steps": [
    {
      "id": "step-1",
      "action": "short_action_name",
      "tool": "tool_name_from_list_above",
      "parameters": { "key": "value" },
      "description": "Human-readable description of this step"
    }
  ],
  "confidence": 0.9
}

If no specific tools match the goal, return a single step with action "general_response" and no tool.
Do not include any text outside the JSON object.`;

    const response = await this.llmProvider!.infer({
      prompt: `Goal: ${goal}`,
      systemPrompt,
      userId: 'planner',
      app: 'agentic',
      feature: 'planning',
      temperature: 0.3,
      maxTokens: 1000,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch (parseErr) {
      logger.warn(
        `[planner] LLM returned invalid JSON for plan, falling back to keyword planning: ${(parseErr as Error).message}`,
      );
      throw parseErr; // Re-throw to trigger keyword fallback in createPlan
    }

    // Validate the parsed shape: must be an object with a steps array
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>).steps)
    ) {
      logger.warn(
        '[planner] LLM returned JSON with unexpected shape (missing steps array), falling back to keyword planning',
      );
      throw new Error('Invalid plan schema: missing steps array');
    }

    const planData = parsed as { steps: unknown[]; confidence?: unknown };

    const steps: PlanStep[] = planData.steps
      .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .map((s, i) => ({
        id: typeof s.id === 'string' ? s.id : `step-${i + 1}`,
        action: typeof s.action === 'string' ? s.action : 'unknown',
        tool: typeof s.tool === 'string' ? s.tool : undefined,
        parameters:
          typeof s.parameters === 'object' && s.parameters !== null
            ? (s.parameters as Record<string, any>)
            : {},
        description: typeof s.description === 'string' ? s.description : '',
        dependencies: Array.isArray(s.dependencies) ? (s.dependencies as string[]) : undefined,
      }));

    return {
      id: `plan-${Date.now()}`,
      goal,
      steps:
        steps.length > 0
          ? steps
          : [
              {
                id: 'step-1',
                action: 'general_response',
                description: 'Process general request',
                parameters: { goal },
              },
            ],
      estimatedDuration: steps.length * 30,
      confidence: typeof planData.confidence === 'number' ? planData.confidence : 0.8,
    };
  }

  /**
   * Fallback keyword-based planning for when no LLM is available.
   */
  private keywordPlan(goal: string, context: any): Plan {
    const steps: PlanStep[] = [];
    const goalLower = goal.toLowerCase();

    if (goalLower.includes('email') || goalLower.includes('send')) {
      steps.push({
        id: 'step-1',
        action: 'compose_email',
        tool: 'quantmail_send',
        description: 'Compose and send email',
        parameters: { goal },
      });
    }

    if (goalLower.includes('chat') || goalLower.includes('message')) {
      steps.push({
        id: 'step-1',
        action: 'send_message',
        tool: 'quantchat_send',
        description: 'Send message via QuantChat',
        parameters: { goal },
      });
    }

    if (goalLower.includes('meet') || goalLower.includes('room') || goalLower.includes('video')) {
      steps.push({
        id: 'step-1',
        action: 'create_meeting',
        tool: 'quantmeet_create_room',
        description: 'Create a meeting room',
        parameters: { goal },
      });
    }

    if (goalLower.includes('file') || goalLower.includes('upload') || goalLower.includes('drive')) {
      steps.push({
        id: 'step-1',
        action: 'upload_file',
        tool: 'quantdrive_upload',
        description: 'Upload file to QuantDrive',
        parameters: { goal },
      });
    }

    if (
      goalLower.includes('post') ||
      goalLower.includes('social') ||
      goalLower.includes('trending')
    ) {
      steps.push({
        id: 'step-1',
        action: 'create_post',
        tool: 'quantsync_create_post',
        description: 'Create a social post',
        parameters: { goal },
      });
    }

    if (goalLower.includes('research') || goalLower.includes('find')) {
      steps.push({
        id: 'step-1',
        action: 'web_search',
        tool: 'web_search',
        description: 'Research information',
        parameters: { query: goal },
      });
    }

    // Default step if no specific tools matched
    if (steps.length === 0) {
      steps.push({
        id: 'step-1',
        action: 'general_response',
        description: 'Process general request',
        parameters: { goal, context },
      });
    }

    return {
      id: `plan-${Date.now()}`,
      goal,
      steps,
      estimatedDuration: steps.length * 30,
      confidence: 0.85,
    };
  }

  async refinePlan(plan: Plan, feedback: string): Promise<Plan> {
    if (this.llmProvider) {
      try {
        const response = await this.llmProvider.infer({
          prompt: `Original plan: ${JSON.stringify(plan)}\nFeedback: ${feedback}\nGenerate a refined plan as JSON.`,
          systemPrompt:
            'You are a task planner. Refine the plan based on the feedback. Respond ONLY with valid JSON in the same plan format.',
          userId: 'planner',
          app: 'agentic',
          feature: 'plan_refinement',
          temperature: 0.3,
          maxTokens: 1000,
        });

        let parsed: unknown;
        try {
          parsed = JSON.parse(response.content);
        } catch (parseErr) {
          logger.warn(
            `[planner] LLM returned invalid JSON for plan refinement, keeping original plan: ${(parseErr as Error).message}`,
          );
          return plan;
        }

        if (typeof parsed !== 'object' || parsed === null) {
          logger.warn('[planner] LLM returned non-object for plan refinement');
          return plan;
        }

        const planData = parsed as Record<string, unknown>;
        return {
          ...plan,
          steps: Array.isArray(planData.steps) ? planData.steps : plan.steps,
          confidence:
            typeof planData.confidence === 'number' ? planData.confidence : plan.confidence,
        };
      } catch {
        // Fall through
      }
    }
    return plan;
  }
}
