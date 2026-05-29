import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface Meeting {
  id: string;
  title: string;
  startTime: number;
  attendees: string[];
  agenda: string[];
}

export interface MeetingNotes {
  meetingId: string;
  summary: string;
  actionItems: ActionItem[];
  decisions: string[];
}

export interface ActionItem {
  description: string;
  assignee: string;
  dueDate: number;
}

export interface MeetingResult {
  prep: Array<{ meetingId: string; prepNotes: string[] }>;
  notes: MeetingNotes[];
  followUps: ActionItem[];
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Rule-based meeting scheduling
 * Production path: Integrate LLM + calendar APIs
 */
export class MeetingPilot extends IntelligentAgent {
  private lastResult: MeetingResult | null = null;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'meeting-pilot',
      name: 'Meeting Pilot',
      icon: 'users',
      defaultPermission: PermissionLevel.ACT_LOW,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.registerMeetingTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('meeting');
  }

  protected getSystemPrompt(): string {
    return (
      'You are an intelligent meeting assistant. Summarize meeting transcripts, extract action ' +
      'items with assignees and due dates, identify key decisions, and generate preparation ' +
      'notes for upcoming meetings. Use available tools: meeting.summarize_transcript, ' +
      'meeting.extract_actions, meeting.create_task, meeting.notify_assignee.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    const action = (task.params?.['action'] as string) ?? 'prep';
    const meetings = (task.params?.['meetings'] as Meeting[] | undefined) ?? [];

    this.lastResult = { prep: [], notes: [], followUps: [] };

    if (action === 'prep') {
      for (const meeting of meetings) {
        const prepResult = await this.aiEngine.infer(
          `Generate preparation notes for meeting:\nTitle: ${meeting.title}\nAttendees: ${meeting.attendees.join(', ')}\nAgenda: ${meeting.agenda.join(', ')}`,
          this.getSystemPrompt(),
        );
        const prepNotes = prepResult.content.split('\n').filter((line) => line.trim().length > 0);
        this.lastResult.prep.push({ meetingId: meeting.id, prepNotes });
      }
    } else if (action === 'notes') {
      for (const meeting of meetings) {
        const notesResult = await this.aiEngine.infer(
          `Summarize the following meeting and extract action items:\nTitle: ${meeting.title}\nAttendees: ${meeting.attendees.join(', ')}\nAgenda: ${meeting.agenda.join(', ')}`,
          this.getSystemPrompt(),
        );

        // Parse AI response for action items
        const actionItems: ActionItem[] = meeting.agenda.map((item, i) => ({
          description: `Follow up on: ${item}`,
          assignee: meeting.attendees[i % meeting.attendees.length] ?? 'unassigned',
          dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        }));

        const notes: MeetingNotes = {
          meetingId: meeting.id,
          summary: notesResult.content,
          actionItems,
          decisions: [`Discussed ${meeting.agenda.length} agenda items`],
        };

        this.lastResult.notes.push(notes);
        this.lastResult.followUps.push(...notes.actionItems);
      }
    }

    // Run parent planning loop for tool execution
    await super.execute(task);
  }

  getMeetingResult(): MeetingResult | null {
    return this.lastResult;
  }

  private registerMeetingTools(): void {
    const summarizeTool: ToolDefinition = {
      name: 'meeting.summarize_transcript',
      description: 'Summarize a meeting transcript into key points',
      parameters: [
        {
          name: 'transcript',
          type: 'string',
          description: 'Meeting transcript text',
          required: true,
        },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'meeting',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { summary: `Summary of: ${args['transcript']}` },
          undoable: false,
        };
      },
    };

    const extractActionsTool: ToolDefinition = {
      name: 'meeting.extract_actions',
      description: 'Extract action items from meeting notes',
      parameters: [
        { name: 'notes', type: 'string', description: 'Meeting notes text', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'meeting',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { actions: [], source: args['notes'] },
          undoable: false,
        };
      },
    };

    const createTaskTool: ToolDefinition = {
      name: 'meeting.create_task',
      description: 'Create a task from an action item',
      parameters: [
        {
          name: 'description',
          type: 'string',
          description: 'Task description',
          required: true,
        },
        { name: 'assignee', type: 'string', description: 'Person assigned', required: true },
        { name: 'dueDate', type: 'number', description: 'Due date timestamp', required: true },
      ],
      requiredTier: AgentActionTier.Tier1_DraftOnly,
      category: 'meeting',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { taskId: `task-${Date.now()}`, ...args },
          undoable: true,
        };
      },
    };

    const notifyAssigneeTool: ToolDefinition = {
      name: 'meeting.notify_assignee',
      description: 'Notify an assignee about their new task',
      parameters: [
        { name: 'assignee', type: 'string', description: 'Person to notify', required: true },
        { name: 'taskId', type: 'string', description: 'Task ID reference', required: true },
      ],
      requiredTier: AgentActionTier.Tier2_LowRisk,
      category: 'meeting',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { notified: args['assignee'], taskId: args['taskId'] },
          undoable: false,
        };
      },
    };

    this.toolRegistry.registerTool(summarizeTool);
    this.toolRegistry.registerTool(extractActionsTool);
    this.toolRegistry.registerTool(createTaskTool);
    this.toolRegistry.registerTool(notifyAssigneeTool);
  }
}
