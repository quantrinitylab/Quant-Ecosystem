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

describe('belongsInFolder — SENT (QM-UIUX-082)', () => {
  // `isSent` is a server-sent field the client `Email` type does not declare
  // (see lib/threading.ts); the backend's `GET /emails?folderType=SENT`
  // filters `isSent = true, isTrash = false`, and the client predicate that
  // seeds/falls back the /sent view's offline cache must match it exactly.
  const sentEmail = (overrides: Partial<Email> = {}): Email =>
    ({ ...email(overrides), isSent: true }) as unknown as Email;

  it('admits a sent message into SENT — sent mail appears in the Sent folder', () => {
    expect(belongsInFolder(sentEmail(), 'SENT')).toBe(true);
  });

  it('does not admit a received message into SENT', () => {
    // Before the fix SENT fell through to `default` ("everything but the
    // trash"), so the Sent view's cached list showed received mail.
    expect(belongsInFolder(email({ isArchived: false }), 'SENT')).toBe(false);
    expect(
      belongsInFolder(({ ...email(), isSent: false }) as unknown as Email, 'SENT'),
    ).toBe(false);
  });

  it('keeps trashed sent mail out of SENT even when flagged isSent', () => {
    expect(belongsInFolder(sentEmail({ trashedAt: new Date() }), 'SENT')).toBe(false);
  });

  it('reconcileList admits a freshly-sent message into the cached SENT list', () => {
    const cached: Email[] = [sentEmail({ id: 'old-sent' })];
    const patched = new Map<string, Email>([['m2', sentEmail({ id: 'm2' })]]);
    const next = reconcileList(cached, patched, 'SENT');
    expect(next.map((m) => m.id)).toEqual(['old-sent', 'm2']);
  });

  it('reconcileList does not admit a received message into the cached SENT list', () => {
    const cached: Email[] = [sentEmail({ id: 'old-sent' })];
    const patched = new Map<string, Email>([['m1', email({ id: 'm1' })]]);
    const next = reconcileList(cached, patched, 'SENT');
    expect(next.map((m) => m.id)).toEqual(['old-sent']);
  });
});

describe('belongsInFolder — ARCHIVE (archive-counts-divergent P1)', () => {
  // The two Archive surfaces (inbox shelf + ?archived=1 view) read the same
  // query, but the view can also boot from the offline cache, which seeds
  // through this predicate. The predicate is strict on purpose: only
  // `isArchived === true` admits a row, so the SERVER must send that flag
  // truthfully (GET /emails now includes the folder relation for the
  // formatEmailRecord bridge). These tests pin the client half of that
  // contract — if the predicate ever loosened, unarchived rows would leak
  // back into the cached archive list.
  it('admits a row the server marked archived (isArchived bridged from the folder relation)', () => {
    expect(belongsInFolder(email({ isArchived: true }), 'ARCHIVE')).toBe(true);
  });

  it('rejects a row the server did not mark archived — even one fetched from the archive endpoint', () => {
    // Before the backend fix, GET /emails?folderType=ARCHIVE returned rows
    // with isArchived:false (folder relation not included), so the seed
    // dropped every cached archived row and the view showed
    // "Nothing archived yet." while the shelf showed 8.
    expect(belongsInFolder(email({ isArchived: false }), 'ARCHIVE')).toBe(false);
    expect(belongsInFolder(email({}), 'ARCHIVE')).toBe(false);
  });

  it('keeps trashed mail out of ARCHIVE even when flagged archived', () => {
    expect(belongsInFolder(email({ isArchived: true, trashedAt: new Date() }), 'ARCHIVE')).toBe(
      false,
    );
  });

  it('the offline seed keeps server-marked rows and drops unmarked ones', () => {
    // Mirrors useInbox's seed: cached.filter((e) => belongsInFolder(e, 'ARCHIVE')).
    const cached: Email[] = [
      email({ id: 'kept', isArchived: true }),
      email({ id: 'dropped', isArchived: false }),
    ];
    const seeded = cached.filter((e) => belongsInFolder(e, 'ARCHIVE'));
    expect(seeded.map((e) => e.id)).toEqual(['kept']);
  });
});
