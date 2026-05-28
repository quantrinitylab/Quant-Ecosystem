import type { AutomationTrigger, TriggerContext } from './types.js';

/**
 * Parses a cron field against a value.
 * Supports: *, specific numbers, ranges (1-5), step values (star/N), comma-separated lists.
 */
function matchCronField(field: string, value: number, max: number): boolean {
  if (field === '*') return true;

  const parts = field.split(',');
  for (const part of parts) {
    // Step values: */5 means every 5th
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr ?? '1', 10);
      if (isNaN(step) || step <= 0) return false;
      if (range === '*') {
        if (value % step === 0) return true;
      } else {
        const start = parseInt(range ?? '0', 10);
        if (!isNaN(start) && value >= start && (value - start) % step === 0) return true;
      }
      continue;
    }

    // Range: 1-5
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr ?? '0', 10);
      const end = parseInt(endStr ?? String(max), 10);
      if (!isNaN(start) && !isNaN(end) && value >= start && value <= end) return true;
      continue;
    }

    // Exact value
    const exact = parseInt(part, 10);
    if (!isNaN(exact) && exact === value) return true;
  }

  return false;
}

/**
 * Validates a cron expression has the correct format (5 fields).
 */
function isValidCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  return fields.length === 5;
}

/**
 * Checks if a cron expression matches a given date.
 * Fields: minute hour dayOfMonth month dayOfWeek
 */
function matchesCron(expression: string, date: Date): boolean {
  if (!isValidCron(expression)) return false;

  const fields = expression.trim().split(/\s+/);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];

  const checks = [
    matchCronField(minute, date.getMinutes(), 59),
    matchCronField(hour, date.getHours(), 23),
    matchCronField(dayOfMonth, date.getDate(), 31),
    matchCronField(month, date.getMonth() + 1, 12),
    matchCronField(dayOfWeek, date.getDay(), 7),
  ];

  return checks.every(Boolean);
}

export class TriggerEvaluator {
  shouldFire(trigger: AutomationTrigger, context: TriggerContext): boolean {
    switch (trigger.type) {
      case 'schedule':
        return this.evaluateSchedule(trigger.cron.expression, context.currentTime);
      case 'event':
        return this.evaluateEvent(trigger, context);
      case 'webhook':
        return this.evaluateWebhook(trigger, context);
      case 'manual':
        return true;
      case 'ai_condition':
        return this.evaluateAiCondition(context);
    }
  }

  private evaluateSchedule(expression: string, currentTime: number): boolean {
    if (!isValidCron(expression)) return false;
    const date = new Date(currentTime);
    return matchesCron(expression, date);
  }

  private evaluateEvent(
    trigger: { eventName: string; filters?: Record<string, unknown> },
    context: TriggerContext,
  ): boolean {
    if (!context.event) return false;
    if (context.event.name !== trigger.eventName) return false;

    if (trigger.filters) {
      for (const [key, value] of Object.entries(trigger.filters)) {
        if (context.event.payload[key] !== value) return false;
      }
    }

    return true;
  }

  private evaluateWebhook(
    trigger: { path: string; method?: string },
    context: TriggerContext,
  ): boolean {
    if (!context.webhook) return false;
    if (context.webhook.path !== trigger.path) return false;
    if (trigger.method && context.webhook.method !== trigger.method) return false;
    return true;
  }

  private evaluateAiCondition(context: TriggerContext): boolean {
    if (!context.aiEvaluation) return false;
    return context.aiEvaluation.result && context.aiEvaluation.confidence >= 0.7;
  }
}
