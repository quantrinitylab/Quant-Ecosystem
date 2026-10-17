import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MCPRegistryTab, OFFICIAL_MCP_CATALOG } from '../components/MCPRegistryTab';

// QM-UIUX-068 — the MCP registry has no install API, so it must never fake
// one: no fabricated install counts, no claimed "Installed" state, and no
// button that merely toggles local component state.

describe('QM-UIUX-068: MCP registry install honesty', () => {
  it('renders no fabricated install counts', () => {
    const html = renderToStaticMarkup(<MCPRegistryTab />);
    expect(html).not.toContain('installs');
    expect(html).not.toContain('186,715');
    expect(html).not.toContain('186715');
    expect(html).not.toContain('52,551');
  });

  it('claims no server is installed — catalog carries no installed state', () => {
    for (const entry of OFFICIAL_MCP_CATALOG) {
      expect('isInstalled' in entry).toBe(false);
    }
    const html = renderToStaticMarkup(<MCPRegistryTab />);
    expect(html).not.toContain('Installed');
  });

  it('install control is an honest disabled "Install unavailable" state, one per server', () => {
    const html = renderToStaticMarkup(<MCPRegistryTab />);
    const unavailableCount = html.split('Install unavailable').length - 1;
    expect(unavailableCount).toBe(OFFICIAL_MCP_CATALOG.length);
    // Every install control is disabled — none is a clickable fake toggle.
    const buttonTags = html.match(/<button[^>]*>/g) ?? [];
    const installButtons = buttonTags.filter((tag) => !tag.includes('capitalize'));
    for (const tag of installButtons) {
      expect(tag).toContain('disabled');
    }
    // No enabled button offers an Install action.
    expect(html).not.toContain('>Install<');
  });
});
