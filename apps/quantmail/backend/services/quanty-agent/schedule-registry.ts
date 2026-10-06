/**
 * quanty-agent/schedule-registry.ts — Scheduled/recurring Quanty jobs.
 *
 * Seeded from the platform cron definitions (workspace crons/*.md):
 *   - agent-coordination-watch        — every 10 minutes
 *   - quant-deep-audit-daily          — daily 09:41
 *   - quant-deep-customer-audit       — every 6 hours
 *   - quantmail-weekly-health-check   — weekly, Monday 09:41
 *
 * The backend cannot read the Muse workspace at runtime, so the registry
 * carries the definitions as data. registerScheduledTask() lets future code
 * add jobs programmatically; the registry is the single source the
 * GET /api/quanty/schedule endpoint reads.
 */

import type { QuantySchedule, QuantyScheduledTask, QuantyScheduleKind } from './types';

interface SeedDef {
  id: string;
  name: string;
  type: QuantyScheduleKind;
  schedule: string;
  /** minutes between runs (interval) */
  everyMinutes?: number;
  /** HH:MM local time (daily/weekly) */
  at?: string;
  /** 0=Sun..6=Sat (weekly) */
  weekday?: number;
}

const SEEDS: SeedDef[] = [
  {
    id: 'agent-coordination-watch',
    name: 'Agent coordination watch',
    type: 'interval',
    schedule: 'Every 10 minutes',
    everyMinutes: 10,
  },
  {
    id: 'quant-deep-audit-daily',
    name: 'Quant deep audit daily',
    type: 'daily',
    schedule: 'Daily at 09:41',
    at: '09:41',
  },
  {
    id: 'quant-deep-customer-audit',
    name: 'Quant deep customer-journey audit',
    type: 'interval',
    schedule: 'Every 6 hours',
    everyMinutes: 360,
  },
  {
    id: 'quantmail-weekly-health-check',
    name: 'QuantMail weekly health check',
    type: 'weekly',
    schedule: 'Weekly on Monday at 09:41',
    at: '09:41',
    weekday: 1,
  },
];

const extra = new Map<string, SeedDef & { enabled: boolean }>();

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Approximate the next run time for a seed definition. */
function nextRunAt(def: SeedDef): string {
  const now = new Date();
  if (def.type === 'interval' && def.everyMinutes) {
    return new Date(now.getTime() + def.everyMinutes * 60_000).toISOString();
  }
  if ((def.type === 'daily' || def.type === 'weekly') && def.at) {
    const [h, m] = def.at.split(':').map(Number);
    const next = new Date(now);
    next.setHours(h, m, 0, 0);
    if (def.type === 'weekly' && typeof def.weekday === 'number') {
      const delta = (def.weekday - next.getDay() + 7) % 7;
      next.setDate(next.getDate() + delta);
      if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 7);
    } else if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }
  return now.toISOString();
}

function toTask(def: SeedDef, enabled: boolean): QuantyScheduledTask {
  return {
    id: def.id,
    name: def.name,
    type: def.type,
    schedule: def.schedule,
    nextRunAt: nextRunAt(def),
    enabled,
  };
}

/** Register an additional scheduled task programmatically. */
export function registerScheduledTask(def: {
  id: string;
  name: string;
  type: QuantyScheduleKind;
  schedule: string;
  enabled?: boolean;
}): void {
  if (extra.has(def.id) || SEEDS.some((s) => s.id === def.id)) {
    throw new Error(`Scheduled task "${def.id}" is already registered`);
  }
  extra.set(def.id, { ...def, enabled: def.enabled ?? true });
}

/** All scheduled tasks with fresh nextRunAt values. */
export function listScheduledTasks(): QuantyScheduledTask[] {
  const seeds = SEEDS.map((s) => toTask(s, true));
  const extras = [...extra.values()].map((e) =>
    toTask({ id: e.id, name: e.name, type: e.type, schedule: e.schedule }, e.enabled),
  );
  return [...seeds, ...extras];
}

/** Grouped schedule payload for GET /api/quanty/schedule. */
export function getSchedule(): QuantySchedule {
  const all = listScheduledTasks();
  const by = (kind: QuantyScheduleKind) => all.filter((t) => t.type === kind);
  return { daily: by('daily'), interval: by('interval'), weekly: by('weekly') };
}

/** Test-only reset of programmatic registrations (seeds are constant). */
export function clearScheduledTasks(): void {
  extra.clear();
}
