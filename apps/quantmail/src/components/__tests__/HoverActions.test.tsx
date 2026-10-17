// @vitest-environment jsdom
// ============================================================================
// HoverActions component contract.
//
// The inbox row's quick-action bar (Pin, Star, Archive/Unarchive, Delete,
// Mark read/unread, Snooze, Label, Not-spam rescue). Rendered on hover /
// keyboard focus for fine pointers; hidden outright on coarse pointers, where
// the row's "…" touch menu carries the same actions instead.
//
// These tests render the REAL component and drive the REAL buttons, asserting
// only observable behaviour: every action is a real button with an honest
// accessible label, Delete always asks first (no silent deletes), and the bar
// adapts its actions to the row's state (archived / spam / read-toggle that
// cannot change anything).
//
// NOTE: the sandbox's framer-motion copy is a render-null stub, so it is
// shimmed here with elements that keep props/children (the slide-in animation
// itself is not under test — the overlap regression is pinned by the CSS
// locks in inboxRowActionsTouch.test.ts).
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

// The sandbox's pruned install lacks @quant/shared-ui (ConfirmDialog's
// useFocusTrap source); a test-only stub package is linked under
// node_modules/@quant/shared-ui — the focus trap is a runtime concern, not
// part of this contract.

import { HoverActions } from '../HoverActions';

const baseProps = {
  emailId: 'thread-1',
  isRead: false,
  onArchive: () => {},
  onDelete: () => {},
  onMarkRead: () => {},
  onMarkUnread: () => {},
  onSnooze: () => {},
};

const mounted: Root[] = [];

function renderBar(
  props: Partial<React.ComponentProps<typeof HoverActions>> = {},
): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push(root);
  const merged = { ...baseProps, ...props } as React.ComponentProps<
    typeof HoverActions
  >;
  act(() => {
    root.render(React.createElement(HoverActions, merged));
  });
  return container;
}

function byLabel(container: HTMLElement, label: string): HTMLElement | null {
  return container.querySelector(`[aria-label="${label}"]`);
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

function click(el: Element | null): void {
  if (!el) throw new Error('expected element, got null');
  act(() => {
    (el as HTMLElement).click();
  });
}

describe('HoverActions', () => {
  it('renders the bar with quick actions carrying honest accessible labels', () => {
    const container = renderBar({ onTogglePin: () => {}, onToggleStar: () => {}, onLabel: () => {} });
    expect(byLabel(container, 'Quick actions')).not.toBeNull();
    for (const label of [
      'Pin to top',
      'Star',
      'Archive',
      'Delete',
      'Mark read',
      'Snooze',
      'Add label',
    ]) {
      expect(byLabel(container, label)).not.toBeNull();
    }
  });

  it('exposes the bar as a NAMED toolbar so assistive tech announces it', () => {
    // A11y: aria-label on a role-less div is ignored — the bar must carry a
    // landmark-capable role so "Quick actions" is announced.
    const container = renderBar({ onTogglePin: () => {}, onToggleStar: () => {}, onLabel: () => {} });
    const bar = container.querySelector('[role="toolbar"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('aria-label')).toBe('Quick actions');
  });

  it('flips the read toggle label with read state', () => {
    const unread = renderBar({ isRead: false });
    const read = renderBar({ isRead: true });
    expect(byLabel(unread, 'Mark read')).not.toBeNull();
    expect(byLabel(read, 'Mark unread')).not.toBeNull();
  });

  it('omits the read toggle when the thread read state cannot change', () => {
    const container = renderBar({ isRead: true, hideReadToggle: true });
    expect(byLabel(container, 'Mark unread')).toBeNull();
    expect(byLabel(container, 'Mark read')).toBeNull();
  });

  it('shows "Move to inbox" instead of "Archive" for archived mail', () => {
    const container = renderBar({ isArchived: true, onUnarchive: () => {} });
    expect(byLabel(container, 'Move to inbox')).not.toBeNull();
    expect(byLabel(container, 'Archive')).toBeNull();
  });

  it('shows the Not-spam rescue action in spam mode', () => {
    const container = renderBar({ isSpam: true, onRescueSpam: () => {} });
    expect(byLabel(container, 'Not spam')).not.toBeNull();
  });

  it('delete asks for confirmation first — no silent deletes', () => {
    const onDelete = vi.fn();
    const container = renderBar({ onDelete });
    click(byLabel(container, 'Delete'));
    // The confirmation dialog appears; the destructive call has NOT fired.
    expect(document.body.textContent).toContain('Move conversation to Trash?');
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('confirming the dialog fires delete; cancelling does not', () => {
    const onDelete = vi.fn();
    renderBar({ onDelete });
    click(document.body.querySelector('[aria-label="Delete"]'));
    const confirm = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Move to Trash'),
    );
    expect(confirm).toBeTruthy();
    click(confirm ?? null);
    expect(onDelete).toHaveBeenCalledTimes(1);

    onDelete.mockClear();
    click(document.body.querySelector('[aria-label="Delete"]'));
    const cancel = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Cancel'),
    );
    click(cancel ?? null);
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(
      'Move conversation to Trash?',
    );
  });
});
