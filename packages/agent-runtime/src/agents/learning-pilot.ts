import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface LearningResource {
  id: string;
  title: string;
  type: 'course' | 'article' | 'video' | 'book';
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedHours: number;
  completed: boolean;
}

export interface LearningPath {
  goal: string;
  resources: LearningResource[];
  totalHours: number;
  progress: number;
}

export interface LearningResult {
  recommendations: LearningResource[];
  path: LearningPath | null;
  nextStep: LearningResource | null;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Rule-based learning recommendations
 * Production path: Integrate LLM + education APIs
 */
export class LearningPilot extends IntelligentAgent {
  private lastResult: LearningResult | null = null;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'learning-pilot',
      name: 'Learning Pilot',
      icon: 'book-open',
      defaultPermission: PermissionLevel.SUGGEST,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.registerLearningTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('learning');
  }

  protected getSystemPrompt(): string {
    return (
      'You are an intelligent learning assistant. Create personalized learning paths, ' +
      'recommend resources based on skill level, and generate quizzes to test understanding. ' +
      'Use available tools: learning.find_resources to discover content, ' +
      'learning.create_path to build structured paths, learning.quiz to generate assessments.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    const goal = (task.params?.['goal'] as string) ?? '';
    const resources = (task.params?.['resources'] as LearningResource[] | undefined) ?? [];
    const currentLevel = (task.params?.['level'] as string) ?? 'beginner';

    this.lastResult = await this.recommendWithAI(goal, resources, currentLevel);

    await super.execute(task);
  }

  getLearningResult(): LearningResult | null {
    return this.lastResult;
  }

  private async recommendWithAI(
    goal: string,
    resources: LearningResource[],
    currentLevel: string,
  ): Promise<LearningResult> {
    const filtered = this.filterByLevel(resources, currentLevel);
    const sorted = this.prioritizeResources(filtered);

    // Use AI to enhance recommendations
    if (sorted.length > 0) {
      const prompt =
        `Given learning goal "${goal}" at ${currentLevel} level, prioritize these resources:\n` +
        `${JSON.stringify(sorted.map((r) => ({ id: r.id, title: r.title, difficulty: r.difficulty, type: r.type })))}\n\n` +
        `Respond with JSON: { "orderedIds": ["id1", "id2", ...], "reasoning": "..." }`;

      const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

      try {
        const parsed = JSON.parse(result.content) as { orderedIds?: string[] };
        if (parsed.orderedIds && parsed.orderedIds.length > 0) {
          const idOrder = new Map(parsed.orderedIds.map((id, idx) => [id, idx]));
          sorted.sort((a, b) => {
            const aIdx = idOrder.get(a.id) ?? sorted.length;
            const bIdx = idOrder.get(b.id) ?? sorted.length;
            return aIdx - bIdx;
          });
        }
      } catch {
        // Keep default ordering
      }
    }

    const completed = resources.filter((r) => r.completed);
    const totalHours = sorted.reduce((sum, r) => sum + r.estimatedHours, 0);
    const completedHours = completed.reduce((sum, r) => sum + r.estimatedHours, 0);
    const progress = totalHours > 0 ? (completedHours / totalHours) * 100 : 0;

    const nextStep = sorted.find((r) => !r.completed) ?? null;

    return {
      recommendations: sorted.slice(0, 5),
      path: {
        goal,
        resources: sorted,
        totalHours,
        progress,
      },
      nextStep,
    };
  }

  private filterByLevel(resources: LearningResource[], level: string): LearningResource[] {
    const levels = ['beginner', 'intermediate', 'advanced'];
    const levelIdx = levels.indexOf(level);
    return resources.filter((r) => levels.indexOf(r.difficulty) <= levelIdx + 1);
  }

  private prioritizeResources(resources: LearningResource[]): LearningResource[] {
    const difficultyOrder = { beginner: 0, intermediate: 1, advanced: 2 };
    return [...resources].sort(
      (a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty],
    );
  }

  private registerLearningTools(): void {
    const findResourcesTool: ToolDefinition = {
      name: 'learning.find_resources',
      description: 'Find learning resources for a topic and skill level',
      parameters: [
        { name: 'topic', type: 'string', description: 'Learning topic', required: true },
        { name: 'level', type: 'string', description: 'Skill level', required: true },
        { name: 'type', type: 'string', description: 'Resource type filter', required: false },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'learning',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { resources: [], topic: args['topic'] }, undoable: false };
      },
    };

    const createPathTool: ToolDefinition = {
      name: 'learning.create_path',
      description: 'Create a structured learning path toward a goal',
      parameters: [
        { name: 'goal', type: 'string', description: 'Learning goal', required: true },
        { name: 'level', type: 'string', description: 'Current level', required: true },
        {
          name: 'hoursPerWeek',
          type: 'number',
          description: 'Available hours per week',
          required: false,
        },
      ],
      requiredTier: AgentActionTier.Tier1_DraftOnly,
      category: 'learning',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { path: args }, undoable: true };
      },
    };

    const quizTool: ToolDefinition = {
      name: 'learning.quiz',
      description: 'Generate a quiz to assess understanding',
      parameters: [
        { name: 'topic', type: 'string', description: 'Quiz topic', required: true },
        {
          name: 'numQuestions',
          type: 'number',
          description: 'Number of questions',
          required: false,
        },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'learning',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { quiz: { topic: args['topic'], questions: [] } },
          undoable: false,
        };
      },
    };

    this.toolRegistry.registerTool(findResourcesTool);
    this.toolRegistry.registerTool(createPathTool);
    this.toolRegistry.registerTool(quizTool);
  }
}
