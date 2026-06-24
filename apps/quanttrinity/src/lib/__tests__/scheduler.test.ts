import { describe, expect, it } from 'vitest';
import { createTeamMember } from '../store';
import { getEntry, listSchedule, runDueShifts, setCadence, setEnabled } from '../scheduler';

function deployAi(autonomy: 'suggest' | 'act-with-approval' | 'autonomous', budget = 50) {
  return createTeamMember({
    kind: 'ai',
    name: `Sched ${autonomy} ${Math.random().toString(36).slice(2)}`,
    sector: 'reporting',
    role: 'agent',
    ai: { modelId: 'or-claude-sonnet', autonomy, dailyCreditBudget: budget, mandate: 'triage' },
  });
}

describe('AI workforce scheduler', () => {
  it('derives default cadence from autonomy', () => {
    const auto = deployAi('autonomous');
    const approval = deployAi('act-with-approval');
    const suggest = deployAi('suggest');
    expect(getEntry(auto).cadence).toBe('hourly');
    expect(getEntry(approval).cadence).toBe('daily');
    expect(getEntry(suggest).cadence).toBe('manual');
  });

  it('runs a forced shift for an active employee and advances the schedule', () => {
    const emp = deployAi('autonomous');
    const before = getEntry(emp);
    expect(before.lastRunAt).toBeNull();
    const result = runDueShifts(Date.now(), true);
    expect(result.results.some((r) => r.employeeId === emp.id)).toBe(true);
    expect(getEntry(emp).lastRunAt).not.toBeNull();
  });

  it('does not run due shifts when the scheduler is disabled (non-forced)', () => {
    setEnabled(false);
    const result = runDueShifts(Date.now(), false);
    expect(result.enabled).toBe(false);
    expect(result.dueCount).toBe(0);
    setEnabled(true);
  });

  it('manual cadence is never due', () => {
    const emp = deployAi('autonomous');
    setCadence(emp.id, 'manual');
    const view = listSchedule().find((e) => e.employeeId === emp.id);
    expect(view?.cadence).toBe('manual');
    expect(view?.due).toBe(false);
  });

  it('respects nextRunAt for cadence (future schedule not due)', () => {
    const emp = deployAi('autonomous');
    // run once so nextRunAt is pushed an hour out
    runDueShifts(Date.now(), true);
    const view = listSchedule(Date.now()).find((e) => e.employeeId === emp.id);
    expect(view?.due).toBe(false);
  });
});
