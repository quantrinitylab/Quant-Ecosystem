// @vitest-environment jsdom
// ============================================================================
// Shared UI - NotificationPanel Component Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationPanel } from '../components/Shell/NotificationPanel';
import type { NotificationItem } from '../components/Shell/NotificationPanel';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const mockNotifications: NotificationItem[] = [
  {
    id: '1',
    title: 'New message from Alice',
    body: 'Hey, can we sync up today?',
    time: '5m ago',
    read: false,
    app: 'Chat',
    actions: [{ id: 'reply', label: 'Reply', onClick: vi.fn() }],
  },
  {
    id: '2',
    title: 'File shared with you',
    body: 'Budget-Q4.xlsx was shared',
    time: '1h ago',
    read: true,
    app: 'Drive',
  },
  {
    id: '3',
    title: 'Meeting reminder',
    body: 'Team standup in 15 minutes',
    time: '10m ago',
    read: false,
    app: 'Calendar',
  },
];

describe('NotificationPanel', () => {
  const defaultProps = {
    notifications: mockNotifications,
    isOpen: true,
    onClose: vi.fn(),
    onMarkRead: vi.fn(),
    onMarkAllRead: vi.fn(),
    onDismiss: vi.fn(),
    onSnooze: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<NotificationPanel {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders notification panel when open', () => {
    render(<NotificationPanel {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Notifications')).toBeDefined();
  });

  // The badge was `<span aria-label="2 unread">2</span>`. A span maps to
  // `role="generic"`, where ARIA 1.2 prohibits `aria-label` and the browser drops
  // it — so this assertion passed while the badge announced a bare "2". The words
  // now live in an `sr-only` sibling, which is a thing a reader actually reaches.
  it('shows unread count badge, and says what the number means', () => {
    render(<NotificationPanel {...defaultProps} />);
    // 2 unread notifications
    expect(screen.getByText('2 unread')).toBeDefined();
  });

  it('renders notifications grouped by app', () => {
    render(<NotificationPanel {...defaultProps} />);
    expect(screen.getByText('New message from Alice')).toBeDefined();
    expect(screen.getByText('File shared with you')).toBeDefined();
    expect(screen.getByText('Meeting reminder')).toBeDefined();
  });

  it('calls onMarkRead when notification is clicked', () => {
    render(<NotificationPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('New message from Alice'));
    expect(defaultProps.onMarkRead).toHaveBeenCalledWith('1');
  });

  // Was `getByLabelText('Mark all as read')` over visible text "Mark all read" —
  // a WCAG 2.5.3 failure the test was pinning in place, since a speech-input user
  // saying "click Mark all read" got nothing. Query by the visible name instead.
  it('calls onMarkAllRead when mark all read button is clicked', () => {
    render(<NotificationPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(defaultProps.onMarkAllRead).toHaveBeenCalled();
  });

  it('renders app filter tabs', () => {
    render(<NotificationPanel {...defaultProps} />);
    expect(screen.getByText('All')).toBeDefined();
    expect(screen.getByRole('tab', { name: /Chat/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Drive/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Calendar/ })).toBeDefined();
  });

  it('filters notifications by app when tab is clicked', () => {
    render(<NotificationPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /Chat/ }));
    expect(screen.getByText('New message from Alice')).toBeDefined();
    expect(screen.queryByText('File shared with you')).toBeNull();
  });

  it('shows empty state when no notifications', () => {
    render(<NotificationPanel {...defaultProps} notifications={[]} />);
    expect(screen.getByText('No notifications')).toBeDefined();
  });

  it('renders snooze and dismiss buttons', () => {
    render(<NotificationPanel {...defaultProps} />);
    const snoozeButtons = screen.getAllByText('Snooze');
    const dismissButtons = screen.getAllByText('Dismiss');
    expect(snoozeButtons.length).toBeGreaterThan(0);
    expect(dismissButtons.length).toBeGreaterThan(0);
  });

  it('calls onSnooze when snooze button is clicked', () => {
    render(<NotificationPanel {...defaultProps} />);
    const snoozeButtons = screen.getAllByText('Snooze');
    fireEvent.click(snoozeButtons[0]!);
    expect(defaultProps.onSnooze).toHaveBeenCalledWith('1');
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    render(<NotificationPanel {...defaultProps} />);
    const dismissButtons = screen.getAllByText('Dismiss');
    fireEvent.click(dismissButtons[0]!);
    expect(defaultProps.onDismiss).toHaveBeenCalledWith('1');
  });

  it('renders inline action buttons from notification', () => {
    render(<NotificationPanel {...defaultProps} />);
    expect(screen.getByText('Reply')).toBeDefined();
  });

  // `aria-modal="true"` tells a reader that nothing outside this node exists. The
  // panel made that promise with no focus trap, no initial focus and no Escape —
  // the only way out was a mouse click on the `aria-hidden` backdrop.
  it('moves focus into the dialog on open', () => {
    render(<NotificationPanel {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape', () => {
    render(<NotificationPanel {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // The filter row declared `role="tablist"` with `aria-selected` and stopped
  // there: no `aria-controls`, no `role="tabpanel"` anywhere in the file, all four
  // chips in the tab sequence, no arrow keys. The list below IS the panel, so the
  // fix finishes the contract rather than demoting the role.
  it('wires each chip to a panel that exists, in both directions', () => {
    render(<NotificationPanel {...defaultProps} />);
    const tab = screen.getByRole('tab', { name: /Chat/ });
    const controls = tab.getAttribute('aria-controls');
    expect(controls).toBeTruthy();

    // `getElementById`, not `querySelector`: a `useId` value contains colons, so
    // `#${id}` is not a valid CSS selector and querySelector throws on it.
    const panel = document.getElementById(controls as string);
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('tabpanel');

    // ...and back. The selected chip is "All" until something is clicked, so the
    // panel is named by that one, not by the chip we happened to read above.
    const all = screen.getByRole('tab', { name: 'All' });
    expect(panel?.getAttribute('aria-labelledby')).toBe(all.id);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(all.id);

    fireEvent.click(tab);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tab.id);
  });

  it('renders exactly one tabpanel', () => {
    render(<NotificationPanel {...defaultProps} />);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('keeps exactly one chip in the tab sequence', () => {
    render(<NotificationPanel {...defaultProps} />);
    const inSequence = screen.getAllByRole('tab').filter((t) => t.tabIndex === 0);
    expect(inSequence).toHaveLength(1);
    expect(inSequence[0]).toBe(screen.getByRole('tab', { name: 'All' }));
  });

  it('moves selection and focus with the arrow keys, wrapping at the ends', () => {
    render(<NotificationPanel {...defaultProps} />);
    const all = screen.getByRole('tab', { name: 'All' });
    all.focus();

    fireEvent.keyDown(all, { key: 'ArrowRight' });
    const chat = screen.getByRole('tab', { name: /Chat/ });
    expect(chat.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(chat);
    // Selection follows focus, so the panel came along with it.
    expect(screen.queryByText('File shared with you')).toBeNull();

    // A ring, not a strip with two dead ends: Left from the first lands on the last.
    fireEvent.keyDown(chat, { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'All' }), { key: 'ArrowLeft' });
    const calendar = screen.getByRole('tab', { name: /Calendar/ });
    expect(calendar.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(calendar);
  });

  it('jumps to the ends with Home and End', () => {
    render(<NotificationPanel {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'All' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: /Calendar/ }).getAttribute('aria-selected')).toBe(
      'true',
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: /Calendar/ }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true');
  });

  // A horizontal chip row must not claim the vertical arrows: the list underneath
  // is a scroller, and taking ArrowDown away from it is a worse trade than one
  // extra key press.
  it('leaves ArrowDown alone', () => {
    render(<NotificationPanel {...defaultProps} />);
    const all = screen.getByRole('tab', { name: 'All' });
    const handled = fireEvent.keyDown(all, { key: 'ArrowDown' });
    expect(handled).toBe(true); // not preventDefault()ed
    expect(all.getAttribute('aria-selected')).toBe('true');
  });

  // With one app there is nothing to filter, so the row does not render — and the
  // list must then NOT claim to be anyone's panel. A `role="tabpanel"` whose
  // `aria-labelledby` resolves to nothing is the defect this work removes, not a
  // smaller version of it.
  it('claims no panel role when there are no chips to point at it', () => {
    render(<NotificationPanel {...defaultProps} notifications={[mockNotifications[0]!]} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.getByRole('list', { name: 'Notifications' })).toBeDefined();
  });

  // The row's `onClick` was the only route to "mark read": a `role="listitem"`
  // with no tabindex and no key handler. The row cannot become a `<button>` — its
  // body is paragraphs and it holds the action buttons — so the keyboard route
  // joins the strip of controls that is already there.
  it('gives every unread row a real Mark read control', () => {
    render(<NotificationPanel {...defaultProps} />);
    // Two unread of three, so two buttons — the read one must not get one.
    const marks = screen.getAllByRole('button', { name: /^Mark as read:/ });
    expect(marks).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Mark as read: File shared with you' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read: New message from Alice' }));
    expect(defaultProps.onMarkRead).toHaveBeenCalledWith('1');
    // Once, not twice: the button stops the click before the row's shortcut sees it.
    expect(defaultProps.onMarkRead).toHaveBeenCalledTimes(1);
  });

  // Unread was a tinted background plus a blue dot whose `aria-label` sat on an
  // empty span — colour-only in the visual channel and nothing at all in the
  // accessible one.
  it('says which rows are unread instead of only tinting them', () => {
    render(<NotificationPanel {...defaultProps} />);
    expect(screen.getAllByText('Unread.')).toHaveLength(2);
  });

  // Every optional callback is optional, and the row used to render an empty 8px
  // action strip and a `cursor-pointer` lie for a consumer who passed none of them.
  it('drops the action strip and the pointer cursor when there is nothing to do', () => {
    const { container } = render(
      <NotificationPanel notifications={mockNotifications} isOpen onClose={vi.fn()} />,
    );
    expect(screen.queryByText('Snooze')).toBeNull();
    expect(screen.queryByText('Dismiss')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Mark as read:/ })).toBeNull();
    // 'Reply' is the one notification-supplied action, so its row keeps a strip.
    expect(screen.getByText('Reply')).toBeDefined();
    expect(container.querySelectorAll('.cursor-pointer')).toHaveLength(0);
  });

  // A NotificationPanel is exactly the thing a consumer drops inside a <form>,
  // where a bare <button> is a submit button and every chip and every Dismiss
  // would post the form.
  it('gives every button an explicit type', () => {
    const { container } = render(<NotificationPanel {...defaultProps} />);
    const untyped = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.getAttribute('type') !== 'button',
    );
    expect(untyped).toHaveLength(0);
  });
});
