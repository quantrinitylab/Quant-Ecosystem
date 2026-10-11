import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ECOSYSTEM_APPS } from '../ecosystem-apps';
import { EcosystemAppsPanel } from '../EcosystemAppsPanel';
import { MoreAppsMenu } from '../MoreAppsMenu';

// Switcher discoverability (2026-10-11): the "More apps" overflow gives
// QuantChat/QuantAI a deliberate, user-triggered entry point in the QuantMail
// switcher — replacing the phantom spontaneous "More from QUANTRINITY" panel
// from the customer audit, which had no reproducible trigger.
// renderToStaticMarkup runs no effects, so open-state interaction (toggle,
// Esc, backdrop) is exercised structurally: closed renders the trigger only.

describe('ECOSYSTEM_APPS directory', () => {
  it('lists QuantChat and QuantAI with their verified production URLs', () => {
    const byId = Object.fromEntries(ECOSYSTEM_APPS.map((a) => [a.id, a]));
    expect(byId.quantchat.url).toBe('https://quantchat.quantrinity.in');
    expect(byId.quantai.url).toBe('https://quantai.quantrinity.in');
  });

  it('every entry is https and has an honest label + tagline', () => {
    expect(ECOSYSTEM_APPS.length).toBeGreaterThan(0);
    for (const app of ECOSYSTEM_APPS) {
      expect(app.url.startsWith('https://')).toBe(true);
      expect(app.label.length).toBeGreaterThan(0);
      expect(app.tagline.length).toBeGreaterThan(0);
    }
  });
});

describe('EcosystemAppsPanel', () => {
  it('renders the deliberate panel with a link per ecosystem app', () => {
    const html = renderToStaticMarkup(<EcosystemAppsPanel />);
    expect(html).toContain('data-testid="ecosystem-apps-panel"');
    expect(html).toContain('More from QUANTRINITY');
    expect(html).toContain('role="menu"');
    expect(html).toContain('data-testid="ecosystem-app-quantchat"');
    expect(html).toContain('data-testid="ecosystem-app-quantai"');
    expect(html).toContain('href="https://quantchat.quantrinity.in"');
    expect(html).toContain('href="https://quantai.quantrinity.in"');
    expect(html).toContain('role="menuitem"');
    // Honest copy: every row says where it goes.
    expect(html).toContain('Open QuantChat');
    expect(html).toContain('Open QuantAI');
  });

  it('uses no divider lines between rows (UI rule: spacing only)', () => {
    const html = renderToStaticMarkup(<EcosystemAppsPanel />);
    expect(html).not.toContain('<hr');
    expect(html).not.toContain('divide-');
  });
});

describe('MoreAppsMenu', () => {
  it('renders a discoverable trigger button and no panel while closed', () => {
    const html = renderToStaticMarkup(
      <MoreAppsMenu align="left" buttonTestId="test-more-apps" />,
    );
    expect(html).toContain('data-testid="test-more-apps"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    // The accessible name must name the reachable apps (the discoverability fix).
    expect(html).toContain('More Quant apps');
    expect(html).toContain('QuantChat');
    expect(html).toContain('QuantAI');
    // Closed: nothing spontaneous.
    expect(html).not.toContain('data-testid="ecosystem-apps-panel"');
    expect(html).not.toContain('data-testid="more-apps-backdrop"');
  });
});
