import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CopilotFleetModeView } from '../components/CopilotFleetModeView';

// QM-PLAT-008 — fabricated operational-data re-audit. The QuantGit 'agents'
// tab rendered CopilotFleetModeView with invented live telemetry: two
// seeded "cloud agent" tasks already running (68% / 100% progress,
// "Executing code analysis & terminal run..."), a token-usage meter
// ("1 / 200 Credits", 10,450 input / 1,824 output tokens) behind a pulsing
// live dot, an "N Active Agents" counter, and a dispatch toast claiming a
// cloud agent had been dispatched when the callback only showed a toast.
// No backend meters usage or executes these tasks. The view is now an
// honestly-labelled local planner: empty task list, no usage figure, and
// tasks the user adds are marked local-only / not dispatched.
//
// The same audit removed two dead fabricated-data artifacts that nothing
// in production imported: AGENT_FLEET_CATALOG (a fake agent fleet with
// invented statuses, tasks and "thought chains" in constants.ts) and the
// GlobalDeliveryGlobe component (fake delivery-network nodes with invented
// ping / tunnel counts / PQC status / throughput).

const FABRICATED_STRINGS = [
  '1 / 200 Credits',
  '10,450',
  '1,824',
  'Session token usage',
  'Analyze database indexing and optimize slow query on email_suppressions',
  'Generate E2E Signal protocol prekey verification test suite',
  'Executing code analysis & terminal run',
  'Active Agents',
  'In Progress',
  'Review Ready',
  'Dispatched cloud agent',
];

function srcPath(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url));
}

describe('CopilotFleetModeView honesty (QM-PLAT-008)', () => {
  it('renders no fabricated usage, seeded tasks, or live-agent claims', () => {
    const html = renderToStaticMarkup(
      <CopilotFleetModeView repoOwner="quantrinitylab" repoName="Quant-Ecosystem" />,
    );

    for (const fake of FABRICATED_STRINGS) {
      expect(html).not.toContain(fake);
    }
  });

  it('shows the honest empty state and local-only labelling', () => {
    const html = renderToStaticMarkup(
      <CopilotFleetModeView repoOwner="quantrinitylab" repoName="Quant-Ecosystem" />,
    );

    expect(html).toContain('No agent tasks yet');
    expect(html).toContain('local to this session');
    expect(html).toContain('not connected');
    expect(html).toContain('0 local tasks');
  });

  it('page.tsx no longer claims a cloud agent was dispatched', () => {
    const page = readFileSync(srcPath('../page.tsx'), 'utf8');
    expect(page).not.toContain('Dispatched cloud agent');
    expect(page).toContain('no cloud agent backend connected');
  });

  it('constants.ts no longer carries the fabricated agent fleet catalog', () => {
    const constants = readFileSync(srcPath('../constants.ts'), 'utf8');
    expect(constants).not.toContain('AGENT_FLEET_CATALOG');
    expect(constants).not.toContain('Executive Lead & Architecture Gatekeeper');
    expect(constants).not.toContain('Thought Chain');
  });

  it('the fabricated delivery-globe component is removed', () => {
    expect(existsSync(srcPath('../../../components/3d/GlobalDeliveryGlobe.tsx'))).toBe(false);
  });
});
