import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface ContentDraft {
  id: string;
  title: string;
  body: string;
  format: 'article' | 'blog' | 'newsletter' | 'social';
  wordCount: number;
  keywords: string[];
}

export interface ContentResult {
  drafts: ContentDraft[];
  outline: string[];
  estimatedReadTime: number;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Rule-based content generation
 * Production path: Integrate LLM API
 */
export class ContentPilot extends IntelligentAgent {
  private lastResult: ContentResult | null = null;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'content-pilot',
      name: 'Content Pilot',
      icon: 'file-text',
      defaultPermission: PermissionLevel.SUGGEST,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.registerContentTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('content');
  }

  protected getSystemPrompt(): string {
    return (
      'You are an intelligent content creation assistant. Generate high-quality written content ' +
      'including articles, blog posts, newsletters, and social media posts. Optimize content ' +
      'for SEO and readability. Use available tools: content.draft to create drafts, ' +
      'content.edit to refine content, content.seo_optimize to improve search rankings.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    const topic = (task.params?.['topic'] as string) ?? '';
    const format = (task.params?.['format'] as ContentDraft['format']) ?? 'article';
    const keywords = (task.params?.['keywords'] as string[] | undefined) ?? [];

    const { outline, body } = await this.generateContentWithAI(topic, format, keywords);
    const wordCount = body.split(/\s+/).length;

    const draft: ContentDraft = {
      id: `content-${Date.now()}`,
      title: `${topic.charAt(0).toUpperCase()}${topic.slice(1)}: A Comprehensive Guide`,
      body,
      format,
      wordCount,
      keywords,
    };

    this.lastResult = {
      drafts: [draft],
      outline,
      estimatedReadTime: Math.ceil(wordCount / 200),
    };

    await super.execute(task);
  }

  getContentResult(): ContentResult | null {
    return this.lastResult;
  }

  private async generateContentWithAI(
    topic: string,
    format: string,
    keywords: string[],
  ): Promise<{ outline: string[]; body: string }> {
    const prompt =
      `Create content about "${topic}" in ${format} format.\n` +
      `Keywords: ${keywords.join(', ') || 'none'}\n\n` +
      `Respond with JSON: { "outline": ["section1", ...], "body": "full content text" }`;

    const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

    try {
      const parsed = JSON.parse(result.content) as { outline: string[]; body: string };
      return {
        outline: parsed.outline ?? [],
        body: parsed.body ?? '',
      };
    } catch {
      // Fallback to basic generation
      const outline =
        format === 'social'
          ? [`Hook about ${topic}`, 'Key point', 'Call to action']
          : [
              `Introduction to ${topic}`,
              'Background and context',
              'Key insights',
              'Practical applications',
              'Conclusion and next steps',
            ];
      const body = outline
        .map(
          (section) =>
            `## ${section}\n\nThis section covers ${section.toLowerCase()} related to ${topic}.`,
        )
        .join('\n\n');
      return { outline, body };
    }
  }

  private registerContentTools(): void {
    const draftTool: ToolDefinition = {
      name: 'content.draft',
      description: 'Create a content draft using AI',
      parameters: [
        { name: 'topic', type: 'string', description: 'Content topic', required: true },
        { name: 'format', type: 'string', description: 'Content format', required: true },
        { name: 'keywords', type: 'array', description: 'SEO keywords', required: false },
      ],
      requiredTier: AgentActionTier.Tier1_DraftOnly,
      category: 'content',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { drafted: args }, undoable: true };
      },
    };

    const editTool: ToolDefinition = {
      name: 'content.edit',
      description: 'Edit and refine existing content',
      parameters: [
        { name: 'contentId', type: 'string', description: 'Content ID to edit', required: true },
        {
          name: 'instructions',
          type: 'string',
          description: 'Editing instructions',
          required: true,
        },
      ],
      requiredTier: AgentActionTier.Tier1_DraftOnly,
      category: 'content',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { edited: args['contentId'] }, undoable: true };
      },
    };

    const seoOptimizeTool: ToolDefinition = {
      name: 'content.seo_optimize',
      description: 'Optimize content for search engines',
      parameters: [
        {
          name: 'contentId',
          type: 'string',
          description: 'Content ID to optimize',
          required: true,
        },
        { name: 'targetKeywords', type: 'array', description: 'Target keywords', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'content',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { optimized: args['contentId'], keywords: args['targetKeywords'] },
          undoable: false,
        };
      },
    };

    this.toolRegistry.registerTool(draftTool);
    this.toolRegistry.registerTool(editTool);
    this.toolRegistry.registerTool(seoOptimizeTool);
  }
}
