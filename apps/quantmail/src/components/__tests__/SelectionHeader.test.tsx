import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelectionHeader } from '../SelectionHeader';

// AnchoredMenu and friends pull in DOM-heavy bits; stub the menu and snooze
// so this stays a pure markup test.
vi.mock('../AnchoredMenu', () => ({
  AnchoredMenu: ({ triggerLabel }: { triggerLabel: string }) => (
    <button type="button" aria-label={triggerLabel}>
      more
    </button>
  ),
}));
vi.mock('../EmailSnooze', () => ({
  EmailSnooze: () => <button type="button" aria-label="snooze stub" />,
}));
vi.mock('../ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));
vi.mock('../MailIcon', () => ({
  MailIcon: () => <span />,
}));

const baseProps = {
  count: 1,
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
};

describe('SelectionHeader', () => {
  it('renders above the floating People|Inbox toggle pill (z-[70] > z-[60])', () => {
    // 2026-10-10 button audit: the fixed MailboxViewToggle pill (z-[60])
    // covered the "More actions" button and intercepted its clicks. The
    // selection bar must win the stacking contest.
    const html = renderToStaticMarkup(<SelectionHeader {...baseProps} />);
    expect(html).toContain('z-[70]');
    expect(html).not.toMatch(/z-50(?!-)/);
  });

  it('shows "Move to inbox" instead of Archive in the archive view', () => {
    const html = renderToStaticMarkup(
      <SelectionHeader {...baseProps} isArchiveView onUnarchive={() => {}} />,
    );
    expect(html).toContain('Move 1 selected back to inbox');
  });
});
