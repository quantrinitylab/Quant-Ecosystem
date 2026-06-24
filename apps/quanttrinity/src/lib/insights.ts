// ============================================================================
// QuantTrinity - Owner insights
// ============================================================================
//
// Turns the raw owner-tier state (audit trail, economy, reports, workforce)
// into the kind of intelligence the owner's personal QuantAI surfaces: who is
// doing the work (human vs AI), what kind of actions dominate, the revenue mix,
// payout throughput, and the moderation backlog.

import { listAudit, listPayouts, listReports, listRevenue, listTeam } from './store';

export type ActorClass = 'human' | 'ai' | 'system';

export function classifyActor(actor: string): ActorClass {
  if (actor.includes('@')) return 'human';
  if (actor.toLowerCase() === 'scheduler') return 'system';
  return 'ai';
}

export interface Insights {
  actions: {
    total: number;
    byActorClass: Record<ActorClass, number>;
    aiSharePct: number;
    byType: { type: string; count: number }[];
  };
  revenue: {
    monthlyTotalUsd: number;
    mix: { label: string; usd: number; pct: number }[];
  };
  payouts: {
    pending: number;
    approved: number;
    paid: number;
    rejected: number;
    pendingCredits: number;
  };
  reports: {
    open: number;
    inReview: number;
    resolved: number;
    bySeverity: Record<'low' | 'medium' | 'high' | 'critical', number>;
    aiHandled: number;
  };
  workforce: {
    totalStaff: number;
    humans: number;
    aiStaff: number;
    activeAi: number;
  };
}

export function computeInsights(): Insights {
  const audit = listAudit(500);
  const revenue = listRevenue();
  const payouts = listPayouts();
  const reports = listReports();
  const team = listTeam();

  // --- actions ---
  const byActorClass: Record<ActorClass, number> = { human: 0, ai: 0, system: 0 };
  const typeCounts = new Map<string, number>();
  for (const entry of audit) {
    byActorClass[classifyActor(entry.actor)] += 1;
    const type = entry.action.split('.')[0] ?? entry.action;
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
  }
  const total = audit.length;
  const actionableTotal = byActorClass.human + byActorClass.ai;
  const aiSharePct =
    actionableTotal === 0 ? 0 : Math.round((byActorClass.ai / actionableTotal) * 100);
  const byType = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // --- revenue ---
  const monthlyTotalUsd = revenue.reduce((s, r) => s + r.monthlyUsd, 0);
  const mix = revenue
    .map((r) => ({
      label: r.label,
      usd: r.monthlyUsd,
      pct: monthlyTotalUsd === 0 ? 0 : Math.round((r.monthlyUsd / monthlyTotalUsd) * 100),
    }))
    .sort((a, b) => b.usd - a.usd);

  // --- payouts ---
  const payoutCounts = { pending: 0, approved: 0, paid: 0, rejected: 0 };
  let pendingCredits = 0;
  for (const p of payouts) {
    payoutCounts[p.status] += 1;
    if (p.status === 'pending') pendingCredits += p.credits;
  }

  // --- reports ---
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  let open = 0;
  let inReview = 0;
  let resolved = 0;
  let aiHandled = 0;
  for (const r of reports) {
    bySeverity[r.severity] += 1;
    if (r.status === 'open') open += 1;
    else if (r.status === 'in-review') inReview += 1;
    else resolved += 1;
    if (r.handledByAi) aiHandled += 1;
  }

  // --- workforce ---
  const aiStaff = team.filter((m) => m.kind === 'ai');
  const activeAi = aiStaff.filter((m) => m.status === 'active').length;

  return {
    actions: { total, byActorClass, aiSharePct, byType },
    revenue: { monthlyTotalUsd, mix },
    payouts: { ...payoutCounts, pendingCredits },
    reports: { open, inReview, resolved, bySeverity, aiHandled },
    workforce: {
      totalStaff: team.length,
      humans: team.length - aiStaff.length,
      aiStaff: aiStaff.length,
      activeAi,
    },
  };
}
