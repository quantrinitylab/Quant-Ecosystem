// ============================================================================
// Command Executor - Executes commands with permission checks
// ============================================================================

import type { Command, CommandContext, CommandResult, ExecutionLog } from './types';
import { CommandRegistry } from './command-registry';

export class CommandExecutor {
  private registry: CommandRegistry;
  private logs: ExecutionLog[] = [];

  constructor(registry: CommandRegistry) {
    this.registry = registry;
  }

  async execute(
    commandId: string,
    context: CommandContext,
    args: Record<string, unknown> = {},
  ): Promise<CommandResult> {
    const command = this.registry.findById(commandId);

    if (!command) {
      const result: CommandResult = {
        success: false,
        message: `Command not found: ${commandId}`,
        executedAt: Date.now(),
      };
      return result;
    }

    // Check permissions
    if (!this.hasPermission(command, context)) {
      const result: CommandResult = {
        success: false,
        message: `Permission denied: missing required permissions for ${command.name}`,
        executedAt: Date.now(),
      };
      this.logExecution(command.id, context.userId, result);
      return result;
    }

    try {
      const result = await command.handler(context, args);
      this.logExecution(command.id, context.userId, result);
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const result: CommandResult = {
        success: false,
        message: `Execution failed: ${message}`,
        executedAt: Date.now(),
      };
      this.logExecution(command.id, context.userId, result);
      return result;
    }
  }

  getExecutionLogs(): ExecutionLog[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  private hasPermission(command: Command, context: CommandContext): boolean {
    if (!command.permissions || command.permissions.length === 0) {
      return true;
    }
    return command.permissions.every((perm) => context.permissions.includes(perm));
  }

  private logExecution(commandId: string, userId: string, result: CommandResult): void {
    this.logs.push({
      commandId,
      userId,
      executedAt: result.executedAt,
      success: result.success,
      message: result.message,
    });
  }
}
