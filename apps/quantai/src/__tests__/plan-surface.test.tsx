// ============================================================================
// /plan surface tests (PR-Q6) — presentational + honest-state rendering.
// Follows the repo's renderToStaticMarkup pattern.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../../lib/auth', () => ({
  getAuthHeaders: () => ({}),
}));

import PlanCards from '../components/plan/PlanCards';
import PlanSection from '../components/plan/PlanSection';
import MessagingChannelsSection from '../components/plan/MessagingChannelsSection';
import { formatCompact, formatResetDate, type PlanSummaryData } from '../components/plan/types';

const PLAN: PlanSummaryData = {
  configured: true,
  plan: { name: 'Free plan', tier: 'free', percentUsed: 100, resetsAt: '2026-10-07T00:00:00.000Z' },
  tokens: { percentUsed: 4, remaining: 960_000_000, granted: 1_000_000_000, expiresAt: null },
  upgradeUrl: null,
};

describe('format helpers', () => {
  it('formatCompact abbreviates large numbers', () => {
    expect(formatCompact(960_000_000)).toBe('960M');
    expect(formatCompact(1500)).toBe('1.5K');
    expect(formatCompact(42)).toBe('42');
  });

  it('formatResetDate handles null honestly', () => {
    expect(formatResetDate(null)).toBe('—');
    expect(formatResetDate('2026-10-10T00:00:00.000Z')).toContain('Oct');
  });
});

describe('PlanCards', () => {
  it('renders plan name, usage %, reset line, and progress bars', () => {
    const html = renderToStaticMarkup(<PlanCards plan={PLAN} />);
    expect(html).toContain('Free plan');
    expect(html).toContain('100% used');
    expect(html).toContain('Daily limit resets at midnight UTC');
    expect(html).toContain('Additional tokens');
    expect(html).toContain('4% used');
    expect(html).toContain('960M tokens left');
    expect(html).toContain('Never expires');
    expect(html).toContain('progressbar');
  });

  it('shows honest "coming soon" when no upgrade URL is configured', () => {
    const html = renderToStaticMarkup(<PlanCards plan={PLAN} />);
    expect(html).toContain('coming soon');
    expect(html).not.toContain('href="https://');
  });

  it('renders the upgrade link when a URL is configured', () => {
    const html = renderToStaticMarkup(
      <PlanCards plan={{ ...PLAN, upgradeUrl: 'https://billing.example/upgrade' }} />,
    );
    expect(html).toContain('href="https://billing.example/upgrade"');
  });

  it('shows honest unconfigured copy when metering is absent', () => {
    const html = renderToStaticMarkup(
      <PlanCards plan={{ ...PLAN, configured: false, plan: { ...PLAN.plan, percentUsed: 0 } }} />,
    );
    expect(html).toContain('not connected');
  });
});

describe('PlanSection', () => {
  it('renders title, subtitle, and badge; content hidden until expanded', () => {
    const html = renderToStaticMarkup(
      <PlanSection icon="👛" title="Wallet" subtitle="Balance and history" badge="Soon">
        <p>secret content</p>
      </PlanSection>,
    );
    expect(html).toContain('Wallet');
    expect(html).toContain('Balance and history');
    expect(html).toContain('Soon');
    expect(html).not.toContain('secret content');
  });

  it('renders open by default when defaultOpen is set', () => {
    const html = renderToStaticMarkup(
      <PlanSection icon="👛" title="Wallet" defaultOpen>
        <p>visible content</p>
      </PlanSection>,
    );
    expect(html).toContain('visible content');
  });
});

describe('MessagingChannelsSection', () => {
  it('never shows a fake connected state — all channels are "coming soon"', () => {
    const html = renderToStaticMarkup(<MessagingChannelsSection />);
    expect(html).toContain('WhatsApp');
    expect(html).toContain('Telegram');
    expect(html).toContain('Coming soon');
    expect(html).not.toContain('Connected');
    expect(html).not.toContain('Connect');
  });
});
