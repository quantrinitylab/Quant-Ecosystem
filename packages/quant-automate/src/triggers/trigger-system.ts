import type { Trigger } from '../types.js';
import { CronParser } from './cron-parser.js';

interface RegisteredTrigger {
  automationId: string;
  trigger: Trigger;
}

export class TriggerSystem {
  private triggers: RegisteredTrigger[] = [];
  private cronParser: CronParser = new CronParser();

  registerTrigger(automationId: string, trigger: Trigger): void {
    this.triggers.push({ automationId, trigger });
  }

  removeTrigger(automationId: string, triggerId: string): boolean {
    const index = this.triggers.findIndex(
      (t) => t.automationId === automationId && t.trigger.id === triggerId,
    );
    if (index === -1) return false;
    this.triggers.splice(index, 1);
    return true;
  }

  evaluateCron(cron: string, now?: Date): boolean {
    const date = now ?? new Date();
    return this.cronParser.matches(cron, date);
  }

  handleEvent(eventName: string, appId: string, _payload: unknown): string[] {
    const matched: string[] = [];

    for (const { automationId, trigger } of this.triggers) {
      if (!trigger.enabled) continue;
      if (trigger.config.type !== 'event') continue;

      const config = trigger.config;
      if (config.eventName === eventName && config.appId === appId) {
        matched.push(automationId);
      }
    }

    return matched;
  }

  handleWebhook(path: string, method: string): string[] {
    const matched: string[] = [];

    for (const { automationId, trigger } of this.triggers) {
      if (!trigger.enabled) continue;
      if (trigger.config.type !== 'webhook') continue;

      const config = trigger.config;
      if (config.path === path && config.method === method) {
        matched.push(automationId);
      }
    }

    return matched;
  }

  checkAICondition(condition: string, context: Record<string, unknown>): boolean {
    // Evaluate simple conditions against context
    // Supports patterns like "key > value", "key == value", "key contains value"
    const parts = condition.match(/^(\w+)\s*(==|!=|>|<|contains)\s*(.+)$/);
    if (!parts) return false;

    const [, key, operator, valueStr] = parts;
    if (!key || !operator || !valueStr) return false;

    const contextValue = context[key];
    if (contextValue === undefined) return false;

    const compareValue = parseFloat(valueStr) || valueStr.replace(/["']/g, '');

    switch (operator) {
      case '==':
        return String(contextValue) === String(compareValue);
      case '!=':
        return String(contextValue) !== String(compareValue);
      case '>':
        return Number(contextValue) > Number(compareValue);
      case '<':
        return Number(contextValue) < Number(compareValue);
      case 'contains':
        return String(contextValue).includes(String(compareValue));
      default:
        return false;
    }
  }

  getTriggersForAutomation(automationId: string): Trigger[] {
    return this.triggers.filter((t) => t.automationId === automationId).map((t) => t.trigger);
  }
}
