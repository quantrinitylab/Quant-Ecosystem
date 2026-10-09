// @vitest-environment jsdom
// ============================================================================
// QM-UIUX-083 — regression tests for PR #731.
//
// Before #731, DockedComposer's two X buttons (expanded header X and the
// minimized badge X) called onClose() directly: a composer with typed content
// vanished with NO confirmation. Only the footer Discard (trash) button asked
// first. #731 routed every close affordance through the shared
// requestCloseComposer handler — dirty draft -> the branded "Discard draft?"
// confirmation must be answered before anything is discarded; clean draft ->
// closes immediately, no dialog.
//
// Follow-up to #731: the minimized badge branch never mounted the shared
// {confirmDialog} element, so a badge-X click on a dirty draft produced NO
// visible response — confirm()'s promise stayed pending until the composer
// happened to be restored. The follow-up fix renders the dialog in the
// minimized branch too; test (b) pins the corrected behaviour (dialog
// visible immediately, in the minimized state).
//
// These tests render the REAL component and drive the REAL buttons/inputs,
// asserting only observable behaviour: dialog presence, onClose/onDiscard
// call counts, and that typed content survives a cancelled close.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DockedComposer } from '../DockedComposer';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// jsdom does not implement matchMedia; framer-motion's useReducedMotion (used
// by ConfirmDialog) probes it. Environment shim only — no behaviour mocked.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// --- Harness mocks (same set as DockedComposerGestures.test.tsx, plus the ---
// --- draft-save network call so no real request can leave the test).     ---
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('../InboxToast', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../hooks/useContacts', () => ({
  useContacts: () => ({ data: [] }),
}));

vi.mock('../../services/api-client', () => ({
  apiClient: {},
}));

vi.mock('../UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: vi.fn() }),
}));

vi.mock('../../lib/email-body', () => ({
  composeMessageBodies: (text: string) => ({ bodyText: text, bodyHtml: text }),
  adjustRangesForEdit: () => [],
  applyInlineFormat: (ranges: unknown) => ranges,
}));

vi.mock('../../lib/email-signature-preference', () => ({
  loadDefaultSignatureHtml: async () => '',
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(async () => ({})),
}));

// ---------------------------------------------------------------------------
// Render / interaction helpers
// ---------------------------------------------------------------------------

interface Harness {
  container: HTMLDivElement;
  root: Root;
  onClose: ReturnType<typeof vi.fn>;
  onDiscard: ReturnType<typeof vi.fn>;
}

const mounted: Harness[] = [];

function renderComposer(): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  const onDiscard = vi.fn();
  act(() => {
    root.render(
      <DockedComposer isOpen={true} onClose={onClose} onDiscard={onDiscard} />
    );
  });
  const harness = { container, root, onClose, onDiscard };
  mounted.push(harness);
  return harness;
}

afterEach(() => {
  while (mounted.length > 0) {
    const h = mounted.pop()!;
    act(() => {
      h.root.unmount();
    });
    h.container.remove();
  }
  document.body.innerHTML = '';
});

/** Let pending promises and framer-motion exit animations settle. */
async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function buttonByLabel(scope: ParentNode, label: string): HTMLButtonElement {
  const btn = scope.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  );
  if (!btn) throw new Error(`button[aria-label="${label}"] not found`);
  return btn;
}

function subjectInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    '#docked-composer-subject'
  );
  if (!input) throw new Error('subject input not found');
  return input;
}

/** Type into a controlled React input the way a real keystroke would land. */
async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    'value'
  )?.set;
  if (!setter) throw new Error('native value setter unavailable');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function dialogEl(container: HTMLElement): Element | null {
  return container.querySelector('[role="dialog"]');
}

function dialogButton(container: HTMLElement, text: string): HTMLButtonElement {
  const dialog = dialogEl(container);
  if (!dialog) throw new Error('confirm dialog not open');
  const btn = Array.from(dialog.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text
  );
  if (!btn) throw new Error(`dialog button "${text}" not found`);
  return btn as HTMLButtonElement;
}

async function makeDirty(container: HTMLElement): Promise<void> {
  await typeInto(subjectInput(container), 'Quarterly numbers');
  expect(subjectInput(container).value).toBe('Quarterly numbers');
}

// ---------------------------------------------------------------------------
// QM-UIUX-083 regression suite
// ---------------------------------------------------------------------------

describe('DockedComposer close confirmation (QM-UIUX-083)', () => {
  it('(a) dirty composer + header X shows the Discard confirmation and does NOT close or discard', async () => {
    const { container, onClose, onDiscard } = renderComposer();
    await makeDirty(container);

    await click(buttonByLabel(container, 'Close composer'));
    await flush();

    const dialog = dialogEl(container);
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Discard draft?');
    // Nothing was thrown away behind the dialog's back.
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Composer is still on screen with the typed content intact.
    expect(
      container.querySelector('[data-testid="docked-composer"]')
    ).not.toBeNull();
    expect(subjectInput(container).value).toBe('Quarterly numbers');
  });

  it('(b) dirty composer + minimized badge X shows the Discard confirmation immediately, and Keep editing preserves the draft', async () => {
    const { container, onClose, onDiscard } = renderComposer();
    await makeDirty(container);

    await click(buttonByLabel(container, 'Minimize composer'));
    const badge = container.querySelector(
      '[data-testid="docked-composer-minimized"]'
    );
    expect(badge).not.toBeNull();

    await click(buttonByLabel(badge as Element, 'Close composer'));
    await flush();

    // The confirmation must be visible RIGHT NOW, while still minimized.
    // Before the follow-up fix the badge branch never mounted the dialog,
    // so this click produced no visible response at all and the pending
    // confirm() only surfaced after a restore.
    const dialog = dialogEl(container);
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Discard draft?');
    // Nothing was thrown away behind the dialog's back, and the composer
    // has not closed or un-minimized itself.
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="docked-composer-minimized"]')
    ).not.toBeNull();

    await click(dialogButton(container, 'Keep editing'));
    await flush(300);

    expect(dialogEl(container)).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // The typed content survived the whole round trip.
    await click(buttonByLabel(container, 'Restore composer'));
    await flush();
    expect(subjectInput(container).value).toBe('Quarterly numbers');
  });

  it('(c) dirty composer + header X + confirm "Discard" discards and closes exactly once', async () => {
    const { container, onClose, onDiscard } = renderComposer();
    await makeDirty(container);

    await click(buttonByLabel(container, 'Close composer'));
    await flush();
    expect(dialogEl(container)).not.toBeNull();

    await click(dialogButton(container, 'Discard'));
    await flush(300);

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogEl(container)).toBeNull();
  });

  it('(d) dirty composer + header X + "Keep editing" keeps the composer open with content intact', async () => {
    const { container, onClose, onDiscard } = renderComposer();
    await makeDirty(container);

    await click(buttonByLabel(container, 'Close composer'));
    await flush();
    expect(dialogEl(container)).not.toBeNull();

    await click(dialogButton(container, 'Keep editing'));
    await flush(300);

    expect(dialogEl(container)).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="docked-composer"]')
    ).not.toBeNull();
    expect(subjectInput(container).value).toBe('Quarterly numbers');
  });

  it('(e) clean composer + header X closes immediately with NO confirmation dialog', async () => {
    const { container, onClose } = renderComposer();

    await click(buttonByLabel(container, 'Close composer'));
    await flush();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogEl(container)).toBeNull();
  });

  it('(f) footer Discard button asks through the same confirmation as the X buttons', async () => {
    const { container, onClose, onDiscard } = renderComposer();
    await makeDirty(container);

    const discardBtn = container.querySelector<HTMLButtonElement>(
      'button[title="Discard draft"]'
    );
    if (!discardBtn) throw new Error('footer Discard button not found');
    await click(discardBtn);
    await flush();

    const dialog = dialogEl(container);
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Discard draft?');
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await click(dialogButton(container, 'Discard'));
    await flush(300);

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
