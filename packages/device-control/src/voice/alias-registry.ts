import type { UserAlias } from './types.js';

const MAX_TRIGGER_LENGTH = 100;

export class AliasRegistry {
  private aliases = new Map<string, { alias: UserAlias; regex: RegExp }>();

  add(trigger: string, value: string, category?: string): void {
    if (trigger.length > MAX_TRIGGER_LENGTH) {
      throw new Error(`Alias trigger exceeds max length of ${MAX_TRIGGER_LENGTH} characters`);
    }
    const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    this.aliases.set(trigger.toLowerCase(), {
      alias: { trigger, value, category },
      regex,
    });
  }

  remove(trigger: string): boolean {
    return this.aliases.delete(trigger.toLowerCase());
  }

  resolve(text: string): string {
    let result = text;
    for (const { alias, regex } of this.aliases.values()) {
      regex.lastIndex = 0;
      result = result.replace(regex, alias.value);
    }
    return result;
  }

  getAll(): UserAlias[] {
    return [...this.aliases.values()].map((entry) => entry.alias);
  }

  clear(): void {
    this.aliases.clear();
  }
}
