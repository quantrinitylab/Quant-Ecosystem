import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface SocialPost {
  id: string;
  platform: string;
  content: string;
  scheduledTime?: number;
  hashtags: string[];
}

export interface SocialResult {
  drafted: SocialPost[];
  scheduled: SocialPost[];
  suggestions: string[];
}

export class SocialPilot extends IntelligentAgent {
  private lastResult: SocialResult | null = null;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'social-pilot',
      name: 'Social Pilot',
      icon: 'share-2',
      defaultPermission: PermissionLevel.SUGGEST,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.registerSocialTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('social');
  }

  protected getSystemPrompt(): string {
    return (
      'You are an intelligent social media assistant. Generate engaging content tailored to ' +
      'each platform, optimize posting schedules for maximum engagement, and analyze audience ' +
      'metrics. Use available tools: social.compose_post to draft posts, social.schedule_post ' +
      'to schedule optimal delivery, social.analyze_engagement to review performance.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    const action = (task.params?.['action'] as string) ?? 'draft';
    const posts = (task.params?.['posts'] as SocialPost[] | undefined) ?? [];
    const topic = (task.params?.['topic'] as string) ?? '';

    this.lastResult = { drafted: [], scheduled: [], suggestions: [] };

    if (action === 'draft') {
      if (topic) {
        const suggestions = await this.generateSuggestionsWithAI(topic);
        this.lastResult.suggestions = suggestions;
      }
      this.lastResult.drafted = posts;
    } else if (action === 'schedule') {
      const scheduled = await this.scheduleWithAI(posts);
      this.lastResult.scheduled = scheduled;
    }

    await super.execute(task);
  }

  getSocialResult(): SocialResult | null {
    return this.lastResult;
  }

  private async generateSuggestionsWithAI(topic: string): Promise<string[]> {
    const prompt =
      `Generate 3 social media content suggestions for the topic: "${topic}".\n\n` +
      `Respond with a JSON array of strings.`;

    const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

    try {
      const parsed = JSON.parse(result.content) as string[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [
        `Share insights about ${topic} with your audience`,
        `Create a thread discussing ${topic} trends`,
        `Post a question about ${topic} to boost engagement`,
      ];
    }
  }

  private async scheduleWithAI(posts: SocialPost[]): Promise<SocialPost[]> {
    if (posts.length === 0) return [];

    const prompt =
      `Determine optimal posting times for these posts:\n` +
      `${JSON.stringify(posts.map((p) => ({ id: p.id, platform: p.platform })))}\n\n` +
      `Respond with JSON array of objects: { id, scheduledTime (unix ms) }`;

    const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

    try {
      const parsed = JSON.parse(result.content) as Array<{
        id: string;
        scheduledTime: number;
      }>;
      const timeMap = new Map(parsed.map((p) => [p.id, p.scheduledTime]));
      return posts.map((post) => ({
        ...post,
        scheduledTime: timeMap.get(post.id) ?? post.scheduledTime ?? Date.now() + 86400000,
      }));
    } catch {
      return posts.map((post) => ({
        ...post,
        scheduledTime: post.scheduledTime ?? Date.now() + 86400000,
      }));
    }
  }

  private registerSocialTools(): void {
    const composePostTool: ToolDefinition = {
      name: 'social.compose_post',
      description: 'Compose a social media post with AI-generated content',
      parameters: [
        { name: 'platform', type: 'string', description: 'Target platform', required: true },
        { name: 'topic', type: 'string', description: 'Post topic', required: true },
        { name: 'tone', type: 'string', description: 'Desired tone', required: false },
      ],
      requiredTier: AgentActionTier.Tier1_DraftOnly,
      category: 'social',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { composed: args }, undoable: true };
      },
    };

    const schedulePostTool: ToolDefinition = {
      name: 'social.schedule_post',
      description: 'Schedule a post for optimal delivery time',
      parameters: [
        { name: 'postId', type: 'string', description: 'Post ID to schedule', required: true },
        {
          name: 'scheduledTime',
          type: 'number',
          description: 'Timestamp to post at',
          required: true,
        },
      ],
      requiredTier: AgentActionTier.Tier2_LowRisk,
      category: 'social',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { scheduled: args['postId'], time: args['scheduledTime'] },
          undoable: true,
        };
      },
    };

    const analyzeEngagementTool: ToolDefinition = {
      name: 'social.analyze_engagement',
      description: 'Analyze engagement metrics for posts',
      parameters: [
        { name: 'postId', type: 'string', description: 'Post ID to analyze', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'social',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { postId: args['postId'], engagement: 'analyzed' },
          undoable: false,
        };
      },
    };

    this.toolRegistry.registerTool(composePostTool);
    this.toolRegistry.registerTool(schedulePostTool);
    this.toolRegistry.registerTool(analyzeEngagementTool);
  }
}
