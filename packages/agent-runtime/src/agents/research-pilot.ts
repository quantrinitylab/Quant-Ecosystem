import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  relevance: number;
}

export interface ResearchResult {
  query: string;
  summary: string;
  sources: ResearchSource[];
  keyFindings: string[];
}

export class ResearchPilot extends IntelligentAgent {
  private lastResult: ResearchResult | null = null;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'research-pilot',
      name: 'Research Pilot',
      icon: 'search',
      defaultPermission: PermissionLevel.ACT_LOW,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.registerResearchTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('research');
  }

  protected getSystemPrompt(): string {
    return (
      'You are an intelligent research assistant. Fetch and analyze web sources, summarize ' +
      'findings with proper citations, and extract key insights. Use available tools: ' +
      'research.web_fetch to retrieve sources, research.summarize to generate summaries, ' +
      'research.extract_citations to pull citations, research.export_to_docs to save results.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    const query = (task.params?.['query'] as string) ?? '';
    const sources = (task.params?.['sources'] as ResearchSource[] | undefined) ?? [];

    // Use AI for summarization and finding extraction
    this.lastResult = await this.researchWithAI(query, sources);

    // Run parent planning loop for tool execution
    await super.execute(task);
  }

  getResearchResult(): ResearchResult | null {
    return this.lastResult;
  }

  private async researchWithAI(query: string, sources: ResearchSource[]): Promise<ResearchResult> {
    const rankedSources = [...sources].sort((a, b) => b.relevance - a.relevance);

    if (rankedSources.length === 0) {
      return { query, summary: `No sources found for "${query}".`, sources: [], keyFindings: [] };
    }

    const sourceText = rankedSources
      .map(
        (s) => `Title: ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet}\nRelevance: ${s.relevance}`,
      )
      .join('\n---\n');

    const summaryPrompt =
      `Summarize the research findings for the query: "${query}"\n\nSources:\n${sourceText}\n\n` +
      `Respond with JSON: { "summary": "...", "keyFindings": ["..."] }`;

    const result = await this.aiEngine.infer(summaryPrompt, this.getSystemPrompt());

    try {
      const parsed = JSON.parse(result.content) as { summary: string; keyFindings: string[] };
      return {
        query,
        summary: parsed.summary ?? '',
        sources: rankedSources,
        keyFindings: parsed.keyFindings ?? [],
      };
    } catch {
      return {
        query,
        summary: result.content,
        sources: rankedSources,
        keyFindings: [],
      };
    }
  }

  private registerResearchTools(): void {
    const webFetchTool: ToolDefinition = {
      name: 'research.web_fetch',
      description: 'Fetch content from a web URL for research',
      parameters: [{ name: 'url', type: 'string', description: 'URL to fetch', required: true }],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'research',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { url: args['url'], content: '' }, undoable: false };
      },
    };

    const summarizeTool: ToolDefinition = {
      name: 'research.summarize',
      description: 'Generate a summary of research findings',
      parameters: [
        { name: 'content', type: 'string', description: 'Content to summarize', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'research',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { summary: args['content'] }, undoable: false };
      },
    };

    const extractCitationsTool: ToolDefinition = {
      name: 'research.extract_citations',
      description: 'Extract citations from research content',
      parameters: [
        { name: 'content', type: 'string', description: 'Content to extract from', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'research',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { citations: [], source: args['content'] }, undoable: false };
      },
    };

    const exportToDocsTool: ToolDefinition = {
      name: 'research.export_to_docs',
      description: 'Export research results to a document',
      parameters: [
        { name: 'title', type: 'string', description: 'Document title', required: true },
        { name: 'content', type: 'string', description: 'Document content', required: true },
      ],
      requiredTier: AgentActionTier.Tier1_DraftOnly,
      category: 'research',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { docId: `doc-${Date.now()}`, title: args['title'] },
          undoable: true,
        };
      },
    };

    this.toolRegistry.registerTool(webFetchTool);
    this.toolRegistry.registerTool(summarizeTool);
    this.toolRegistry.registerTool(extractCitationsTool);
    this.toolRegistry.registerTool(exportToDocsTool);
  }
}
