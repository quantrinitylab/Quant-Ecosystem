import type { CronSchedule } from './types.js';

interface ScheduledEntry {
  automationId: string;
  cron: CronSchedule;
  nextRunAt: number;
  enabled: boolean;
}

/**
 * Parses a cron field into a list of valid values.
 * Supports: *, specific numbers, ranges (1-5), step values (star/N), comma-separated lists.
 */
function parseCronField(field: string, min: number, max: number): number[] {
  const values: number[] = [];

  const parts = field.split(',');
  for (const part of parts) {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr ?? '1', 10);
      if (isNaN(step) || step <= 0) continue;
      let start = min;
      let end = max;
      if (range && range !== '*') {
        if (range.includes('-')) {
          const [s, e] = range.split('-');
          start = parseInt(s ?? String(min), 10);
          end = parseInt(e ?? String(max), 10);
        } else {
          start = parseInt(range, 10);
        }
      }
      for (let i = start; i <= end; i += step) {
        values.push(i);
      }
    } else if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr ?? String(min), 10);
      const end = parseInt(endStr ?? String(max), 10);
      for (let i = start; i <= end; i++) {
        values.push(i);
      }
    } else if (part === '*') {
      for (let i = min; i <= max; i++) {
        values.push(i);
      }
    } else {
      const val = parseInt(part, 10);
      if (!isNaN(val)) values.push(val);
    }
  }

  return values.sort((a, b) => a - b);
}

/**
 * Validates a cron expression (5 fields: minute hour dayOfMonth month dayOfWeek).
 */
export function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const ranges: [number, number][] = [
    [0, 59], // minute
    [0, 23], // hour
    [1, 31], // day of month
    [1, 12], // month
    [0, 7], // day of week (0 and 7 = Sunday)
  ];

  for (let i = 0; i < 5; i++) {
    const field = fields[i]!;
    const [min, max] = ranges[i]!;
    const values = parseCronField(field, min, max);
    if (values.length === 0) return false;
    if (values.some((v) => v < min || v > max)) return false;
  }

  return true;
}

/**
 * Calculates the next run time after the given reference time.
 */
export function calculateNextRun(expression: string, after: number): number | null {
  if (!isValidCronExpression(expression)) return null;

  const fields = expression.trim().split(/\s+/);
  const minutes = parseCronField(fields[0]!, 0, 59);
  const hours = parseCronField(fields[1]!, 0, 23);
  const daysOfMonth = parseCronField(fields[2]!, 1, 31);
  const months = parseCronField(fields[3]!, 1, 12);
  const daysOfWeek = parseCronField(fields[4]!, 0, 7);

  // Normalize day of week: 7 -> 0 (both mean Sunday)
  const normalizedDow = daysOfWeek.map((d) => (d === 7 ? 0 : d));

  const start = new Date(after + 60000); // start checking from next minute
  start.setSeconds(0, 0);

  // Search up to 1 year ahead
  const maxIterations = 525960; // ~365 days * 24 hours * 60 minutes
  const candidate = new Date(start);

  for (let i = 0; i < maxIterations; i++) {
    const month = candidate.getMonth() + 1;
    const day = candidate.getDate();
    const dow = candidate.getDay();
    const hour = candidate.getHours();
    const minute = candidate.getMinutes();

    if (
      months.includes(month) &&
      daysOfMonth.includes(day) &&
      normalizedDow.includes(dow) &&
      hours.includes(hour) &&
      minutes.includes(minute)
    ) {
      return candidate.getTime();
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}

export class CronScheduler {
  private entries = new Map<string, ScheduledEntry>();

  schedule(automationId: string, cron: CronSchedule): boolean {
    if (!isValidCronExpression(cron.expression)) return false;

    const nextRunAt = calculateNextRun(cron.expression, Date.now());
    if (nextRunAt === null) return false;

    this.entries.set(automationId, {
      automationId,
      cron,
      nextRunAt,
      enabled: true,
    });

    return true;
  }

  unschedule(automationId: string): void {
    this.entries.delete(automationId);
  }

  enable(automationId: string): void {
    const entry = this.entries.get(automationId);
    if (entry) {
      entry.enabled = true;
    }
  }

  disable(automationId: string): void {
    const entry = this.entries.get(automationId);
    if (entry) {
      entry.enabled = false;
    }
  }

  getNextRun(automationId: string): number | null {
    const entry = this.entries.get(automationId);
    if (!entry || !entry.enabled) return null;
    return entry.nextRunAt;
  }

  getDueAutomations(currentTime: number): string[] {
    const due: string[] = [];
    for (const entry of this.entries.values()) {
      if (entry.enabled && entry.nextRunAt <= currentTime) {
        due.push(entry.automationId);
      }
    }
    return due;
  }

  advanceSchedule(automationId: string): void {
    const entry = this.entries.get(automationId);
    if (!entry) return;

    const nextRun = calculateNextRun(entry.cron.expression, entry.nextRunAt);
    if (nextRun !== null) {
      entry.nextRunAt = nextRun;
    }
  }

  listScheduled(): ScheduledEntry[] {
    return [...this.entries.values()];
  }
}
