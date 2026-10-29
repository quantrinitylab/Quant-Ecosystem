// @vitest-environment jsdom
// ============================================================================
// Templates picker Escape dismissal (fix/qm-templates-escape-close).
//
// Finding: the Templates picker (drawer and portaled popover variants) did
// not close on Escape — only the backdrop click or the X button dismissed
// it, because EmailTemplates had no keydown/Escape handling at all.
//
// These tests drive the REAL component (not a mock) in jsdom: render it
// open, dispatch real KeyboardEvents, and assert onClose fires exactly for
// Escape — and only while the picker is open.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

let container: HTMLDivElement;
let root: Root | null;

async function renderPicker(props: { isOpen: boolean; onClose: () => void }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <EmailTemplates
        isOpen={props.isOpen}
        onClose={props.onClose}
        onSelectTemplate={() => {}}
      />,
    );
  });
  // Let the mocked template load settle inside act, so its setState calls
  // never leak into a later test as an "not wrapped in act" warning.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function pressEscape(target: EventTarget = document) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
  });
}

function pressKey(key: string, target: EventTarget = document) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
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

describe('EmailTemplates Escape dismissal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Escape while open calls onClose', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: true, onClose });
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape while focus is in the picker search field still closes it', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: true, onClose });
    const search = container.querySelector('input[type="search"]');
    expect(search, 'picker renders a search field').not.toBeNull();
    pressEscape(search!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a non-Escape key does not close the picker', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: true, onClose });
    pressKey('Enter');
    pressKey('a');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape does nothing while the picker is closed (no stray listener)', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: false, onClose });
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the listener is removed on unmount, so later Escape presses stay inert', async () => {
    const onClose = vi.fn();
    await renderPicker({ isOpen: true, onClose });
    act(() => {
      root!.unmount();
    });
    root = null;
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });
});
