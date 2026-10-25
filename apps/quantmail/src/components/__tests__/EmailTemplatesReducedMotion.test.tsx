// @vitest-environment jsdom
// ============================================================================
// Templates picker under prefers-reduced-motion (integrated head #1566+#1567).
//
// This file is SEPARATE from EmailTemplatesIntegrated.test.tsx on purpose:
// framer-motion v11's useReducedMotion lazily initializes its module-level
// preference exactly once, on the first render that calls it, and never
// re-reads matchMedia afterwards. A single file cannot lock it to false for
// the normal-motion tests and then re-lock it to true — so the reduced
// tests live here, where the matches:true shim is installed at module top
// before any render, i.e. the same way a real session has one fixed
// preference from first paint. (The bare "(prefers-reduced-motion)" query
// framer-motion uses is correct per Media Queries 5: no-preference
// evaluates as false in boolean context, reduce as true.)
//
// Each test renders the REAL component and asserts on its rendered inline
// style: no translate on either variant when reduced motion is preferred.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EmailTemplates } from '../EmailTemplates';

vi.mock('../../services/browser-api-request', () => ({
  browserApiRequest: vi.fn(async () =>
    new Response(JSON.stringify({ success: true, data: [] }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
}));

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not implement matchMedia; install the reduced-motion shim at
// module top, before the first render locks framer-motion's preference.
window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

let container: HTMLDivElement;
let root: Root | null;

async function renderPicker(variant: 'drawer' | 'popover') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <EmailTemplates isOpen onClose={() => {}} onSelectTemplate={() => {}} variant={variant} />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  vi.clearAllMocks();
});

describe('reduced motion: no travel on either variant', () => {
  it('popover under prefers-reduced-motion has no translate in its inline style', async () => {
    await renderPicker('popover');
    const panel = container.querySelector('.templates-panel') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.style.transform, 'reduced-motion popover must not translate').not.toContain('translate');
  });

  it('drawer under prefers-reduced-motion has no translate in its inline style', async () => {
    await renderPicker('drawer');
    const panel = container.querySelector('.templates-panel') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.style.transform, 'reduced-motion drawer must not translate').not.toContain('translate');
  });
});
