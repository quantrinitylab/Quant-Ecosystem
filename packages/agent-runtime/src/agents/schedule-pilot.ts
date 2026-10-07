import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import type { TypedToolRegistry } from '../typed-tool-registry.js';
import type { SpendingLimit } from '../spending-limit.js';
import type { AgentTask } from '../worker-agent.js';
import { PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  attendees: string[];
  location?: string;
}

export interface ScheduleResult {
  created: CalendarEvent[];
  updated: CalendarEvent[];
  conflicts: Array<{ event1: string; event2: string; reason: string }>;
}

export class SchedulePilot extends IntelligentAgent {
  private calendar: CalendarEvent[] = [];
  private lastResult: ScheduleResult | null = null;

  constructor(deps: {
    aiEngine: AIEnginePort;
    toolRegistry: TypedToolRegistry;
    spendingLimit: SpendingLimit;
  }) {
    const config: IntelligentAgentConfig = {
      id: 'schedule-pilot',
      name: 'Schedule Pilot',
      icon: 'calendar',
      defaultPermission: PermissionLevel.ACT_LOW,
      aiEngine: deps.aiEngine,
      toolRegistry: deps.toolRegistry,
      spendingLimit: deps.spendingLimit,
    };
    super(config);
    this.registerScheduleTools();
  }

  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getToolsByCategory('schedule');
  }

  protected getSystemPrompt(): string {
    return (
      'You are an intelligent scheduling assistant. Manage calendar events, find optimal ' +
      'meeting times, detect conflicts, and suggest rescheduling options. Use available tools: ' +
      'schedule.find_slot to find available time slots, schedule.book to create events, ' +
      'schedule.reschedule to move events, schedule.conflict_check to detect overlaps.'
    );
  }

  override async execute(task: AgentTask): Promise<void> {
    const action = (task.params?.['action'] as string) ?? 'organize';
    const events = (task.params?.['events'] as CalendarEvent[] | undefined) ?? [];

    this.lastResult = { created: [], updated: [], conflicts: [] };

    if (action === 'add') {
      await this.addEventsWithAI(events);
    } else if (action === 'organize') {
      await this.organizeWithAI();
    }

    await super.execute(task);
  }

  getScheduleResult(): ScheduleResult | null {
    return this.lastResult;
  }

  getCalendar(): CalendarEvent[] {
    return [...this.calendar];
  }

  private async addEventsWithAI(events: CalendarEvent[]): Promise<void> {
    for (const event of events) {
      const conflicts = this.findConflicts(event);
      if (conflicts.length > 0) {
        // Use AI to suggest resolution
        const prompt =
          `Event "${event.title}" (${event.start}-${event.end}) conflicts with: ` +
          `${conflicts.map((c) => `"${c.title}" (${c.start}-${c.end})`).join(', ')}.\n` +
          `Respond with JSON: { "action": "skip" | "reschedule", "reason": "..." }`;

        await this.aiEngine.infer(prompt, this.getSystemPrompt());

        for (const conflict of conflicts) {
          this.lastResult!.conflicts.push({
            event1: event.id,
            event2: conflict.id,
            reason: 'Time overlap',
          });
        }
      } else {
        this.calendar.push(event);
        this.lastResult!.created.push(event);
      }
    }
  }

  private async organizeWithAI(): Promise<void> {
    const conflicts: Array<{ event1: string; event2: string; reason: string }> = [];

    for (let i = 0; i < this.calendar.length; i++) {
      for (let j = i + 1; j < this.calendar.length; j++) {
        const a = this.calendar[i]!;
        const b = this.calendar[j]!;
        if (this.isOverlapping(a, b)) {
          conflicts.push({
            event1: a.id,
            event2: b.id,
            reason: 'Time overlap detected',
          });
        }
      }
    }

    if (conflicts.length > 0) {
      // Use AI to analyze and suggest resolutions
      const prompt =
        `Analyze these calendar conflicts and suggest resolutions:\n` +
        `${JSON.stringify(conflicts)}\n\n` +
        `Respond with JSON: { "suggestions": ["..."] }`;

      await this.aiEngine.infer(prompt, this.getSystemPrompt());
    }

    this.lastResult!.conflicts = conflicts;
  }

  private findConflicts(event: CalendarEvent): CalendarEvent[] {
    return this.calendar.filter((existing) => this.isOverlapping(existing, event));
  }

  private isOverlapping(a: CalendarEvent, b: CalendarEvent): boolean {
    return a.start < b.end && b.start < a.end;
  }

  private registerScheduleTools(): void {
    const findSlotTool: ToolDefinition = {
      name: 'schedule.find_slot',
      description: 'Find an available time slot for a meeting',
      parameters: [
        { name: 'duration', type: 'number', description: 'Duration in minutes', required: true },
        { name: 'attendees', type: 'array', description: 'List of attendees', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'schedule',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { slot: { start: Date.now(), duration: args['duration'] } },
          undoable: false,
        };
      },
    };

    const bookTool: ToolDefinition = {
      name: 'schedule.book',
      description: 'Book a calendar event',
      parameters: [
        { name: 'title', type: 'string', description: 'Event title', required: true },
        { name: 'start', type: 'number', description: 'Start timestamp', required: true },
        { name: 'end', type: 'number', description: 'End timestamp', required: true },
        { name: 'attendees', type: 'array', description: 'Attendees', required: false },
      ],
      requiredTier: AgentActionTier.Tier2_LowRisk,
      category: 'schedule',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { booked: args['title'], start: args['start'], end: args['end'] },
          undoable: true,
        };
      },
    };

    const rescheduleTool: ToolDefinition = {
      name: 'schedule.reschedule',
      description: 'Reschedule an existing event',
      parameters: [
        { name: 'eventId', type: 'string', description: 'Event ID to reschedule', required: true },
        { name: 'newStart', type: 'number', description: 'New start timestamp', required: true },
        { name: 'newEnd', type: 'number', description: 'New end timestamp', required: true },
      ],
      requiredTier: AgentActionTier.Tier2_LowRisk,
      category: 'schedule',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { rescheduled: args['eventId'], newStart: args['newStart'] },
          undoable: true,
        };
      },
    };

    const conflictCheckTool: ToolDefinition = {
      name: 'schedule.conflict_check',
      description: 'Check for scheduling conflicts',
      parameters: [
        { name: 'start', type: 'number', description: 'Start timestamp', required: true },
        { name: 'end', type: 'number', description: 'End timestamp', required: true },
      ],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'schedule',
      handler: async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
        return {
          success: true,
          data: { conflicts: [], start: args['start'], end: args['end'] },
          undoable: false,
        };
      },
    };

    this.toolRegistry.registerTool(findSlotTool);
    this.toolRegistry.registerTool(bookTool);
    this.toolRegistry.registerTool(rescheduleTool);
    this.toolRegistry.registerTool(conflictCheckTool);
  }
}
