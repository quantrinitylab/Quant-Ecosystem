import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AgentsTab } from '../components/AgentsTab';
import { DeveloperAppearanceSettings } from '../components/DeveloperAppearanceSettings';
import type { DeployedAgent } from '../types';

// QM-SCREEN-013 R4 — agent-fleet theater honesty.
// 1. P1: the "+ Deploy Agent" flow fabricated an ACTIVE agent card — green 'active'
//    pill, "Initialized and listening on swarm event bus.", "Ready for local
//    tasks.", invented steps ["Loaded sovereign context","Mounted workspace
//    volume"] and a "Thought Chain" box — while no swarm event bus or agent
//    backend exists (the tab itself says to connect one).
// 2. P2: the header "Autonomous Swarm Fleet & GitHub Copilot Workspace" framed a
//    non-existent fleet as existing.
// 3. P2: DeveloperAppearanceSettings toggles were local useState only (reset on
//    reload, no save path), the page's onSave toast was dead code, and the
//    Feature Preview rows invented capabilities ("Slash Commands" macros,
//    "Colorblind accessible diff themes").

const localAgent: DeployedAgent = {
  id: 'cipher',
  name: 'Cipher',
  role: 'Specialized Developer Agent',
  pod: 'COMMAND',
  status: 'local-only',
  currentTask: 'Local only — not connected to an agent backend.',
  initial: 'C',
  color: 'var(--app-accent)',
};

function srcPath(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url));
}

function renderAgentsTab(agents: DeployedAgent[]): string {
  return renderToStaticMarkup(<AgentsTab agents={agents} setModalState={() => {}} />);
}

describe('AgentsTab deploy-agent honesty (QM-SCREEN-013 R4)', () => {
  it('a deployed agent card claims no active/connected state', () => {
    const html = renderAgentsTab([localAgent]);
    expect(html).toContain('Local only');
    expect(html).toContain('not connected to an agent backend');
    // No fabricated backend claims anywhere on the card.
    expect(html).not.toContain('active');
    expect(html).not.toContain('Initialized and listening on swarm event bus');
    expect(html).not.toContain('Ready for local tasks');
    expect(html).not.toContain('Loaded sovereign context');
    expect(html).not.toContain('Mounted workspace volume');
    expect(html).not.toContain('Thought Chain');
  });

  it('page.tsx constructs no fabricated agent fields on deploy', () => {
    const page = readFileSync(srcPath('../page.tsx'), 'utf8');
    expect(page).not.toContain('Initialized and listening on swarm event bus');
    expect(page).not.toContain("status: 'active'");
    expect(page).not.toContain('Ready for local tasks');
    expect(page).not.toContain('Loaded sovereign context');
    expect(page).not.toContain('Mounted workspace volume');
    expect(page).toContain("status: 'local-only'");
  });

  it('the header no longer frames a fleet as existing', () => {
    const html = renderAgentsTab([]);
    expect(html).toContain('Agent Workspace');
    expect(html).toContain('Local only');
    expect(html).toContain('no backend connected');
    expect(html).not.toContain('Autonomous Swarm Fleet');
    expect(html).not.toContain('Copilot Workspace');
    // Source-level: the fleet-framing string must be gone entirely.
    const tabSrc = readFileSync(srcPath('../components/AgentsTab.tsx'), 'utf8');
    expect(tabSrc).not.toContain('Autonomous Swarm Fleet');
    // The empty state must not promise autonomous capabilities.
    expect(tabSrc).not.toContain('Deploy an autonomous agent');
  });

  it('the deploy modal is honestly labeled', () => {
    const modals = readFileSync(srcPath('../components/QuantGitModals.tsx'), 'utf8');
    expect(modals).not.toContain('Deploy to Swarm');
    expect(modals).toContain('no agent backend is connected');
  });
});

describe('DeveloperAppearanceSettings save honesty (QM-SCREEN-013 R4)', () => {
  it('persists to localStorage and calls onSave only on a real save', () => {
    const src = readFileSync(srcPath('../components/DeveloperAppearanceSettings.tsx'), 'utf8');
    expect(src).toContain('localStorage.setItem');
    expect(src).toContain('quantgit.devAppearance.v1');
    // onSave fires from the explicit save handler, not from toggles.
    expect(src).toContain('onSave?.(settings)');
    expect(src).toContain('Save Settings');
    // Hydration-safe: defaults first, rehydrate on mount.
    expect(src).toContain('typeof window');
    // The page-level saved toast is now wired to a real save, not dead code.
    const page = readFileSync(srcPath('../page.tsx'), 'utf8');
    expect(page).toContain("showToast('Developer appearance settings saved!')");
  });

  it('invents no feature-preview capabilities', () => {
    const html = renderToStaticMarkup(<DeveloperAppearanceSettings />);
    expect(html).toContain('Feature Roadmap');
    expect(html).toContain('Planned — not available');
    expect(html).toContain('not available yet');
    // Invented capability claims are gone.
    expect(html).not.toContain('Instant developer agent macros');
    expect(html).not.toContain('Enhanced contrast red-green alternate diff visualization');
    expect(html).not.toContain('Fast global command center');
    expect(html).not.toContain('Rendered cell-by-cell visual diffs');
    expect(html).not.toContain('Get early access to new features');
  });
});
