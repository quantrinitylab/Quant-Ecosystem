// @vitest-environment jsdom
// ============================================================================
// Shared UI - QuickActions Component Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickActions } from '../components/Shell/QuickActions';
import type { QuickAction } from '../components/Shell/QuickActions';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const mockActions: QuickAction[] = [
  { id: 'reply', label: 'Reply', icon: '\u{1F4AC}', onClick: vi.fn() },
  { id: 'forward', label: 'Forward', icon: '\u{27A1}\uFE0F', onClick: vi.fn() },
  { id: 'archive', label: 'Archive', icon: '\u{1F4E6}', shortcut: 'E', onClick: vi.fn() },
  { id: 'delete', label: 'Delete', icon: '\u{1F5D1}\uFE0F', danger: true, onClick: vi.fn() },
  { id: 'disabled-action', label: 'Disabled', disabled: true, onClick: vi.fn() },
];

describe('QuickActions', () => {
  const defaultProps = {
    actions: mockActions,
    isOpen: true,
    position: { x: 100, y: 200 },
    onClose: vi.fn(),
    itemType: 'email',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<QuickActions {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders context menu with actions when open', () => {
    render(<QuickActions {...defaultProps} />);
    expect(screen.getByRole('menu')).toBeDefined();
    expect(screen.getByText('Reply')).toBeDefined();
    expect(screen.getByText('Forward')).toBeDefined();
    expect(screen.getByText('Archive')).toBeDefined();
    expect(screen.getByText('Delete')).toBeDefined();
  });

  it('calls action onClick when clicked', () => {
    render(<QuickActions {...defaultProps} />);
    fireEvent.click(screen.getByText('Reply'));
    expect(mockActions[0]!.onClick).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('does not call onClick for disabled actions', () => {
    render(<QuickActions {...defaultProps} />);
    fireEvent.click(screen.getByText('Disabled'));
    expect(mockActions[4]!.onClick).not.toHaveBeenCalled();
  });

  it('handles keyboard navigation - Escape closes menu', () => {
    render(<QuickActions {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // Both of the tests that used to live here fired on `document`, which is exactly
  // the defect: the menu grabbed Up/Down/Enter/Space from the whole page — from a
  // text field behind it included, where `preventDefault()` on Space is the
  // difference between typing and not — for as long as it was open. The cursor is
  // real focus now, so those keys belong to the focused item, and Enter/Space are
  // a native <button>'s own business.
  it('moves the cursor and focus with the arrow keys, skipping disabled items', () => {
    render(<QuickActions {...defaultProps} />);
    const reply = screen.getByRole('menuitem', { name: /Reply/ });
    reply.focus();

    fireEvent.keyDown(reply, { key: 'ArrowDown' });
    const forward = screen.getByRole('menuitem', { name: /Forward/ });
    expect(document.activeElement).toBe(forward);
    expect(forward.tabIndex).toBe(0);
    expect(reply.tabIndex).toBe(-1);

    // 'Disabled' is last, so Up from the first wraps past it onto 'Delete'.
    fireEvent.keyDown(forward, { key: 'ArrowUp' });
    fireEvent.keyDown(reply, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /Delete/ }));
  });

  // Unlike a tablist, selection does not follow focus in a menu: arrowing onto
  // 'Delete' must not delete anything.
  it('does not fire the action it arrows onto', () => {
    render(<QuickActions {...defaultProps} />);
    const reply = screen.getByRole('menuitem', { name: /Reply/ });
    fireEvent.keyDown(reply, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /Delete/ }));
    expect(mockActions[3]!.onClick).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('keeps exactly one item in the tab sequence', () => {
    render(<QuickActions {...defaultProps} />);
    const inSequence = screen.getAllByRole('menuitem').filter((i) => i.tabIndex === 0);
    expect(inSequence).toHaveLength(1);
    expect(inSequence[0]).toBe(screen.getByRole('menuitem', { name: /Reply/ }));
    // A native button, so Enter and Space need no handler of their own.
    expect(inSequence[0]!.tagName).toBe('BUTTON');
  });

  // Every item shipped with `tabIndex={-1}` and nothing ever called `.focus()`, so
  // the menu could not be entered from the keyboard at all.
  it('moves focus into the menu on open', () => {
    render(<QuickActions {...defaultProps} />);
    const menu = screen.getByRole('menu');
    expect(menu.contains(document.activeElement)).toBe(true);
  });

  it('jumps to the ends with Home and End, landing on something Enter will fire', () => {
    render(<QuickActions {...defaultProps} />);
    const reply = screen.getByRole('menuitem', { name: /Reply/ });
    // End is 'Disabled', which the cursor must walk back off.
    fireEvent.keyDown(reply, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /Delete/ }));

    fireEvent.keyDown(screen.getByRole('menuitem', { name: /Delete/ }), { key: 'Home' });
    expect(document.activeElement).toBe(reply);
  });

  it('starts the cursor on the first item Enter will fire', () => {
    render(
      <QuickActions
        {...defaultProps}
        actions={[{ id: 'nope', label: 'Nope', disabled: true, onClick: vi.fn() }, ...mockActions]}
      />,
    );
    const inSequence = screen.getAllByRole('menuitem').filter((i) => i.tabIndex === 0);
    expect(inSequence).toHaveLength(1);
    expect(inSequence[0]).toBe(screen.getByRole('menuitem', { name: /Reply/ }));
  });

  // A vertical menu must not claim the horizontal arrows.
  it('leaves the horizontal arrows alone', () => {
    render(<QuickActions {...defaultProps} />);
    const reply = screen.getByRole('menuitem', { name: /Reply/ });
    const handled = fireEvent.keyDown(reply, { key: 'ArrowRight' });
    expect(handled).toBe(true); // not preventDefault()ed
    expect(reply.tabIndex).toBe(0);
  });

  // APG: Tab closes the menu and lets focus carry on out, rather than leaving an
  // open menu hanging behind whatever the user just tabbed to.
  it('closes on Tab', () => {
    render(<QuickActions {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /Reply/ }), { key: 'Tab' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // An empty `role="menu"` is a 180px blank card on screen and a structural hole
  // for a reader.
  it('renders nothing when there is nothing to choose', () => {
    render(<QuickActions {...defaultProps} actions={[]} />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  // A context menu is exactly the thing a consumer mounts inside a <form>, where a
  // bare <button> submits it.
  it('gives every item an explicit type', () => {
    const { container } = render(<QuickActions {...defaultProps} />);
    const untyped = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.getAttribute('type') !== 'button',
    );
    expect(untyped).toHaveLength(0);
  });

  it('displays shortcut labels', () => {
    render(<QuickActions {...defaultProps} />);
    expect(screen.getByText('E')).toBeDefined();
  });

  it('has correct aria-label', () => {
    render(<QuickActions {...defaultProps} />);
    expect(screen.getByLabelText('Quick actions for email')).toBeDefined();
  });

  it('marks disabled items with aria-disabled', () => {
    render(<QuickActions {...defaultProps} />);
    const disabledBtn = screen.getByText('Disabled').closest('button');
    expect(disabledBtn?.getAttribute('aria-disabled')).toBe('true');
  });
});
