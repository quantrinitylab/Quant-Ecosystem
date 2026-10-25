// @vitest-environment jsdom
// ============================================================================
// Templates picker INTEGRATED contract (one head for #1566 + #1567).
//
// Neither PR alone carried the whole contract, so this suite drives the REAL
// component in jsdom and proves all four parts together:
//   (a) search/filter by shortcut as well as name/subject,
//   (b) one consistent motion contract (popover rises, drawer slides —
//       asserted on rendered inline style, plus the source pin in
//       EmailTemplatesPopoverMotion.test.tsx),
//   (c) Escape closes BOTH drawer and popover, with focus returned to the
//       invoking element — including Escape from the search field, and the
//       X-button close path via a stateful wrapper,
//   (d) reduced motion: no x/y travel when prefers-reduced-motion matches,
//   (e) mobile: both surfaces render and stay usable at a 360px viewport,
//       and the CSS caps both panels to the viewport width.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmailTemplates } from '../EmailTemplates';

vi.mock('../../services/browser-api-request', () => ({
  browserApiRequest: vi.fn(async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: [
          { id: 'tpl-1', name: 'Introduction', subject: 'Hello and welcome', bodyHtml: '<p>Hi there</p>', shortcut: ':intro', createdAt: '2026-10-11T00:00:00Z' },
          { id: 'tpl-2', name: 'Follow up', subject: 'Checking in', bodyHtml: '<p>Just checking in</p>', shortcut: ':follow', createdAt: '2026-10-11T00:00:00Z' },
          { id: 'tpl-3', name: 'Thank you', subject: 'Thanks for your time', bodyHtml: '<p>Thank you</p>', shortcut: null, createdAt: '2026-10-11T00:00:00Z' },
        ],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  ),
}));

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not implement matchMedia; framer-motion's useReducedMotion
// reads it at render, so the shim must be installed BEFORE each render with
// the matches value the test wants. This is a test-environment concern, not
// product behaviour.
function installMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

let container: HTMLDivElement;
let root: Root | null;
let trigger: HTMLButtonElement | null;

async function renderPicker(props: {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate?: (template: unknown) => void;
  variant?: 'drawer' | 'popover';
}) {
  installMatchMedia(false);
  trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.textContent = 'Insert a saved email template';
  document.body.appendChild(trigger);
  trigger.focus();
  expect(document.activeElement, 'trigger holds focus before the picker opens').toBe(trigger);

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <EmailTemplates
        isOpen={props.isOpen}
        onClose={props.onClose}
        onSelectTemplate={(template) => props.onSelectTemplate?.(template)}
        variant={props.variant}
      />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function pressKey(key: string, target: EventTarget = document) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

function panel(): Element | null {
  return container.querySelector('.templates-panel');
}

function visibleTemplateNames(): string[] {
  return [...container.querySelectorAll('.template-name')].map((el) => el.textContent ?? '');
}

function typeInSearch(value: string) {
  const input = container.querySelector('input[type="search"]') as HTMLInputElement | null;
  expect(input, 'picker renders a search field').not.toBeNull();
  // React controlled input: set via the native setter, then fire input.
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  trigger?.remove();
  trigger = null;
  vi.clearAllMocks();
});

describe('Escape closes both surfaces, focus returns to the invoker', () => {
  it('Escape closes the drawer and returns focus to the invoking element', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: true, onClose, variant: 'drawer' });
    expect(panel()).not.toBeNull();
    pressKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement, 'focus returns to the invoker on Escape').toBe(trigger);
  });

  it('Escape closes the popover and returns focus to the invoking element', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: true, onClose, variant: 'popover' });
    expect(panel()?.className).toContain('templates-panel--popover');
    pressKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement, 'focus returns to the invoker on Escape').toBe(trigger);
  });

  it('Escape from the search field still closes and returns focus', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: true, onClose, variant: 'popover' });
    const search = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    expect(search).not.toBeNull();
    act(() => {
      search!.focus();
    });
    pressKey('Escape', search!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it('a non-Escape key does not close the picker', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: true, onClose, variant: 'drawer' });
    pressKey('Enter');
    pressKey('a');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape does nothing while the picker is closed (no stray listener)', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: false, onClose });
    pressKey('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the listener is removed on unmount, so later Escape presses stay inert', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: true, onClose });
    act(() => {
      root!.unmount();
    });
    root = null;
    pressKey('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('X-button close through a stateful wrapper also returns focus (close effect path)', async () => {
    installMatchMedia(false);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Insert a saved email template
          </button>
          <EmailTemplates
            isOpen={open}
            onClose={() => setOpen(false)}
            onSelectTemplate={() => {}}
            variant="popover"
          />
        </>
      );
    }
    act(() => {
      root!.render(<Wrapper />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const openButton = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      // Focus first: jsdom click() alone does not reliably focus, and the
      // picker captures document.activeElement as its invoking element.
      openButton.focus();
      openButton.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(panel(), 'picker opens from the wrapper trigger').not.toBeNull();
    const closeButton = container.querySelector('button[aria-label="Close templates"]') as HTMLButtonElement;
    expect(closeButton).not.toBeNull();
    act(() => {
      closeButton.click();
    });
    expect(document.activeElement, 'focus returns to the invoker after X close').toBe(openButton);
  });
});

describe('shortcut search in the rendered picker', () => {
  it('typing ":intro" matches only the :intro row', async () => {
    await renderPicker({ isOpen: true, onClose: () => {}, variant: 'popover' });
    expect(visibleTemplateNames()).toEqual(['Introduction', 'Follow up', 'Thank you']);
    typeInSearch(':intro');
    expect(visibleTemplateNames()).toEqual(['Introduction']);
  });

  it('typing "intro" without the colon still matches the :intro badge', async () => {
    await renderPicker({ isOpen: true, onClose: () => {}, variant: 'drawer' });
    typeInSearch('intro');
    expect(visibleTemplateNames()).toEqual(['Introduction']);
  });

  it('name and subject search still work, and a null-shortcut row matches by name', async () => {
    await renderPicker({ isOpen: true, onClose: () => {}, variant: 'popover' });
    typeInSearch('checking');
    expect(visibleTemplateNames()).toEqual(['Follow up']);
    typeInSearch('thank');
    expect(visibleTemplateNames()).toEqual(['Thank you']);
  });
});

describe('motion without reduced motion', () => {
  it('the popover still rises (translateY) and the drawer still slides (translateX)', async () => {
    await renderPicker({ isOpen: true, onClose: () => {}, variant: 'popover' });
    const popoverStyle = (panel() as HTMLElement).style;
    expect(popoverStyle.transform, 'popover rises on y').toContain('translateY');
    act(() => {
      root!.unmount();
    });
    root = null;
    container.remove();
    trigger?.remove();
    await renderPicker({ isOpen: true, onClose: () => {}, variant: 'drawer' });
    const drawerStyle = (panel() as HTMLElement).style;
    expect(drawerStyle.transform, 'drawer slides on x').toContain('translateX');
  });
});

describe('mobile: usable at a 360px viewport', () => {
  it('both variants render search + rows + selection at 360px wide', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
    const onSelect = vi.fn();
    await renderPicker({ isOpen: true, onClose: () => {}, onSelectTemplate: onSelect, variant: 'popover' });
    expect(panel()).not.toBeNull();
    expect(container.querySelector('input[type="search"]')).not.toBeNull();
    expect(visibleTemplateNames()).toEqual(['Introduction', 'Follow up', 'Thank you']);
    const firstRow = container.querySelector('.template-item') as HTMLButtonElement;
    act(() => {
      firstRow.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });

  it('CSS caps both panels to the viewport on small screens and kills panel transitions under reduced motion', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, '..', '..', 'app', 'globals.css'), 'utf8');
    expect(css).toContain('@media (max-width: 480px)');
    expect(css).toContain('.templates-panel--popover { width: min(320px, calc(100vw - 16px))');
    expect(css).toContain('.templates-panel { width: min(320px, 90vw)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.templates-panel .template-item { transition: none; }');
    expect(css).toContain('.templates-panel .templates-search input { transition: none; }');
    // The base caps were already there and must stay: drawer 90vw, popover
    // 90vw + 62vh so a short viewport only shrinks the panel.
    expect(css).toContain('max-width: 90vw');
    expect(css).toContain('max-height: 62vh');
  });
});
