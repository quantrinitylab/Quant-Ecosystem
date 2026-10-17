// @vitest-environment jsdom
// ============================================================================
// LabelQuickApply component contract.
//
// The inbox row's label picker: a searchable dropdown that toggles labels on
// a conversation. Two modes:
//   - uncontrolled (own "Label" trigger button) — the standalone usage;
//   - controlled (`open`/`onOpenChange` + `hideTrigger`) — the inbox row, where
//     the opener lives in the hover bar ("Add label") and the touch "…" menu.
//
// These tests render the REAL component and drive the REAL dropdown,
// asserting only observable behaviour: the trigger opens the list, picking a
// label calls onApply/onRemove with (emailId, labelId), the filter narrows
// the list, and the controlled mode reports Escape closes without rendering
// its own trigger.
//
// NOTE: the sandbox's framer-motion copy is a render-null stub, so it is
// shimmed here with elements that keep props/children (see
// HoverActions.test.tsx). InboxToast is silenced — the toggle contract is
// about onApply/onRemove calls, not toast copy.
// ============================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock('framer-motion', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const MOTION_PROPS = new Set([
    'initial',
    'animate',
    'exit',
    'transition',
    'variants',
    'whileHover',
    'whileTap',
    'whileFocus',
    'whileInView',
    'drag',
    'dragConstraints',
    'layout',
    'layoutId',
  ]);
  const mockMotion = new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({ children, ...props }: { children?: React.ReactNode }) => {
          const domProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) {
            if (!MOTION_PROPS.has(k)) domProps[k] = v;
          }
          return React.createElement(tag, domProps, children);
        },
    },
  );
  return {
    motion: mockMotion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => false,
  };
});

vi.mock('../InboxToast', () => ({ showToast: vi.fn() }));

import { LabelQuickApply } from '../LabelQuickApply';

const LABELS = [
  { id: 'l-work', name: 'Work', color: '#ff0000' },
  { id: 'l-personal', name: 'Personal', color: '#00ff00' },
];

const mounted: Root[] = [];

function renderPicker(
  props: Partial<React.ComponentProps<typeof LabelQuickApply>> = {},
): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push(root);
  const merged = {
    emailId: 'email-1',
    currentLabels: [],
    availableLabels: LABELS,
    onApply: () => Promise.resolve(),
    onRemove: () => Promise.resolve(),
    ...props,
  } as React.ComponentProps<typeof LabelQuickApply>;
  act(() => {
    root.render(React.createElement(LabelQuickApply, merged));
  });
  return container;
}

afterEach(() => {
  while (mounted.length > 0) {
    const root = mounted.pop()!;
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = '';
});

async function clickAsync(el: Element | null): Promise<void> {
  if (!el) throw new Error('expected element, got null');
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function labelOption(container: HTMLElement, name: string): Element | null {
  const options = [...container.querySelectorAll('[role="option"]')];
  return options.find((o) => o.textContent?.includes(name)) ?? null;
}

function setSearchValue(input: HTMLInputElement, value: string): Promise<void> {
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('LabelQuickApply', () => {
  it('opens the label list from its own trigger in uncontrolled mode', async () => {
    const container = renderPicker();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    const trigger = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Label'),
    );
    await clickAsync(trigger ?? null);
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(labelOption(container, 'Work')).not.toBeNull();
    expect(labelOption(container, 'Personal')).not.toBeNull();
  });

  it('calls onApply(emailId, labelId) when an unapplied label is picked', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    const container = renderPicker({ onApply, currentLabels: [] });
    await clickAsync(
      [...container.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Label'),
      ) ?? null,
    );
    await clickAsync(labelOption(container, 'Work'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith('email-1', 'l-work');
  });

  it('calls onRemove(emailId, labelId) when an applied label is picked', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const container = renderPicker({ onRemove, currentLabels: ['l-work'] });
    await clickAsync(
      [...container.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Label'),
      ) ?? null,
    );
    const option = labelOption(container, 'Work');
    expect(option?.getAttribute('aria-selected')).toBe('true');
    await clickAsync(option);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('email-1', 'l-work');
  });

  it('narrows the list as the user types in the filter', async () => {
    const container = renderPicker();
    await clickAsync(
      [...container.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Label'),
      ) ?? null,
    );
    const input = container.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    await setSearchValue(input, 'pers');
    expect(labelOption(container, 'Personal')).not.toBeNull();
    expect(labelOption(container, 'Work')).toBeNull();
  });

  it('controlled mode renders no trigger and reports Escape closes', async () => {
    const onOpenChange = vi.fn();
    const container = renderPicker({
      open: true,
      onOpenChange,
      hideTrigger: true,
    });
    // No trigger button of its own — the row's hover bar / touch menu opens it.
    expect(
      [...container.querySelectorAll('button')].some((b) =>
        b.classList.contains('label-trigger-btn'),
      ),
    ).toBe(false);
    // …but the dropdown itself is open.
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
