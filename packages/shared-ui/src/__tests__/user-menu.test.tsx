// @vitest-environment jsdom
// ============================================================================
// Shared UI - UserMenu Component Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserMenu } from '../components/Shell/UserMenu';

const user = { name: 'Test User', email: 'test@quant.dev' };

describe('UserMenu', () => {
  const defaultProps = {
    user,
    isOpen: true,
    onClose: vi.fn(),
    onProfile: vi.fn(),
    onSettings: vi.fn(),
    onSignOut: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<UserMenu {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the account and its three items', () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getByText('Test User')).toBeDefined();
    expect(screen.getByText('test@quant.dev')).toBeDefined();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Profile',
      'Settings',
      'Sign out',
    ]);
  });

  it('calls the handler for the item that was clicked', () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(defaultProps.onSettings).toHaveBeenCalledTimes(1);
    expect(defaultProps.onProfile).not.toHaveBeenCalled();
    expect(defaultProps.onSignOut).not.toHaveBeenCalled();
  });

  // `alt={user.name}` sat two nodes away from a <p> holding the same string, so a
  // reader announced the name twice before the address.
  it('does not announce the name twice', () => {
    const { container } = render(
      <UserMenu {...defaultProps} user={{ ...user, avatar: 'https://cdn.test/a.png' }} />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('');
    expect(screen.getAllByText('Test User')).toHaveLength(1);
  });

  it('hides the initials fallback from the accessible tree', () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getByText('T').getAttribute('aria-hidden')).toBe('true');
  });

  // `aria-modal="true"` tells a reader that nothing outside this node exists. The
  // menu made that promise with no focus trap, no initial focus and no Escape —
  // the only way out was a mouse click on the `aria-hidden` backdrop.
  it('moves focus into the dialog on open', () => {
    render(<UserMenu {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape', () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // `role="menu"` is a promise about the keyboard too. This shipped as three
  // native buttons — three tab stops — with no key handler at all.
  it('keeps exactly one item in the tab sequence', () => {
    render(<UserMenu {...defaultProps} />);
    const inSequence = screen.getAllByRole('menuitem').filter((i) => i.tabIndex === 0);
    expect(inSequence).toHaveLength(1);
    expect(inSequence[0]).toBe(screen.getByRole('menuitem', { name: 'Profile' }));
  });

  it('moves the cursor with Up and Down, wrapping at the ends', () => {
    render(<UserMenu {...defaultProps} />);
    const profile = screen.getByRole('menuitem', { name: 'Profile' });

    fireEvent.keyDown(profile, { key: 'ArrowDown' });
    const settings = screen.getByRole('menuitem', { name: 'Settings' });
    expect(document.activeElement).toBe(settings);
    expect(settings.tabIndex).toBe(0);
    expect(profile.tabIndex).toBe(-1);

    // A ring, not a strip with two dead ends: Up from the first lands on the last.
    fireEvent.keyDown(settings, { key: 'ArrowUp' });
    fireEvent.keyDown(profile, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Sign out' }));
  });

  // Unlike a tablist, selection does NOT follow focus here: arrowing onto
  // "Sign out" must not sign anybody out.
  it('does not invoke the item it arrows onto', () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Profile' }), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(defaultProps.onSignOut).not.toHaveBeenCalled();
    expect(defaultProps.onProfile).not.toHaveBeenCalled();
  });

  it('jumps to the ends with Home and End', () => {
    render(<UserMenu {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Profile' }), { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Sign out' }));

    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Sign out' }), { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Profile' }));
    expect(defaultProps.onSignOut).not.toHaveBeenCalled();
  });

  // A vertical menu must not claim the horizontal arrows.
  it('leaves the horizontal arrows alone', () => {
    render(<UserMenu {...defaultProps} />);
    const profile = screen.getByRole('menuitem', { name: 'Profile' });
    const handled = fireEvent.keyDown(profile, { key: 'ArrowRight' });
    expect(handled).toBe(true); // not preventDefault()ed
    expect(profile.tabIndex).toBe(0);
  });

  // The cursor resets on close rather than on open: the trap's autofocus effect
  // runs first, so resetting on open would focus last session's item and then move
  // the tab stop out from under it.
  it('starts over at the first item on the next open', () => {
    const { rerender } = render(<UserMenu {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Profile' }), { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'Sign out' }).tabIndex).toBe(0);

    rerender(<UserMenu {...defaultProps} isOpen={false} />);
    rerender(<UserMenu {...defaultProps} />);
    expect(screen.getByRole('menuitem', { name: 'Profile' }).tabIndex).toBe(0);
  });

  // Every handler is optional, and the menu rendered all three buttons regardless
  // — so a consumer who passed only `onSignOut` shipped two items that did nothing
  // when chosen.
  it('renders only the items whose handler was passed', () => {
    render(<UserMenu user={user} isOpen onClose={vi.fn()} onSignOut={defaultProps.onSignOut} />);
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.queryByRole('menuitem', { name: 'Profile' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Settings' })).toBeNull();
    // The lone item still holds the tab stop, so the group stays reachable.
    expect(screen.getByRole('menuitem', { name: 'Sign out' }).tabIndex).toBe(0);
  });

  // The divider was a bare <div> directly inside `role="menu"`, whose children may
  // only be menuitem/group/separator — and it has to drop when it would lead the
  // list, which it does whenever the entries above it were not passed.
  it('roles the divider, and drops it when it would lead the list', () => {
    render(<UserMenu {...defaultProps} />);
    expect(screen.getAllByRole('separator')).toHaveLength(1);

    const { container } = render(
      <UserMenu user={user} isOpen onClose={vi.fn()} onSignOut={defaultProps.onSignOut} />,
    );
    expect(container.querySelector('[role="separator"]')).toBeNull();
  });

  it('renders no menu at all when nothing can be chosen', () => {
    render(<UserMenu user={user} isOpen onClose={vi.fn()} />);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
    // The account block is still there — it is the only thing left to show.
    expect(screen.getByText('test@quant.dev')).toBeDefined();
  });

  // A dropdown is exactly the thing a consumer mounts inside a <form>, where a
  // bare <button> submits it — and "Sign out" posting the form instead is the
  // worst version of that.
  it('gives every button an explicit type', () => {
    const { container } = render(<UserMenu {...defaultProps} />);
    const untyped = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.getAttribute('type') !== 'button',
    );
    expect(untyped).toHaveLength(0);
  });

  it('hides the decorative icons', () => {
    const { container } = render(<UserMenu {...defaultProps} />);
    const svgs = Array.from(container.querySelectorAll('svg'));
    expect(svgs).toHaveLength(3);
    expect(svgs.every((s) => s.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
