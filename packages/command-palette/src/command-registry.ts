// ============================================================================
// Command Registry - Registers and manages commands
// ============================================================================

import type { Command, CommandCategory } from './types';

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  unregister(commandId: string): boolean {
    return this.commands.delete(commandId);
  }

  findById(commandId: string): Command | undefined {
    return this.commands.get(commandId);
  }

  listByCategory(category: CommandCategory): Command[] {
    return Array.from(this.commands.values()).filter((cmd) => cmd.category === category);
  }

  listByApp(app: string): Command[] {
    return Array.from(this.commands.values()).filter((cmd) => cmd.app === app);
  }

  listAll(): Command[] {
    return Array.from(this.commands.values());
  }

  getCount(): number {
    return this.commands.size;
  }
}
