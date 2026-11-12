// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelectionHeader } from '../SelectionHeader';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Stub AnchoredMenu so it immediately renders its children(close)
const mockClose = vi.fn();
vi.mock('../AnchoredMenu', () => ({
  AnchoredMenu: ({ children }: { children: (close: () => void) => React.ReactNode }) => (
    <div data-testid="anchored-menu-content">{children(mockClose)}</div>
  ),
}));
vi.mock('../EmailSnooze', () => ({
  EmailSnooze: () => null,
}));
vi.mock('../ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderHeader(props: Partial<React.ComponentProps<typeof SelectionHeader>> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const fullProps = {
    count: 2,
    totalVisible: 10,
    allPinned: false,
    onDeselectAll: () => {},
    onSelectAllVisible: () => {},
    onTogglePin: () => {},
    onMarkRead: () => {},
    onMarkUnread: () => {},
    onArchive: () => {},
    onDelete: () => {},
    onSnooze: () => {},
    ...props,
  };
  act(() => {
    root!.render(<SelectionHeader {...fullProps} />);
  });
  return host;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  host = null;
  root = null;
  mockClose.mockClear();
});

describe('SelectionHeader flag action (AC-19)', () => {
  it('shows "Flag" when allFlagged is false', () => {
    const el = renderHeader({ onToggleFlag: vi.fn(), allFlagged: false });
    const buttons = Array.from(el.querySelectorAll('button'));
    const flagBtn = buttons.find((b) => b.textContent?.includes('Flag'));
    expect(flagBtn).toBeDefined();
    expect(flagBtn?.textContent?.trim()).toBe('Flag');
  });

  it('shows "Unflag" when allFlagged is true', () => {
    const el = renderHeader({ onToggleFlag: vi.fn(), allFlagged: true });
    const buttons = Array.from(el.querySelectorAll('button'));
    const unflagBtn = buttons.find((b) => b.textContent?.includes('Unflag'));
    expect(unflagBtn).toBeDefined();
    expect(unflagBtn?.textContent?.trim()).toBe('Unflag');
  });

  it('clicking the flag button invokes onToggleFlag and closes the menu', () => {
    const onToggleFlag = vi.fn();
    const el = renderHeader({ onToggleFlag, allFlagged: false });
    const buttons = Array.from(el.querySelectorAll('button'));
    const flagBtn = buttons.find((b) => b.textContent?.includes('Flag'))!;

    act(() => {
      flagBtn.click();
    });

    expect(onToggleFlag).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
