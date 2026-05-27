// ============================================================================
// Command Palette - Types
// ============================================================================

export type CommandCategory =
  | 'schedule'
  | 'send'
  | 'share'
  | 'summarize'
  | 'find'
  | 'create'
  | 'review'
  | 'navigate';

export interface Command {
  id: string;
  name: string;
  description: string;
  category: CommandCategory;
  app: string;
  keywords: string[];
  handler: (context: CommandContext, args: Record<string, unknown>) => Promise<CommandResult>;
  permissions?: string[];
}

export interface CommandResult {
  success: boolean;
  data?: unknown;
  message: string;
  executedAt: number;
}

export interface CommandContext {
  userId: string;
  currentApp: string;
  selectedResource?: string;
  permissions: string[];
}

export interface MatchedCommand {
  command: Command;
  score: number;
}

export interface ExecutionLog {
  commandId: string;
  userId: string;
  executedAt: number;
  success: boolean;
  message: string;
}
