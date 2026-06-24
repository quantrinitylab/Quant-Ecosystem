// ============================================================================
// QuantTrinity - AI employee scheduler (autopilot)
// ============================================================================
//
// Gives each AI employee a cadence (manual / hourly / daily) and runs their
// shift automatically when due. A "scheduler run" finds every active AI
// employee whose next run has elapsed and runs one shift for it, recording a
// summary to the owner audit trail. This is what makes the workforce run on
// its own ("AI jo roz khud kaam karega").

import type { TeamMember } from './domain';
import { listTeam, recordAudit } from './store';
import { runShift, type ShiftResult } from './ai-employee-runtime';

export type Cadence = 'manual' | 'hourly' | 'daily';

const CADENCE_MS: Record<Cadence, number> = {
  manual: Number.POSITIVE_INFINITY,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

export interface ScheduleEntry {
  employeeId: string;
  cadence: Cadence;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

interface SchedulerState {
  entries: Map<string, ScheduleEntry>;
  enabled: boolean;
}

const globalForScheduler = globalThis as unknown as { __trinityScheduler?: SchedulerState };

function sched(): SchedulerState {
  if (!globalForScheduler.__trinityScheduler) {
    globalForScheduler.__trinityScheduler = { entries: new Map(), enabled: true };
  }
  return globalForScheduler.__trinityScheduler;
}

/** Default cadence derived from the autonomy the owner granted. */
function defaultCadence(member: TeamMember): Cadence {
  switch (member.ai?.autonomy) {
    case 'autonomous':
      return 'hourly';
    case 'act-with-approval':
      return 'daily';
    default:
      return 'manual';
  }
}

function computeNextRun(cadence: Cadence, fromIso: string | null): string | null {
  if (cadence === 'manual') return null;
  const base = fromIso ? new Date(fromIso).getTime() : Date.now();
  return new Date(base + CADENCE_MS[cadence]).toISOString();
}

export function getEntry(member: TeamMember): ScheduleEntry {
  const s = sched();
  const existing = s.entries.get(member.id);
  if (existing) return existing;
  const cadence = defaultCadence(member);
  const entry: ScheduleEntry = {
    employeeId: member.id,
    cadence,
    lastRunAt: null,
    // a brand-new non-manual schedule is due immediately
    nextRunAt: cadence === 'manual' ? null : new Date().toISOString(),
  };
  s.entries.set(member.id, entry);
  return entry;
}

export function setCadence(employeeId: string, cadence: Cadence): ScheduleEntry | null {
  const member = listTeam().find((m) => m.id === employeeId && m.kind === 'ai');
  if (!member) return null;
  const entry = getEntry(member);
  entry.cadence = cadence;
  entry.nextRunAt = computeNextRun(cadence, entry.lastRunAt);
  if (cadence !== 'manual' && !entry.lastRunAt) {
    entry.nextRunAt = new Date().toISOString();
  }
  return entry;
}

export function setEnabled(enabled: boolean): boolean {
  sched().enabled = enabled;
  return sched().enabled;
}

export function isEnabled(): boolean {
  return sched().enabled;
}

function isDue(entry: ScheduleEntry, now: number): boolean {
  if (entry.cadence === 'manual' || !entry.nextRunAt) return false;
  return new Date(entry.nextRunAt).getTime() <= now;
}

export interface SchedulerEntryView extends ScheduleEntry {
  name: string;
  sector: string;
  status: TeamMember['status'];
  due: boolean;
}

export function listSchedule(now = Date.now()): SchedulerEntryView[] {
  return listTeam()
    .filter((m) => m.kind === 'ai')
    .map((m) => {
      const entry = getEntry(m);
      return {
        ...entry,
        name: m.name,
        sector: m.sector,
        status: m.status,
        due: m.status === 'active' && isDue(entry, now),
      };
    });
}

export interface SchedulerRunResult {
  ranAt: string;
  enabled: boolean;
  dueCount: number;
  results: ShiftResult[];
}

/**
 * Run one shift for every active AI employee whose schedule is due. When
 * `force` is true, runs all active AI employees regardless of cadence (the
 * "Run all now" button).
 */
export function runDueShifts(now = Date.now(), force = false): SchedulerRunResult {
  const s = sched();
  const results: ShiftResult[] = [];

  if (!s.enabled && !force) {
    return { ranAt: new Date(now).toISOString(), enabled: false, dueCount: 0, results: [] };
  }

  const aiMembers = listTeam().filter((m) => m.kind === 'ai' && m.status === 'active');
  for (const member of aiMembers) {
    const entry = getEntry(member);
    if (!force && !isDue(entry, now)) continue;

    const result = runShift(member);
    results.push(result);
    entry.lastRunAt = new Date(now).toISOString();
    entry.nextRunAt = computeNextRun(entry.cadence, entry.lastRunAt);
  }

  if (results.length > 0) {
    const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
    recordAudit({
      actor: 'scheduler',
      action: 'scheduler.run',
      target: `${results.length} employee(s)`,
      detail: `${force ? 'Manual' : 'Autopilot'} run · ${totalProcessed} item(s) processed`,
    });
  }

  return {
    ranAt: new Date(now).toISOString(),
    enabled: s.enabled,
    dueCount: results.length,
    results,
  };
}
