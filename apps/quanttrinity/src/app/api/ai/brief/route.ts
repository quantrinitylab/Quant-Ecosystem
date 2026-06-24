import { NextResponse } from 'next/server';
import { listApps, listPayouts, listReports, listRevenue, listTeam } from '../../../../lib/store';

/**
 * The owner's personal QuantAI daily brief. Synthesizes the current owner-tier
 * state into a prioritized set of observations + suggested actions — the kind
 * of summary the owner's AI surfaces each morning across the whole ecosystem.
 */
export async function GET() {
  const apps = listApps();
  const reports = listReports();
  const payouts = listPayouts();
  const revenue = listRevenue();
  const team = listTeam();

  const criticalReports = reports.filter(
    (r) => r.severity === 'critical' && r.status !== 'resolved',
  );
  const pendingPayouts = payouts.filter((p) => p.status === 'pending');
  const appsDown = apps.filter((a) => a.status !== 'live');
  const aiStaff = team.filter((m) => m.kind === 'ai');
  const monthlyRevenueUsd = revenue.reduce((s, r) => s + r.monthlyUsd, 0);

  const observations: { id: string; severity: 'info' | 'warn' | 'critical'; text: string }[] = [];

  if (criticalReports.length > 0) {
    observations.push({
      id: 'obs-critical-reports',
      severity: 'critical',
      text: `${criticalReports.length} critical report(s) open — e.g. ${criticalReports[0]?.app}: ${criticalReports[0]?.reason}.`,
    });
  }
  if (pendingPayouts.length > 0) {
    const credits = pendingPayouts.reduce((s, p) => s + p.credits, 0);
    observations.push({
      id: 'obs-payouts',
      severity: 'warn',
      text: `${pendingPayouts.length} payout request(s) awaiting approval (${credits} credits ≈ $${credits}).`,
    });
  }
  if (appsDown.length > 0) {
    observations.push({
      id: 'obs-apps',
      severity: 'warn',
      text: `${appsDown.length} app(s) not live: ${appsDown.map((a) => a.name).join(', ')}.`,
    });
  }
  observations.push({
    id: 'obs-revenue',
    severity: 'info',
    text: `Monthly revenue run-rate ≈ $${monthlyRevenueUsd.toLocaleString()} across ${revenue.length} streams.`,
  });
  observations.push({
    id: 'obs-aistaff',
    severity: 'info',
    text: `${aiStaff.length} AI employee(s) on duty${
      aiStaff.length ? ` (${aiStaff.map((a) => a.sector).join(', ')})` : ''
    }.`,
  });

  const suggestedActions = [
    criticalReports.length > 0
      ? {
          id: 'act-escalate',
          label: 'Escalate critical reports to Trust & Safety',
          href: '/reports',
        }
      : null,
    pendingPayouts.length > 0
      ? { id: 'act-payouts', label: 'Review pending payouts', href: '/economy' }
      : null,
    { id: 'act-staff', label: 'Provision an AI employee for the reporting sector', href: '/teams' },
  ].filter((x): x is { id: string; label: string; href: string } => x !== null);

  return NextResponse.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      headline: criticalReports.length
        ? 'Action needed: critical reports open'
        : 'Ecosystem healthy — routine review',
      observations,
      suggestedActions,
    },
  });
}
