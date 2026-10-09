// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { belongsInFolder, reconcileList } from '../lib/offline/folders';
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

describe('belongsInFolder — SPAM (PAUD-P0-1 / QM-UIUX-074)', () => {
  it('does not admit a freshly-archived (optimistic isArchived) message into SPAM', () => {
    // The row action's optimistic patch sets only isArchived; the message was
    // never spam. Before the fix this fell through to `default` ("everything
    // but the trash"), so archiving briefly showed the row in Spam with a
    // "Not spam" rescue button, contradicting the "archived" toast.
    const archived = email({ isArchived: true, isSpam: false });
    expect(belongsInFolder(archived, 'SPAM')).toBe(false);
  });

  it('keeps genuine spam in the SPAM view', () => {
    expect(belongsInFolder(email({ isSpam: true }), 'SPAM')).toBe(true);
  });

  it('keeps trashed mail out of SPAM even when flagged', () => {
    expect(belongsInFolder(email({ isSpam: true, trashedAt: new Date() }), 'SPAM')).toBe(false);
  });

  it('reconcileList drops the archived message from the cached SPAM list', () => {
    const cached: Email[] = [email({ id: 'spam-row', isSpam: true })];
    const patched = new Map<string, Email>([['m1', email({ id: 'm1', isArchived: true })]]);
    const next = reconcileList(cached, patched, 'SPAM');
    expect(next.map((m) => m.id)).toEqual(['spam-row']);
  });

  it('reconcileList keeps the archived message in the cached ARCHIVE list', () => {
    const cached: Email[] = [];
    const patched = new Map<string, Email>([['m1', email({ id: 'm1', isArchived: true })]]);
    const next = reconcileList(cached, patched, 'ARCHIVE');
    expect(next.map((m) => m.id)).toEqual(['m1']);
  });
});
