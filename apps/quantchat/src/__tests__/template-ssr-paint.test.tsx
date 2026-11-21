// @vitest-environment jsdom
// QC-F-014 — static pages must paint before hydration.
//
// Root cause: src/app/template.tsx wrapped EVERY route (including fully
// static public pages like /support, /privacy, /terms) in a client
// motion.div with initial="initial". framer-motion SSRs the `initial`
// variant as an inline `opacity:0` style, so the server-delivered HTML
// was invisible until the JS bundle loaded, hydrated, and ran the enter
// animation — a blank page for seconds on slow loads (the live-audit
// symptom was "static pages paint skeletons / load ~8.5s").
//
// The fix enables the transition only after client mount
// (initial={animated ? 'initial' : false}); SSR + hydration therefore
// render with NO invisible inline style. These tests lock that in:
//
//  1. SSR of the real Template component contains no `opacity:0`.
//  2. The old code (initial="initial") WOULD fail test 1 — verified as
//     the negative control by stashing the fix (see build-QC-F-014.md).
//  3. Client mount keeps the transition contract: after effects flush,
//     children stay mounted and visible (no remount, no flash).
//
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import Template from '../app/template';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(ui);
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe('QC-F-014 template SSR paint', () => {
  it('SSR HTML has no invisible initial style — static pages paint before hydration', () => {
    const html = renderToString(
      <Template>
        <h1>Support</h1>
      </Template>,
    );
    expect(html).toContain('Support');
    // The old code SSR'd style="opacity:0;transform:..." (initial variant).
    expect(html).not.toMatch(/opacity:\s*0(?![\d.])/);
  });

  it('client mount keeps children mounted and visible (no remount flash)', () => {
    const el = mount(
      <Template>
        <h1 data-testid="page-title">Support</h1>
      </Template>,
    );
    const title = el.querySelector('[data-testid="page-title"]');
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe('Support');
    // The wrapper must not carry an invisible inline style after mount.
    const wrapper = el.firstElementChild as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper!.style.opacity).not.toBe('0');
  });
});
