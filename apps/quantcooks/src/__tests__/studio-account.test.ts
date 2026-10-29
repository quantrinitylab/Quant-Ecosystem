// ============================================================================
// QuantCooks Studio (Phase 2 Unit 10) — Account / Credits / Profile.
// Pins group K's honesty rules (checklist #65–#68, specs §10, CP-1 §3.7):
//  - the balance view has NO numeric field — a fabricated balance is
//    structurally impossible, not just unprompted (Hook Score precedent);
//  - usage rows show the credit figure the backend RECORDED, verbatim
//    (exports: not charged; craft renders: creditCost + metering note);
//  - identity, followers, plans, promocode and publishing render honest
//    unavailable states — never an invented name, number, tier or form.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_PANELS,
  CREDIT_RULES,
  CREDIT_TOOLS,
  IDENTITY_VIEW,
  LEDGER_CONNECTION,
  PUBLISH_UNAVAILABLE_REASON,
  activityFromCraftRender,
  activityFromExportJob,
  activitySummary,
  isAccountPanelId,
  ledgerBalanceView,
  mergeActivity,
  profileProjectCards,
} from '../lib/studio/account';
import { AccountShell } from '../components/studio/AccountShell';
import { CreditsPanel } from '../components/studio/CreditsPanel';
import { UsagePanel } from '../components/studio/UsagePanel';
import { ProfilePage } from '../components/studio/ProfilePage';
import type { ServerCraftRenderJob, ServerExportJob, ServerProject } from '../services/api-client';

const exportJob = (patch: Partial<ServerExportJob>): ServerExportJob => ({
  id: 'exp-1',
  projectId: 'proj-1',
  format: 'mp4',
  resolution: '1080p',
  quality: 'high',
  status: 'COMPLETED',
  progress: 100,
  outputUrl: 'https://signed.example/export.mp4',
  error: null,
  createdAt: '2026-10-28T10:00:00.000Z',
  completedAt: '2026-10-28T10:01:00.000Z',
  ...patch,
});

const craftJob = (patch: Partial<ServerCraftRenderJob>): ServerCraftRenderJob => ({
  id: 'craft-1',
  projectId: 'proj-1',
  kind: 'CRAFT_RENDER',
  provider: 'effectcraft',
  comp: 'Lower Third',
  format: 'h264',
  resolution: 'half',
  quality: 'draft',
  status: 'COMPLETED',
  progress: 100,
  stage: null,
  creditCost: 0,
  metering: 'not_wired',
  outputAssetId: 'asset-9',
  outputUrl: 'https://signed.example/render.mp4',
  error: null,
  createdAt: '2026-10-28T11:00:00.000Z',
  completedAt: '2026-10-28T11:00:05.000Z',
  ...patch,
});

const project = (patch: Partial<ServerProject>): ServerProject => ({
  id: 'proj-1',
  userId: 'user-1',
  name: 'Monsoon Thali Film',
  type: 'video',
  createdAt: '2026-10-20T09:00:00.000Z',
  updatedAt: '2026-10-27T09:00:00.000Z',
  deletedAt: null,
  ...patch,
});

describe('account lib — panels and ledger', () => {
  it('lists the six account panels in the checklist order (row #65)', () => {
    expect(ACCOUNT_PANELS.map((p) => p.label)).toEqual([
      'Profile',
      'Credits & Plan',
      'Usage',
      'Brand Defaults',
      'Promocode',
      'Danger Zone',
    ]);
    expect(isAccountPanelId('credits')).toBe(true);
    expect(isAccountPanelId('nope')).toBe(false);
    expect(isAccountPanelId(undefined)).toBe(false);
  });

  it('models the ledger as not-configured with NO numeric balance field', () => {
    const view = ledgerBalanceView(LEDGER_CONNECTION);
    expect(view.kind).toBe('not_configured');
    expect(view.code).toBe('CREDITS_NOT_CONFIGURED');
    expect(view.tool).toBe(CREDIT_TOOLS.balance);
    // Structural honesty: no key that could carry a balance figure exists.
    expect(Object.keys(view).sort()).toEqual(['code', 'kind', 'tool']);
    expect(Object.values(view).some((v) => typeof v === 'number')).toBe(false);
  });

  it('carries the four anti-complaint standing rules as data', () => {
    expect(CREDIT_RULES.map((r) => r.id)).toEqual([
      'no-expiry',
      'auto-refund',
      'one-rule',
      'no-upsell',
    ]);
  });

  it('states plainly that identity has no client read today', () => {
    expect(IDENTITY_VIEW.kind).toBe('unavailable');
    expect(IDENTITY_VIEW.reason).toContain('no read inside this app yet');
  });
});

describe('account lib — activity rows show recorded truth only', () => {
  it('maps an export job as not charged (exports record no credit cost)', () => {
    const row = activityFromExportJob(exportJob({}));
    expect(row.charge.kind).toBe('not_charged');
    expect(row.charge.credits).toBeNull();
    expect(row.action).toBe('Export · mp4 1080p');
    expect(row.outputUrl).toBe('https://signed.example/export.mp4');
  });

  it('keeps a failed export’s real error and still claims no charge or refund', () => {
    const row = activityFromExportJob(
      exportJob({ status: 'FAILED', outputUrl: null, error: 'EXPORT_FORMAT_NOT_SUPPORTED' }),
    );
    expect(row.error).toBe('EXPORT_FORMAT_NOT_SUPPORTED');
    expect(row.charge.kind).toBe('not_charged');
    expect(row.outputUrl).toBeNull();
  });

  it('maps a craft render with its recorded creditCost verbatim (0 today)', () => {
    const row = activityFromCraftRender(craftJob({}));
    expect(row.charge).toMatchObject({ kind: 'recorded', credits: 0 });
    expect(row.charge.kind === 'recorded' && row.charge.note).toContain('no charge was made');
    expect(row.action).toContain('Lower Third');
    expect(row.outputAssetId).toBe('asset-9');
  });

  it('passes a non-zero recorded figure through untouched (no invention either way)', () => {
    const row = activityFromCraftRender(craftJob({ creditCost: 7 }));
    expect(row.charge).toMatchObject({ kind: 'recorded', credits: 7 });
  });

  it('merges sources newest-first and summarises from the real rows', () => {
    const rows = mergeActivity(
      [exportJob({}), exportJob({ id: 'exp-2', status: 'FAILED', createdAt: '2026-10-28T12:00:00.000Z' })],
      [craftJob({})],
    );
    expect(rows.map((r) => r.id)).toEqual(['exp-2', 'craft-1', 'exp-1']);
    expect(activitySummary(rows)).toEqual({ total: 3, completed: 2, failed: 1, inProgress: 0 });
  });
});

describe('account lib — profile cards', () => {
  it('links the real editor route and models Publish as unavailable with its reason', () => {
    const cards = profileProjectCards([project({})]);
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.editorHref).toBe('/editor?projectId=proj-1');
    expect(card.publish.available).toBe(false);
    expect(card.publish.reason).toBe(PUBLISH_UNAVAILABLE_REASON);
    expect(PUBLISH_UNAVAILABLE_REASON).toContain('update_project accepts only name and type');
  });
});

describe('CreditsPanel — the trust surface shows no number', () => {
  const html = renderToStaticMarkup(React.createElement(CreditsPanel));

  it('renders the CREDITS_NOT_CONFIGURED state and names all three twins', () => {
    expect(html).toContain('data-testid="credits-balance-not-configured"');
    expect(html).toContain('CREDITS_NOT_CONFIGURED');
    expect(html).toContain('quantcooks.get_credit_balance');
    expect(html).toContain('quantcooks.list_credit_history');
    expect(html).toContain('quantcooks.get_credit_quote');
  });

  it('renders NO balance figure anywhere — no value testid, no "N credits" claim', () => {
    expect(html).not.toContain('credits-balance-value');
    expect(html).not.toMatch(/>\s*\d[\d,]*\s+credits\s*</i);
    expect(html).not.toContain('credits remaining');
  });

  it('states all four standing rules', () => {
    for (const id of ['no-expiry', 'auto-refund', 'one-rule', 'no-upsell']) {
      expect(html).toContain(`data-testid="credit-rule-${id}"`);
    }
  });

  it('offers no invented plan table and no live top-up or budget form', () => {
    expect(html).toContain('data-testid="credits-plans-unavailable"');
    expect(html).toContain('data-testid="credits-budget-unavailable"');
    expect(html).toContain('data-testid="credits-topup-disabled"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<input');
  });
});

describe('UsagePanel — real job activity, honestly separated from the ledger', () => {
  it('renders loading, error (with the real message) and empty states', () => {
    const loading = renderToStaticMarkup(React.createElement(UsagePanel, { activityState: 'loading' }));
    expect(loading).toContain('data-testid="usage-loading"');
    const error = renderToStaticMarkup(
      React.createElement(UsagePanel, { activityState: 'error', activityError: 'Backend unreachable' }),
    );
    expect(error).toContain('data-testid="usage-error"');
    expect(error).toContain('Backend unreachable');
    const empty = renderToStaticMarkup(
      React.createElement(UsagePanel, { activityState: 'ready', rows: [] }),
    );
    expect(empty).toContain('data-testid="usage-empty"');
  });

  it('renders recorded costs verbatim: craft 0 + metering note, export not charged', () => {
    const rows = mergeActivity([exportJob({})], [craftJob({})]);
    const html = renderToStaticMarkup(React.createElement(UsagePanel, { activityState: 'ready', rows }));
    expect(html).toContain('0 credits recorded');
    expect(html).toContain('no charge was made');
    expect(html).toContain('data-testid="usage-charge-not-charged"');
    expect(html).toContain('Not charged');
    expect(html).toContain('href="https://signed.example/export.mp4"');
    expect(html).toContain('data-testid="usage-summary"');
  });

  it('shows a failed row’s real error', () => {
    const rows = mergeActivity(
      [],
      [craftJob({ status: 'FAILED', outputUrl: null, outputAssetId: null, error: 'RENDER_NO_OUTPUT' })],
    );
    const html = renderToStaticMarkup(React.createElement(UsagePanel, { activityState: 'ready', rows }));
    expect(html).toContain('RENDER_NO_OUTPUT');
  });

  it('keeps the ledger block separate and not-configured — no ledger rows exist', () => {
    const rows = mergeActivity([exportJob({})], []);
    const html = renderToStaticMarkup(React.createElement(UsagePanel, { activityState: 'ready', rows }));
    expect(html).toContain('data-testid="usage-ledger-not-configured"');
    expect(html).toContain('quantcooks.list_credit_history');
    expect(html).not.toContain('ledger-entry');
  });

  it('renders auto-publish as an OFF, disabled switch and no connected surfaces', () => {
    const html = renderToStaticMarkup(React.createElement(UsagePanel, { activityState: 'ready', rows: [] }));
    expect(html).toContain('data-testid="usage-autopublish-disabled"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('data-testid="usage-connections-none"');
    expect(html).toContain('Nothing is connected to this account today');
  });
});

describe('AccountShell — manage-account panels', () => {
  const shell = (patch: Partial<React.ComponentProps<typeof AccountShell>>) =>
    renderToStaticMarkup(
      React.createElement(AccountShell, {
        signedIn: true,
        brandKitsState: 'ready',
        brandKits: [],
        creditsPanel: React.createElement('div', { 'data-testid': 'marker-credits' }, 'CREDITS'),
        usagePanel: React.createElement('div', { 'data-testid': 'marker-usage' }, 'USAGE'),
        ...patch,
      }),
    );

  it('renders the six nav entries in checklist order', () => {
    const html = shell({});
    const ids = ['profile', 'credits', 'usage', 'brand-defaults', 'promocode', 'danger-zone'];
    const positions = ids.map((id) => html.indexOf(`data-testid="account-nav-${id}"`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('profile panel: identity unavailable, session stated, REAL sign-out control', () => {
    const html = shell({ initialPanel: 'profile' });
    expect(html).toContain('data-testid="account-identity-unavailable"');
    expect(html).toContain('You are signed in with your Quant Account');
    expect(html).toContain('data-testid="account-sign-out"');
    const signedOut = shell({ initialPanel: 'profile', signedIn: false });
    expect(signedOut).toContain('You are not signed in');
    expect(signedOut).not.toContain('account-sign-out');
  });

  it('credits and usage panels render the nodes the page hands in', () => {
    expect(shell({ initialPanel: 'credits' })).toContain('data-testid="marker-credits"');
    expect(shell({ initialPanel: 'usage' })).toContain('data-testid="marker-usage"');
  });

  it('brand defaults: real kits with the recorded default marked; honest empty/loading', () => {
    const populated = shell({
      initialPanel: 'brand-defaults',
      brandKits: [
        { id: 'k1', name: 'Monsoon Kitchen', isDefault: true },
        { id: 'k2', name: 'Café Brunch', isDefault: false },
      ],
    });
    expect(populated).toContain('Monsoon Kitchen');
    expect(populated).toContain('data-testid="brand-defaults-default"');
    expect(shell({ initialPanel: 'brand-defaults', brandKits: [] })).toContain(
      'data-testid="brand-defaults-empty"',
    );
    expect(shell({ initialPanel: 'brand-defaults', brandKitsState: 'loading' })).toContain(
      'data-testid="brand-defaults-loading"',
    );
  });

  it('promocode panel contains NO form control at all — no fake redemption box', () => {
    const html = shell({ initialPanel: 'promocode' });
    expect(html).toContain('data-testid="account-promocode-unavailable"');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<form');
  });

  it('danger zone states consequences first and disables both actions with reasons', () => {
    const html = shell({ initialPanel: 'danger-zone' });
    expect(html).toContain('data-testid="danger-delete-disabled"');
    expect(html).toContain('data-testid="danger-cancel-disabled"');
    expect(html).toContain('cannot be undone');
    expect(html).toContain('no paid QuantCooks plan on this account to cancel');
  });
});

describe('ProfilePage — public face with an honest social layer', () => {
  const page = (patch: Partial<React.ComponentProps<typeof ProfilePage>>) =>
    renderToStaticMarkup(
      React.createElement(ProfilePage, {
        handle: 'chef-asha',
        signedIn: true,
        projectsState: 'ready',
        projects: [project({})],
        ...patch,
      }),
    );

  it('shows the handle but NO identity, follower numbers or featured project', () => {
    const html = page({});
    expect(html).toContain('@chef-asha');
    expect(html).toContain('data-testid="profile-identity-unavailable"');
    expect(html).toContain('data-testid="profile-social-unavailable"');
    expect(html).toContain('data-testid="profile-featured-unavailable"');
    expect(html).not.toMatch(/\d+\s*followers/i);
    expect(html).not.toMatch(/\d+\s*following/i);
  });

  it('renders the caller’s real project grid with editor links and disabled Publish', () => {
    const html = page({});
    expect(html).toContain('Monsoon Thali Film');
    expect(html).toContain('href="/editor?projectId=proj-1"');
    expect(html).toContain('data-testid="profile-publish-disabled"');
    expect(html).toContain('visible only to you today');
    expect(html).toContain('update_project accepts only name and type');
  });

  it('signed-out visitors get no grid; loading/error/empty states are explicit', () => {
    const signedOut = page({ signedIn: false });
    expect(signedOut).toContain('data-testid="profile-grid-signed-out"');
    expect(signedOut).not.toContain('Monsoon Thali Film');
    expect(page({ projectsState: 'loading' })).toContain('data-testid="profile-grid-loading"');
    expect(page({ projectsState: 'error', projectsError: 'boom' })).toContain('boom');
    expect(page({ projects: [] })).toContain('data-testid="profile-grid-empty"');
  });
});
