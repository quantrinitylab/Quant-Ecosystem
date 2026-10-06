// ============================================================================
// Quanty Connectors — ConnectorsScreen component tests.
// Uses createRoot + act (repo pattern) with an injected mock fetch.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConnectorsScreen } from '../components/connectors/ConnectorsScreen';
import type { FetchImpl } from '../components/connectors/ConnectorDetailSheet';

// Enable React 19 act environment in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Mock fetch: catalog OK, connections = browser connected, backend not ready. */
function makeMockFetch(overrides?: {
  connections?: any;
  connect?: { status: number; body: any };
}): FetchImpl {
  const calls: string[] = [];
  const impl = (async (input: any, init?: any) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.endsWith('/api/quanty/mcp/catalog')) {
      return jsonResponse({
        providers: [
          { id: 'browser', name: 'Browser', icon: 'globe', category: 'Built-in', description: 'Browse the web', authType: 'BUILTIN' },
          { id: 'github', name: 'GitHub', icon: 'github', category: 'Developer', description: 'Code', authType: 'OAUTH2' },
          { id: 'device-calendar', name: 'Calendar', icon: 'calendar', category: 'Device', description: 'On-device', authType: 'DEVICE', deviceSource: true },
        ],
      });
    }
    if (url.endsWith('/api/quanty/mcp/connections')) {
      return jsonResponse(
        overrides?.connections ?? {
          connections: [
            { provider: 'browser', status: 'connected', connectedAt: null, scopes: ['browse:read'], via: 'oauth' },
          ],
          backendReady: false,
        },
      );
    }
    const connectMatch = url.match(/\/api\/quanty\/mcp\/connect\/([^/]+)$/);
    if (connectMatch && (init?.method ?? 'GET') === 'POST') {
      const { status, body } = overrides?.connect ?? { status: 200, body: { authorizeUrl: 'https://oauth.example/authorize?x=1', state: 's' } };
      return jsonResponse(body, status);
    }
    const discMatch = url.match(/\/api\/quanty\/mcp\/disconnect\/([^/]+)$/);
    if (discMatch && (init?.method ?? 'GET') === 'POST') {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ ok: false }, 404);
  }) as unknown as FetchImpl;
  (impl as any).calls = calls;
  return impl;
}

describe('ConnectorsScreen', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container?.parentNode) container.parentNode.removeChild(container);
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  async function renderScreen(fetchImpl: FetchImpl) {
    await act(async () => {
      root!.render(React.createElement(ConnectorsScreen, { fetchImpl }));
    });
    // flush pending promises from the loading effect
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  function text(): string {
    return container!.textContent ?? '';
  }

  function queryAll(sel: string): NodeListOf<Element> {
    return container!.querySelectorAll(sel);
  }

  it('renders the header, search, and Connected/Available sections', async () => {
    await renderScreen(makeMockFetch());
    expect(text()).toContain('Connectors');
    expect(text()).toContain('Connected');
    expect(text()).toContain('Available');
    expect(container!.querySelector('[data-testid="connectors-connected"]')).toBeTruthy();
    expect(container!.querySelector('[data-testid="connectors-available"]')).toBeTruthy();
    // Browser is connected; GitHub is available.
    expect(container!.querySelector('[data-testid="connector-row-browser"]')).toBeTruthy();
    expect(container!.querySelector('[data-testid="connector-row-github"]')).toBeTruthy();
  });

  it('shows device-source providers under "From this device" with honest Coming soon', async () => {
    await renderScreen(makeMockFetch());
    const deviceSection = container!.querySelector('[data-testid="connectors-device"]');
    expect(deviceSection).toBeTruthy();
    expect(deviceSection!.textContent).toContain('From this device');
    expect(deviceSection!.textContent).toContain('Coming soon');
    // No Connect button for device rows.
    const deviceRow = container!.querySelector('[data-testid="connector-row-device-calendar"]');
    expect(deviceRow!.textContent).not.toContain('Connect');
  });

  it('search filters the provider list', async () => {
    await renderScreen(makeMockFetch());
    const input = container!.querySelector('input[aria-label="Search connectors"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    await act(async () => {
      // Simulate typing via native setter + input event.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'git');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    // GitHub visible; Browser row filtered out of sections.
    expect(container!.querySelector('[data-testid="connector-row-github"]')).toBeTruthy();
    expect(container!.querySelector('[data-testid="connector-row-browser"]')).toBeFalsy();

    // A query matching nothing shows the honest empty state.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'zzz-no-such-connector');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container!.querySelector('[data-testid="connector-row-github"]')).toBeFalsy();
    expect(text()).toContain('No connectors match');
  });

  it('tapping a connected row opens the detail sheet with scopes and tools', async () => {
    await renderScreen(makeMockFetch());
    const row = container!.querySelector(
      '[data-testid="connector-row-browser"] button[aria-label="Open Browser details"]',
    ) as HTMLButtonElement;
    expect(row).toBeTruthy();
    await act(async () => {
      row.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    const sheet = container!.querySelector('[data-testid="connector-sheet-browser"]');
    expect(sheet).toBeTruthy();
    expect(sheet!.textContent).toContain('Connected');
    expect(sheet!.textContent).toContain('Access requested');
    expect(sheet!.textContent).toContain('Tools Quanty can use');
  });

  it('connect flow redirects to the authorize URL on success', async () => {
    const fetchImpl = makeMockFetch();
    await renderScreen(fetchImpl);
    // Open GitHub detail via its Connect button (opens sheet first).
    const connectBtn = Array.from(
      container!.querySelectorAll('[data-testid="connector-row-github"] button'),
    ).find((b) => b.textContent === 'Connect') as HTMLButtonElement;
    expect(connectBtn).toBeTruthy();

    const origLocation = window.location;
    let redirectedTo: string | null = null;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...origLocation, set href(v: string) { redirectedTo = v; }, get href() { return redirectedTo ?? origLocation.href; } },
    });
    try {
      await act(async () => {
        connectBtn.click();
        await new Promise((r) => setTimeout(r, 0));
      });
      const sheetBtn = container!.querySelector(
        '[data-testid="connector-sheet-github"] button',
      ) as HTMLButtonElement;
      // Find the "Connect GitHub" button inside the sheet.
      const buttons = Array.from(
        container!.querySelectorAll('[data-testid="connector-sheet-github"] button'),
      );
      const doConnect = buttons.find((b) => b.textContent?.startsWith('Connect GitHub')) as HTMLButtonElement;
      expect(doConnect).toBeTruthy();
      await act(async () => {
        doConnect.click();
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(redirectedTo).toBe('https://oauth.example/authorize?x=1');
      expect((fetchImpl as any).calls.some((c: string) => c.includes('/api/quanty/mcp/connect/github'))).toBe(true);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: origLocation });
    }
  });

  it('connect flow shows an honest error when the backend is not configured (501)', async () => {
    const fetchImpl = makeMockFetch({
      connect: {
        status: 501,
        body: { ok: false, error: { code: 'MCP_BACKEND_UNAVAILABLE', message: 'The connector service is not configured yet. coming soon.' } },
      },
    });
    await renderScreen(fetchImpl);
    const connectBtn = Array.from(
      container!.querySelectorAll('[data-testid="connector-row-github"] button'),
    ).find((b) => b.textContent === 'Connect') as HTMLButtonElement;
    await act(async () => {
      connectBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    const buttons = Array.from(
      container!.querySelectorAll('[data-testid="connector-sheet-github"] button'),
    );
    const doConnect = buttons.find((b) => b.textContent?.startsWith('Connect GitHub')) as HTMLButtonElement;
    await act(async () => {
      doConnect.click();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    const sheet = container!.querySelector('[data-testid="connector-sheet-github"]');
    // Honest error surfaced in the sheet; never a fake success.
    expect(sheet!.textContent).toMatch(/not configured yet|coming soon/i);
  });

  it('disconnect moves the row from Connected to Available', async () => {
    // Start with github connected.
    let githubConnected = true;
    const fetchImpl = (async (input: any, init?: any) => {
      const url = String(input);
      if (url.endsWith('/api/quanty/mcp/catalog')) {
        return jsonResponse({
          providers: [
            { id: 'github', name: 'GitHub', icon: 'github', category: 'Developer', description: 'Code', authType: 'OAUTH2' },
          ],
        });
      }
      if (url.endsWith('/api/quanty/mcp/connections')) {
        return jsonResponse({
          connections: githubConnected
            ? [{ provider: 'github', status: 'connected', connectedAt: '2026-10-06T00:00:00Z', scopes: ['repo'], via: 'oauth' }]
            : [],
          backendReady: true,
        });
      }
      if (url.includes('/api/quanty/mcp/disconnect/github')) {
        githubConnected = false;
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ ok: false }, 404);
    }) as unknown as FetchImpl;

    await renderScreen(fetchImpl);
    expect(container!.querySelector('[data-testid="connectors-connected"] [data-testid="connector-row-github"]')).toBeTruthy();

    // Open detail sheet.
    const openBtn = container!.querySelector(
      '[data-testid="connector-row-github"] button[aria-label="Open GitHub details"]',
    ) as HTMLButtonElement;
    await act(async () => {
      openBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    const disconnectBtn = Array.from(
      container!.querySelectorAll('[data-testid="connector-sheet-github"] button'),
    ).find((b) => b.textContent === 'Disconnect') as HTMLButtonElement;
    expect(disconnectBtn).toBeTruthy();
    await act(async () => {
      disconnectBtn.click();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    // Row moved to Available.
    expect(container!.querySelector('[data-testid="connectors-connected"] [data-testid="connector-row-github"]')).toBeFalsy();
    expect(container!.querySelector('[data-testid="connectors-available"] [data-testid="connector-row-github"]')).toBeTruthy();
  });
});
