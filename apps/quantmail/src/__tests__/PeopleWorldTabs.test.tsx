// @vitest-environment jsdom
// ============================================================================
// People view PART 2 — PeopleWorldTabs contract pins.
//
// The world switcher must: switch worlds on tap, expose the tablist ARIA
// contract, show real counts only when > 0 (never a "0" badge, never a fake
// count), and support keyboard navigation between tabs.
// ============================================================================

import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { act } from 'react';

// Silence React 19's "not configured to support act(...)" warning under vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from 'react-dom/client';
import { PeopleWorldTabs } from '../components/PeopleWorldTabs';
import type { ConversationWorld } from '../components/PersonThread';

let root: Root | null = null;
function renderIntoDom(node: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}
afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  document.body.innerHTML = '';
});

function renderTabs(world: ConversationWorld, counts: Record<ConversationWorld, number>, onChange = vi.fn()) {
  const container = renderIntoDom(<PeopleWorldTabs world={world} counts={counts} onChange={onChange} />);
  return { container, onChange };
}

describe('PeopleWorldTabs', () => {
  it('renders the three worlds as a tablist with the active tab selected', () => {
    const { container } = renderTabs('groups', { log: 0, groups: 0, updates: 0 });
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.textContent)).toEqual(['Log', 'Groups', 'Updates']);
    const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    expect(active?.getAttribute('data-testid')).toBe('world-tab-groups');
  });

  it('calls onChange with the tapped world', () => {
    const { container, onChange } = renderTabs('log', { log: 1, groups: 2, updates: 0 });
    const updatesTab = container.querySelector('[data-testid="world-tab-updates"]')!;
    act(() => {
      updatesTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('updates');
  });

  it('shows a badge only for real counts above zero — never a "0" badge', () => {
    const { container } = renderTabs('log', { log: 5, groups: 0, updates: 2 });
    const logBadge = container.querySelector('[data-testid="tab-count-log"]');
    const updatesBadge = container.querySelector('[data-testid="tab-count-updates"]');
    const groupsBadge = container.querySelector('[data-testid="tab-count-groups"]');
    expect(logBadge).not.toBeNull();
    expect(logBadge!.textContent).toBe('5');
    expect(updatesBadge).not.toBeNull();
    expect(updatesBadge!.textContent).toBe('2');
    // Zero count: no badge element at all, not even "0".
    expect(groupsBadge).toBeNull();
    const groupsTab = container.querySelector('[data-testid="world-tab-groups"]')!;
    expect(groupsTab.textContent).toBe('Groups');
  });

  it('shows no badges at all when every count is zero', () => {
    const { container } = renderTabs('log', { log: 0, groups: 0, updates: 0 });
    expect(container.querySelector('[data-testid^="tab-count-"]')).toBeNull();
  });

  it('moves between tabs with arrow keys', () => {
    const { container, onChange } = renderTabs('log', { log: 0, groups: 0, updates: 0 });
    const logTab = container.querySelector('[data-testid="world-tab-log"]')!;
    act(() => {
      logTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith('groups');
  });
});
