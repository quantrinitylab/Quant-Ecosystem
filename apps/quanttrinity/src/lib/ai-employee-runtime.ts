// ============================================================================
// QuantTrinity - AI employee runtime
// ============================================================================
//
// Turns a provisioned AI team member into a working "employee" backed by the
// real @quant/agent-runtime safety primitives:
//   - SpendingLimit   -> enforces the employee's daily credit budget
//   - TrustScore      -> earns/loses autonomy as it succeeds/fails
//   - AgentStateMachine -> models the IDLE -> PLANNING -> EXECUTING -> DONE shift
//   - PermissionLevel  -> gates what it may do (suggest vs act vs resolve criticals)
//
// A "shift" (tick) makes the employee process its sector's live work queue
// (reports today) within budget and permission limits, recording every action
// to the owner audit trail.

import {
  AgentState,
  AgentStateMachine,
  PermissionLevel,
  SpendingCapBreachedError,
  SpendingLimit,
  TrustScore,
  canAct,
  scoreToPermissionLevel,
} from '@quant/agent-runtime';
import type { AiEmployeeConfig, OwnerReport, Sector, TeamMember } from './domain';
import { listReports, recordAudit, updateReport } from './store';

const COST_PER_ITEM = 1; // credits per item handled
const MAX_ITEMS_PER_SHIFT = 8;

export type EmployeeActionKind = 'resolved' | 'escalated' | 'suggested' | 'skipped';

export interface EmployeeAction {
  at: string;
  target: string;
  summary: string;
  kind: EmployeeActionKind;
  creditsSpent: number;
}

export interface RuntimeState {
  trust: TrustScore;
  spend: SpendingLimit;
  machine: AgentStateMachine;
  lastActions: EmployeeAction[];
  shiftsRun: number;
}

export interface ShiftResult {
  employeeId: string;
  permissionLevel: PermissionLevel;
  trustScore: number;
  dailyRemaining: number;
  processed: number;
  paused: boolean;
  note: string;
  actions: EmployeeAction[];
}

const globalForRuntime = globalThis as unknown as {
  __trinityRuntimes?: Map<string, RuntimeState>;
};

function runtimes(): Map<string, RuntimeState> {
  if (!globalForRuntime.__trinityRuntimes) {
    globalForRuntime.__trinityRuntimes = new Map();
  }
  return globalForRuntime.__trinityRuntimes;
}

/** Initial trust seeded from the owner-granted autonomy level. */
function seedTrustScore(autonomy: AiEmployeeConfig['autonomy']): number {
  switch (autonomy) {
    case 'suggest':
      return 21; // SUGGEST
    case 'act-with-approval':
      return 50; // ACT_LOW
    case 'autonomous':
      return 75; // ACT_HIGH
  }
}

export function getOrCreateRuntime(member: TeamMember): RuntimeState {
  const map = runtimes();
  const existing = map.get(member.id);
  if (existing) return existing;

  const ai = member.ai;
  const dailyCap = Math.max(1, ai?.dailyCreditBudget ?? 10);
  const state: RuntimeState = {
    trust: new TrustScore(seedTrustScore(ai?.autonomy ?? 'suggest'), Date.now(), {
      agentId: member.id,
    }),
    spend: new SpendingLimit({
      dailyCap,
      weeklyCap: dailyCap * 7,
      monthlyCap: dailyCap * 30,
      perTaskCap: dailyCap,
    }),
    machine: new AgentStateMachine(),
    lastActions: [],
    shiftsRun: 0,
  };
  map.set(member.id, state);
  return state;
}

export function getRuntimeSnapshot(member: TeamMember): {
  trustScore: number;
  permissionLevel: PermissionLevel;
  dailyRemaining: number;
  paused: boolean;
  shiftsRun: number;
  lastActions: EmployeeAction[];
} {
  const rt = getOrCreateRuntime(member);
  return {
    trustScore: rt.trust.getScore(),
    permissionLevel: rt.trust.getPermissionLevel(),
    dailyRemaining: rt.spend.getRemainingBudget('daily'),
    paused: rt.trust.isPaused(),
    shiftsRun: rt.shiftsRun,
    lastActions: rt.lastActions,
  };
}

/** Decide what the employee may do with a report given its permission level. */
function decideReportAction(
  level: PermissionLevel,
  report: OwnerReport,
): { kind: EmployeeActionKind; nextStatus: OwnerReport['status'] | null; summary: string } {
  if (report.severity === 'critical') {
    if (canAct(level, PermissionLevel.ACT_HIGH)) {
      return {
        kind: 'resolved',
        nextStatus: 'resolved',
        summary: `Resolved critical: ${report.reason}`,
      };
    }
    if (canAct(level, PermissionLevel.ACT_LOW)) {
      return {
        kind: 'escalated',
        nextStatus: 'in-review',
        summary: `Escalated critical for human review: ${report.reason}`,
      };
    }
    return {
      kind: 'suggested',
      nextStatus: null,
      summary: `Suggested escalation: ${report.reason}`,
    };
  }

  if (canAct(level, PermissionLevel.ACT_LOW)) {
    return { kind: 'resolved', nextStatus: 'resolved', summary: `Resolved: ${report.reason}` };
  }
  return { kind: 'suggested', nextStatus: null, summary: `Suggested resolution: ${report.reason}` };
}

const SECTOR_QUEUE: Partial<Record<Sector, true>> = {
  reporting: true,
  moderation: true,
  'trust-safety': true,
};

/**
 * Run one shift for an AI employee. Returns what it did. Throws if the member
 * is not an AI employee.
 */
export function runShift(member: TeamMember): ShiftResult {
  if (member.kind !== 'ai') {
    throw new Error('runShift can only be called for AI employees');
  }

  const rt = getOrCreateRuntime(member);
  const actions: EmployeeAction[] = [];

  // Paused agents (trust at/below auto-pause threshold) do nothing.
  if (rt.trust.isPaused()) {
    return {
      employeeId: member.id,
      permissionLevel: rt.trust.getPermissionLevel(),
      trustScore: rt.trust.getScore(),
      dailyRemaining: rt.spend.getRemainingBudget('daily'),
      processed: 0,
      paused: true,
      note: rt.trust.getPauseReason() ?? 'Agent is paused.',
      actions: [],
    };
  }

  rt.machine.reset();
  rt.machine.transition(AgentState.PLANNING);

  // Work queue: report-type sectors triage the report queue; other sectors
  // perform a generic review pass.
  const handlesReports = SECTOR_QUEUE[member.sector] === true;
  let processed = 0;
  let note = '';

  rt.machine.transition(AgentState.EXECUTING);

  try {
    if (handlesReports) {
      const queue = listReports().filter((r) => r.status !== 'resolved');
      // moderation/trust-safety focus their own sector; reporting handles all.
      const scoped =
        member.sector === 'reporting' ? queue : queue.filter((r) => r.sector === member.sector);

      for (const report of scoped.slice(0, MAX_ITEMS_PER_SHIFT)) {
        if (!rt.spend.canSpend(COST_PER_ITEM)) {
          note = 'Daily credit budget reached — stopping shift.';
          break;
        }
        const level = rt.trust.getPermissionLevel();
        const decision = decideReportAction(level, report);
        rt.spend.recordSpend(COST_PER_ITEM);
        if (decision.nextStatus) {
          updateReport(report.id, decision.nextStatus);
        }
        rt.trust.recordSuccess();
        const action: EmployeeAction = {
          at: new Date().toISOString(),
          target: report.id,
          summary: `${report.app} — ${decision.summary}`,
          kind: decision.kind,
          creditsSpent: COST_PER_ITEM,
        };
        actions.push(action);
        recordAudit({
          actor: member.name,
          action: `ai_employee.report.${decision.kind}`,
          target: report.id,
          detail: action.summary,
        });
        processed += 1;
      }
      if (!note) {
        note = processed > 0 ? `Triaged ${processed} report(s).` : 'No open work in queue.';
      }
    } else {
      // Generic sector review pass (bounded by budget).
      const items = Math.min(MAX_ITEMS_PER_SHIFT, rt.spend.getRemainingBudget('daily'));
      for (let i = 0; i < items; i += 1) {
        if (!rt.spend.canSpend(COST_PER_ITEM)) break;
        rt.spend.recordSpend(COST_PER_ITEM);
        rt.trust.recordSuccess();
        processed += 1;
      }
      note = `Reviewed ${processed} item(s) in ${member.sector}.`;
      if (processed > 0) {
        recordAudit({
          actor: member.name,
          action: 'ai_employee.review',
          target: member.sector,
          detail: note,
        });
      }
    }
    rt.machine.transition(AgentState.DONE);
  } catch (err) {
    rt.trust.recordFailure();
    rt.machine.transition(AgentState.FAILED);
    note =
      err instanceof SpendingCapBreachedError
        ? `Spending cap breached (${err.capType}).`
        : 'Shift failed.';
  } finally {
    rt.machine.reset();
  }

  rt.lastActions = actions.length ? actions : rt.lastActions;
  rt.shiftsRun += 1;

  return {
    employeeId: member.id,
    permissionLevel: rt.trust.getPermissionLevel(),
    trustScore: rt.trust.getScore(),
    dailyRemaining: rt.spend.getRemainingBudget('daily'),
    processed,
    paused: false,
    note,
    actions,
  };
}
