import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface EmailItem {
  id: string;
  from: string;
  subject: string;
  body: string;
  isSpam: boolean;
  isRead: boolean;
  timestamp: number;
}

export interface EmailProcessingResult {
  archived: string[];
  drafts: Array<{ inReplyTo: string; body: string }>;
  flagged: string[];
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Rule-based email drafting
 * Production path: Integrate LLM API
 */
export class EmailPilot extends IntelligentAgent {
  private processedEmails: EmailProcessingResult = { archived: [], drafts: [], flagged: [] };

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'email-pilot',
      name: 'Email Pilot',
      icon: 'mail',
      defaultPermission: PermissionLevel.ACT_LOW,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.registerEmailTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('email');
  }

  protected getSystemPrompt(): string {
    return (
      'You are an intelligent email assistant. Triage emails by classifying them as spam, ' +
      'needs_reply, informational, or urgent. For emails needing a reply, draft a response ' +
      'that matches the user writing style. Use available tools: email.archive to archive spam, ' +
      'email.draft_reply to compose replies, email.flag for important items, ' +
      'email.schedule_send for delayed delivery.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    const emails = (task.params?.['emails'] as EmailItem[] | undefined) ?? [];
    this.processedEmails = { archived: [], drafts: [], flagged: [] };

    // Process each email using AI classification
    for (const email of emails) {
      const classification = await this.aiEngine.classify(
        `From: ${email.from}\nSubject: ${email.subject}\nBody: ${email.body}`,
        ['spam', 'needs_reply', 'informational', 'urgent'],
      );

      if (classification.category === 'spam' || email.isSpam) {
        this.processedEmails.archived.push(email.id);
      } else if (classification.category === 'needs_reply') {
        const replyResult = await this.aiEngine.infer(
          `Draft a reply to the following email.\nFrom: ${email.from}\nSubject: ${email.subject}\nBody: ${email.body}`,
          this.getSystemPrompt(),
        );
        this.processedEmails.drafts.push({ inReplyTo: email.id, body: replyResult.content });
      } else if (classification.category === 'urgent') {
        this.processedEmails.flagged.push(email.id);
      } else {
        // informational
        this.processedEmails.flagged.push(email.id);
      }
    }

    // Run parent planning loop for tool execution
    await super.execute(task);
  }

  getProcessingResult(): EmailProcessingResult {
    return { ...this.processedEmails };
  }

  private registerEmailTools(): void {
    const archiveTool: ToolDefinition = {
      name: 'email.archive',
      description: 'Archive an email message',
      parameters: [
        { name: 'emailId', type: 'string', description: 'ID of email to archive', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'email',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { archived: args['emailId'] }, undoable: true };
      },
    };

    const draftReplyTool: ToolDefinition = {
      name: 'email.draft_reply',
      description: 'Draft a reply to an email',
      parameters: [
        {
          name: 'emailId',
          type: 'string',
          description: 'ID of email to reply to',
          required: true,
        },
        { name: 'body', type: 'string', description: 'Reply body content', required: true },
      ],
      requiredTier: AgentActionTier.Tier1_DraftOnly,
      category: 'email',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { inReplyTo: args['emailId'], body: args['body'] },
          undoable: true,
        };
      },
    };

    const flagTool: ToolDefinition = {
      name: 'email.flag',
      description: 'Flag an email for follow-up',
      parameters: [
        { name: 'emailId', type: 'string', description: 'ID of email to flag', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'email',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return { success: true, data: { flagged: args['emailId'] }, undoable: true };
      },
    };

    const scheduleSendTool: ToolDefinition = {
      name: 'email.schedule_send',
      description: 'Schedule an email to be sent at a later time',
      parameters: [
        { name: 'emailId', type: 'string', description: 'ID of email to send', required: true },
        {
          name: 'sendAt',
          type: 'number',
          description: 'Timestamp to send at',
          required: true,
        },
      ],
      requiredTier: AgentActionTier.Tier2_LowRisk,
      category: 'email',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { scheduled: args['emailId'], sendAt: args['sendAt'] },
          undoable: true,
        };
      },
    };

    this.toolRegistry.registerTool(archiveTool);
    this.toolRegistry.registerTool(draftReplyTool);
    this.toolRegistry.registerTool(flagTool);
    this.toolRegistry.registerTool(scheduleSendTool);
  }
}
