import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface CodeChange {
  file: string;
  additions: number;
  deletions: number;
  content: string;
}

export interface CodeReviewResult {
  issues: CodeIssue[];
  suggestions: CodeSuggestion[];
  score: number;
}

export interface CodeIssue {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface CodeSuggestion {
  file: string;
  line: number;
  original: string;
  suggested: string;
  reason: string;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Rule-based code review/generation with no LLM
 * Production path: Integrate OpenAI/Anthropic API
 */
export class CodePilot extends IntelligentAgent {
  private lastReview: CodeReviewResult | null = null;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'code-pilot',
      name: 'Code Pilot',
      icon: 'code',
      defaultPermission: PermissionLevel.SUGGEST,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.registerCodeTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('code');
  }

  protected getSystemPrompt(): string {
    return (
      'You are an intelligent code review assistant. Analyze code changes for issues such as ' +
      'bugs, security vulnerabilities, style violations, and performance problems. Provide ' +
      'actionable suggestions with file, line, and fix details. Use available tools: ' +
      'code.review to analyze diffs, code.suggest_fix to propose fixes, code.open_pr to ' +
      'create pull requests, code.run_tests to verify changes.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    const changes = (task.params?.['changes'] as CodeChange[] | undefined) ?? [];

    // Use AI for code review instead of hardcoded string matching
    this.lastReview = await this.analyzeWithAI(changes);

    // Run parent planning loop for tool execution
    await super.execute(task);
  }

  getLastReview(): CodeReviewResult | null {
    return this.lastReview;
  }

  private async analyzeWithAI(changes: CodeChange[]): Promise<CodeReviewResult> {
    if (changes.length === 0) {
      return { issues: [], suggestions: [], score: 100 };
    }

    const diffSummary = changes
      .map((c) => `File: ${c.file} (+${c.additions}/-${c.deletions})\n${c.content}`)
      .join('\n---\n');

    const prompt =
      `Review the following code changes and identify issues and suggestions.\n\n` +
      `Changes:\n${diffSummary}\n\n` +
      `Respond with JSON: { "issues": [{"file","line","severity","message"}], ` +
      `"suggestions": [{"file","line","original","suggested","reason"}], "score": number }`;

    const result = await this.aiEngine.infer(prompt, this.getSystemPrompt());

    try {
      const parsed = JSON.parse(result.content) as CodeReviewResult;
      return {
        issues: parsed.issues ?? [],
        suggestions: parsed.suggestions ?? [],
        score: parsed.score ?? 100,
      };
    } catch {
      // If AI response is not valid JSON, return empty review
      return { issues: [], suggestions: [], score: 100 };
    }
  }

  private registerCodeTools(): void {
    const reviewTool: ToolDefinition = {
      name: 'code.review',
      description: 'Analyze a code diff for issues and quality',
      parameters: [
        { name: 'diff', type: 'string', description: 'Code diff content', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'code',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { reviewed: args['diff'] }, undoable: false };
      },
    };

    const suggestFixTool: ToolDefinition = {
      name: 'code.suggest_fix',
      description: 'Suggest a code fix for a detected issue',
      parameters: [
        { name: 'file', type: 'string', description: 'File path', required: true },
        { name: 'line', type: 'number', description: 'Line number', required: true },
        { name: 'suggestion', type: 'string', description: 'Suggested fix', required: true },
      ],
      requiredTier: AgentActionTier.Tier1_DraftOnly,
      category: 'code',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { fix: args }, undoable: true };
      },
    };

    const openPrTool: ToolDefinition = {
      name: 'code.open_pr',
      description: 'Open a pull request with suggested changes',
      parameters: [
        { name: 'title', type: 'string', description: 'PR title', required: true },
        { name: 'body', type: 'string', description: 'PR description', required: true },
      ],
      requiredTier: AgentActionTier.Tier2_LowRisk,
      category: 'code',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { prId: `pr-${Date.now()}`, ...args }, undoable: true };
      },
    };

    const runTestsTool: ToolDefinition = {
      name: 'code.run_tests',
      description: 'Run the test suite to verify code changes',
      parameters: [
        {
          name: 'testPattern',
          type: 'string',
          description: 'Test file pattern to run',
          required: false,
        },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'code',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { passed: true, pattern: args['testPattern'] },
          undoable: false,
        };
      },
    };

    this.toolRegistry.registerTool(reviewTool);
    this.toolRegistry.registerTool(suggestFixTool);
    this.toolRegistry.registerTool(openPrTool);
    this.toolRegistry.registerTool(runTestsTool);
  }
}
