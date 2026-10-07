// ============================================================================
// Command Registry - Registers and manages commands
// ============================================================================

import type { Command, CommandCategory } from './types';

export interface CommandRegistryOptions {
  maxEntries?: number;
}

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private readonly maxEntries: number;
  private insertionOrder: string[] = [];

  constructor(options?: CommandRegistryOptions) {
    this.maxEntries = options?.maxEntries ?? 10000;
  }

  register(command: Command): void {
    if (!this.commands.has(command.id)) {
      this.insertionOrder.push(command.id);
    }
    this.commands.set(command.id, command);
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    while (this.commands.size > this.maxEntries && this.insertionOrder.length > 0) {
      const oldest = this.insertionOrder.shift();
      if (oldest != null) {
        this.commands.delete(oldest);
      }
    }
  }

  unregister(commandId: string): boolean {
    const deleted = this.commands.delete(commandId);
    if (deleted) {
      const idx = this.insertionOrder.indexOf(commandId);
      if (idx >= 0) {
        this.insertionOrder.splice(idx, 1);
      }
    }
    return deleted;
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
