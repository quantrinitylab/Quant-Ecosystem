// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { belongsInFolder, reconcileList } from '../lib/offline/folders';
import { HoverActions } from '../components/HoverActions';
import { SelectionHeader } from '../components/SelectionHeader';
import type { Email } from '../types';

function email(overrides: Partial<Email> = {}): Email {
  return {
    id: 'm1',
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDraft: false,
    labels: [],
    attachments: [],
    references: [],
    headers: {},
    receivedAt: new Date(),
    ...overrides,
  } as Email;
}

const noop = () => {};

describe('unarchive round trip — folder predicate (PAUD-P0-2 / QM-UIUX-075)', () => {
  it('an archived message belongs in ARCHIVE, not INBOX', () => {
    const archived = email({ isArchived: true });
    expect(belongsInFolder(archived, 'ARCHIVE')).toBe(true);
    expect(belongsInFolder(archived, 'INBOX')).toBe(false);
  });

  it('after the unarchive patch the message belongs in INBOX, not ARCHIVE', () => {
    // This is the patch the `unarchive` mutation applies optimistically and
    // persists via POST /api/emails/:id/unarchive. The round trip must move
    // the row back to the inbox and out of the archive view.
    const unarchived = email({ isArchived: false });
    expect(belongsInFolder(unarchived, 'ARCHIVE')).toBe(false);
    expect(belongsInFolder(unarchived, 'INBOX')).toBe(true);
  });

  it('reconcileList drops an unarchived message from the cached ARCHIVE list', () => {
    const cached: Email[] = [email({ id: 'm1', isArchived: true })];
    const patched = new Map<string, Email>([['m1', email({ id: 'm1', isArchived: false })]]);
    const next = reconcileList(cached, patched, 'ARCHIVE');
    expect(next.map((m) => m.id)).toEqual([]);
  });

  it('reconcileList admits an unarchived message into the cached INBOX list', () => {
    const cached: Email[] = [];
    const patched = new Map<string, Email>([['m1', email({ id: 'm1', isArchived: false })]]);
    const next = reconcileList(cached, patched, 'INBOX');
    expect(next.map((m) => m.id)).toEqual(['m1']);
  });
});

describe('HoverActions — Unarchive swap (PAUD-P0-2 / QM-UIUX-075)', () => {
  const base = {
    emailId: 'm1',
    isRead: true,
    onArchive: noop,
    onDelete: noop,
    onMarkRead: noop,
    onMarkUnread: noop,
    onSnooze: noop,
  };

  it('shows Archive for a non-archived mail', () => {
    const html = renderToStaticMarkup(<HoverActions {...base} />);
    expect(html).toContain('aria-label="Archive"');
    expect(html).not.toContain('Move to inbox');
  });

  it('shows "Move to inbox" instead of Archive for an archived mail', () => {
    const html = renderToStaticMarkup(
      <HoverActions {...base} isArchived onUnarchive={vi.fn()} />,
    );
    expect(html).toContain('aria-label="Move to inbox"');
    expect(html).not.toContain('aria-label="Archive"');
  });

  it('falls back to Archive when the row is archived but no unarchive handler is wired', () => {
    const html = renderToStaticMarkup(<HoverActions {...base} isArchived />);
    expect(html).toContain('aria-label="Archive"');
    expect(html).not.toContain('Move to inbox');
  });
});

describe('SelectionHeader — bulk Unarchive in the Archive view (PAUD-P0-2 / QM-UIUX-075)', () => {
  const base = {
    count: 2,
    totalVisible: 10,
    allPinned: false,
    onDeselectAll: noop,
    onSelectAllVisible: noop,
    onTogglePin: noop,
    onMarkRead: noop,
    onMarkUnread: noop,
    onArchive: noop,
    onDelete: noop,
    onSnooze: noop,
  };

  it('shows Archive in the normal inbox selection bar', () => {
    const html = renderToStaticMarkup(<SelectionHeader {...base} />);
    expect(html).toContain('aria-label="Archive 2 selected"');
    expect(html).not.toContain('back to inbox');
  });

  it('shows "Move to inbox" instead of Archive in the Archive view selection bar', () => {
    const html = renderToStaticMarkup(
      <SelectionHeader {...base} isArchiveView onUnarchive={vi.fn()} />,
    );
    expect(html).toContain('aria-label="Move 2 selected back to inbox"');
    expect(html).not.toContain('aria-label="Archive 2 selected"');
  });
});
