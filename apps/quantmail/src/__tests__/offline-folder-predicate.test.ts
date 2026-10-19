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

describe('belongsInFolder — SCHEDULED (QM-SCHEDULED)', () => {
  // Mirrors the backend's `GET /emails?folderType=SCHEDULED` filter
  // (`isSent = true, deliveryStatus = 'queued', sentAt > now`, with
  // `formatEmailRecord` bridging the fire time onto the wire as
  // `scheduledAt`). Before the predicate existed, the default case admitted
  // every non-trashed message into the cached Scheduled list, so a cold
  // /scheduled load would show received mail as scheduled.
  const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
  const PAST = new Date(Date.now() - 60 * 60 * 1000);
  const scheduledEmail = (overrides: Partial<Email> = {}): Email =>
    email({
      isSent: true,
      deliveryStatus: 'queued',
      scheduledAt: FUTURE,
      ...overrides,
    } as Partial<Email>);

  it('admits a queued future send into SCHEDULED', () => {
    expect(belongsInFolder(scheduledEmail(), 'SCHEDULED')).toBe(true);
  });

  it('keeps delivered mail out of SCHEDULED even when it was once queued', () => {
    expect(
      belongsInFolder(scheduledEmail({ deliveryStatus: 'delivered', scheduledAt: PAST }), 'SCHEDULED'),
    ).toBe(false);
  });

  it('keeps a fired-but-unpicked send (time already past) out of SCHEDULED', () => {
    // The backend drops these too (sentAt > now): the row is no longer
    // "scheduled" even if the worker has not delivered it yet.
    expect(belongsInFolder(scheduledEmail({ scheduledAt: PAST }), 'SCHEDULED')).toBe(false);
  });

  it('keeps ordinary received mail out of SCHEDULED (the default-case bug)', () => {
    expect(belongsInFolder(email(), 'SCHEDULED')).toBe(false);
  });

  it('keeps trashed scheduled mail out of SCHEDULED', () => {
    expect(
      belongsInFolder(scheduledEmail({ trashedAt: new Date() }), 'SCHEDULED'),
    ).toBe(false);
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

describe('belongsInFolder — SNOOZED (snoozed-offline-seed P1)', () => {
  // `snoozedUntil` lives only on EmailThread server-side; the SNOOZED list
  // query now includes the thread relation so `formatEmailRecord` bridges it
  // onto the wire row. The predicate is deliberately thin — it trusts the
  // server's `snoozedUntil > now` filter — so the server must send the field
  // truthfully. These tests pin the client half of that contract, in the
  // exact wire shape (ISO string) the route serialises.
  const snoozedEmail = (overrides: Partial<Email> = {}): Email =>
    email({ ...overrides, snoozedUntil: new Date('2026-10-20T10:00:00.000Z') });

  it('admits a row carrying the bridged snoozedUntil (Date)', () => {
    expect(belongsInFolder(snoozedEmail(), 'SNOOZED')).toBe(true);
  });

  it('admits a row carrying the wire-format snoozedUntil (ISO string)', () => {
    // Fastify serialises the Date to an ISO string; the predicate must stay
    // truthy on that shape or every cold seed drops every row again.
    const wireRow = { ...snoozedEmail(), snoozedUntil: '2026-10-20T10:00:00.000Z' } as unknown as Email;
    expect(belongsInFolder(wireRow, 'SNOOZED')).toBe(true);
  });

  it('rejects a row without snoozedUntil — the pre-fix wire shape', () => {
    // Before the backend fix the SNOOZED rows shipped with `snoozedUntil`
    // undefined, so the seed dropped every cached snoozed row.
    expect(belongsInFolder(email({}), 'SNOOZED')).toBe(false);
    expect(belongsInFolder(email({ snoozedUntil: undefined }), 'SNOOZED')).toBe(false);
  });

  it('keeps trashed mail out of SNOOZED even when snoozed', () => {
    expect(belongsInFolder(snoozedEmail({ trashedAt: new Date() }), 'SNOOZED')).toBe(false);
  });

  it('keeps snoozed drafts out of SNOOZED — the server filters isDraft = false', () => {
    // The server's `GET /emails?folderType=SNOOZED` sets `isDraft = false`
    // (backend/routes/emails.ts). Before the fix the predicate admitted any
    // non-trashed row with a wake time, so an optimistic snooze patch on a
    // draft — `POST /:id/snooze` guards trash only — landed it in the cached
    // SNOOZED list while the server never returns it (phantom row, gone on
    // the next refetch).
    expect(belongsInFolder(snoozedEmail({ isDraft: true }), 'SNOOZED')).toBe(false);
  });

  it('keeps snoozed spam out of SNOOZED — the server filters isSpam = false', () => {
    expect(belongsInFolder(snoozedEmail({ isSpam: true }), 'SNOOZED')).toBe(false);
  });

  it('reconcileList does NOT move a snoozed draft/spam row into the cached SNOOZED list', () => {
    // Pins the phantom-row scenario end to end: the optimistic patch stamps
    // snoozedUntil onto a draft/spam row and the reconcile fan-out must not
    // append it to the warm SNOOZED cache.
    const cached: Email[] = [];
    const patched = new Map<string, Email>([
      ['d1', snoozedEmail({ id: 'd1', isDraft: true })],
      ['s1', snoozedEmail({ id: 's1', isSpam: true })],
    ]);
    expect(reconcileList(cached, patched, 'SNOOZED')).toEqual([]);
  });

  it('INBOX rejects a row that carries snoozedUntil', () => {
    // The INBOX server filter excludes snoozed threads, so a row that does
    // carry the field (e.g. an optimistic patch mid-snooze) must not linger
    // in the cached inbox list.
    expect(belongsInFolder(snoozedEmail(), 'INBOX')).toBe(false);
  });

  it('the offline seed keeps server-marked rows and drops unmarked ones', () => {
    // Mirrors useInbox's seed: cached.filter((e) => belongsInFolder(e, 'SNOOZED')).
    const cached: Email[] = [
      snoozedEmail({ id: 'kept' }),
      email({ id: 'dropped' }),
    ];
    const seeded = cached.filter((e) => belongsInFolder(e, 'SNOOZED'));
    expect(seeded.map((e) => e.id)).toEqual(['kept']);
  });

  it('reconcileList moves a freshly-snoozed message into the cached SNOOZED list', () => {
    const cached: Email[] = [];
    const patched = new Map<string, Email>([
      ['m1', snoozedEmail({ id: 'm1' })],
    ]);
    const next = reconcileList(cached, patched, 'SNOOZED');
    expect(next.map((m) => m.id)).toEqual(['m1']);
  });
});

describe('belongsInFolder — INBOX (inbox-predicate-mirror P2)', () => {
  // The server's default-inbox filter (`GET /emails` with no folderType,
  // backend/routes/emails.ts) sets `isDraft = false, isSpam = false,
  // isTrash = false` plus the inbox's own exclusions (archived, snoozed,
  // pending scheduled send). Before the fix the client predicate admitted
  // drafts and spam, so an optimistic draft-save or report-spam patch
  // ({isDraft:true}/{isSpam:true}) lingered in the cached inbox list until
  // the next refetch — the same bug class as the SNOOZED/SPAM cases above.
  it('admits an ordinary received message into INBOX', () => {
    expect(belongsInFolder(email(), 'INBOX')).toBe(true);
  });

  it('keeps a draft out of INBOX — the server filters isDraft = false', () => {
    // A row the user just saved as a draft ({isDraft:true} optimistic
    // patch) must not linger in the cached inbox; it belongs in DRAFTS.
    expect(belongsInFolder(email({ isDraft: true }), 'INBOX')).toBe(false);
  });

  it('keeps a spam row out of INBOX — the server filters isSpam = false', () => {
    // A row the user just reported as spam ({isSpam:true} optimistic patch)
    // must not linger in the cached inbox; it belongs in SPAM.
    expect(belongsInFolder(email({ isSpam: true }), 'INBOX')).toBe(false);
  });

  it('keeps trashed mail out of INBOX even when otherwise active', () => {
    expect(belongsInFolder(email({ trashedAt: new Date() }), 'INBOX')).toBe(false);
  });

  it('keeps archived mail out of INBOX (regression pin)', () => {
    expect(belongsInFolder(email({ isArchived: true }), 'INBOX')).toBe(false);
  });

  it('keeps a pending scheduled send out of INBOX (regression pin)', () => {
    // A scheduled send joins the conversation when it fires, not when it
    // is scheduled — the server's inbox filter excludes it the same way.
    const pending = {
      ...email(),
      isSent: true,
      deliveryStatus: 'queued',
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    } as unknown as Email;
    expect(belongsInFolder(pending, 'INBOX')).toBe(false);
  });

  it('reconcileList drops a row from the cached INBOX list once it is patched to a draft', () => {
    // Pins the finding's expected behaviour end to end: the optimistic
    // draft-save patch must shed the row from the warm INBOX cache.
    const cached: Email[] = [email({ id: 'm1' })];
    const patched = new Map<string, Email>([['m1', email({ id: 'm1', isDraft: true })]]);
    const next = reconcileList(cached, patched, 'INBOX');
    expect(next).toEqual([]);
  });

  it('reconcileList drops a row from the cached INBOX list once it is reported as spam', () => {
    // Pins the finding's expected behaviour end to end: the optimistic
    // report-spam patch must shed the row from the warm INBOX cache.
    const cached: Email[] = [email({ id: 'm1' })];
    const patched = new Map<string, Email>([['m1', email({ id: 'm1', isSpam: true })]]);
    const next = reconcileList(cached, patched, 'INBOX');
    expect(next).toEqual([]);
  });

  it('reconcileList does NOT admit a patched draft/spam row into the cached INBOX list', () => {
    // The applyOptimistic fan-out must not append a draft/spam row to the
    // warm INBOX cache.
    const cached: Email[] = [];
    const patched = new Map<string, Email>([
      ['d1', email({ id: 'd1', isDraft: true })],
      ['s1', email({ id: 's1', isSpam: true })],
    ]);
    expect(reconcileList(cached, patched, 'INBOX')).toEqual([]);
  });
});

describe('belongsInFolder — DRAFTS (drafts-offline-seed P1)', () => {
  // The backend's `GET /emails?folderType=DRAFTS` filters
  // `isDraft = true, isTrash = false` (backend/routes/emails.ts), and
  // `isDraft` is a first-class column the wire and the client `Email` type
  // both carry — so the client predicate mirrors the server exactly.
  it('admits a genuine draft into DRAFTS', () => {
    expect(belongsInFolder(email({ isDraft: true }), 'DRAFTS')).toBe(true);
  });

  it('does not admit received mail into DRAFTS', () => {
    // Before the fix DRAFTS had no case and fell through to `default`
    // ("everything but the trash"), so the /drafts view's offline seed and
    // error fallback (useInbox) listed every non-trashed cached email as a
    // draft, and the optimistic reconcile fan-out appended patched rows to
    // the warm drafts list AppSidebar keeps for the draft-count badge.
    expect(belongsInFolder(email({ isDraft: false }), 'DRAFTS')).toBe(false);
    expect(belongsInFolder(email({}), 'DRAFTS')).toBe(false);
  });

  it('keeps trashed drafts out of DRAFTS even when flagged', () => {
    expect(belongsInFolder(email({ isDraft: true, trashedAt: new Date() }), 'DRAFTS')).toBe(false);
  });

  it('mirrors the server: an archived draft still admits (server filters isTrash only)', () => {
    expect(belongsInFolder(email({ isDraft: true, isArchived: true }), 'DRAFTS')).toBe(true);
  });

  it('the offline seed keeps drafts and drops received mail', () => {
    // Mirrors useInbox's seed: cached.filter((e) => belongsInFolder(e, 'DRAFTS')).
    const cached: Email[] = [
      email({ id: 'draft-1', isDraft: true }),
      email({ id: 'received-1', isDraft: false }),
    ];
    const seeded = cached.filter((e) => belongsInFolder(e, 'DRAFTS'));
    expect(seeded.map((e) => e.id)).toEqual(['draft-1']);
  });

  it('reconcileList drops a draft from the cached DRAFTS list once it is sent', () => {
    // The send path clears isDraft; the warm drafts list must shed the row
    // instead of keeping a ghost draft after "Sent".
    const cached: Email[] = [email({ id: 'draft-1', isDraft: true })];
    const patched = new Map<string, Email>([
      ['draft-1', email({ id: 'draft-1', isDraft: false })],
    ]);
    const next = reconcileList(cached, patched, 'DRAFTS');
    expect(next.map((m) => m.id)).toEqual([]);
  });

  it('reconcileList admits a freshly-drafted message into the cached DRAFTS list', () => {
    const cached: Email[] = [];
    const patched = new Map<string, Email>([['m1', email({ id: 'm1', isDraft: true })]]);
    const next = reconcileList(cached, patched, 'DRAFTS');
    expect(next.map((m) => m.id)).toEqual(['m1']);
  });

  it('reconcileList does not admit a patched non-draft row into the cached DRAFTS list', () => {
    // The applyOptimistic fan-out used to append any patched non-trashed
    // row (e.g. an archived message) to the warm drafts query.
    const cached: Email[] = [email({ id: 'draft-1', isDraft: true })];
    const patched = new Map<string, Email>([['m1', email({ id: 'm1', isArchived: true })]]);
    const next = reconcileList(cached, patched, 'DRAFTS');
    expect(next.map((m) => m.id)).toEqual(['draft-1']);
  });
});

describe('belongsInFolder — STARRED (starred-offline-seed P2)', () => {
  // The backend's `GET /emails?folderType=STARRED` filters
  // `isStarred = true, isTrash = false, isDraft = false, isSpam = false`
  // (backend/routes/emails.ts), and `isStarred` is a first-class column the
  // wire and the client `Email` type both carry — so the client predicate
  // mirrors the server exactly. The case was latent (no client view ships a
  // starred list yet); these tests pin the contract before one does, so the
  // offline seed / error fallback (useInbox) and the optimistic reconcile
  // fan-out can never list received/draft/spam mail as starred.
  it('admits a starred non-draft non-spam message into STARRED', () => {
    expect(belongsInFolder(email({ isStarred: true }), 'STARRED')).toBe(true);
  });

  it('does not admit an unstarred message into STARRED', () => {
    // Before the fix STARRED had no case and fell through to `default`
    // ("everything but the trash"), so a future starred view's offline
    // seed would have listed every non-trashed cached email as starred.
    expect(belongsInFolder(email({ isStarred: false }), 'STARRED')).toBe(false);
    expect(belongsInFolder(email({}), 'STARRED')).toBe(false);
  });

  it('keeps trashed starred mail out of STARRED even when flagged', () => {
    expect(
      belongsInFolder(email({ isStarred: true, trashedAt: new Date() }), 'STARRED'),
    ).toBe(false);
  });

  it('keeps starred drafts out of STARRED — the server filters isDraft = false', () => {
    expect(belongsInFolder(email({ isStarred: true, isDraft: true }), 'STARRED')).toBe(false);
  });

  it('keeps starred spam out of STARRED — the server filters isSpam = false', () => {
    expect(belongsInFolder(email({ isStarred: true, isSpam: true }), 'STARRED')).toBe(false);
  });

  it('admits a starred archived message — the server does not exclude archived rows', () => {
    expect(belongsInFolder(email({ isStarred: true, isArchived: true }), 'STARRED')).toBe(true);
  });

  it('the offline seed keeps starred rows and drops received mail', () => {
    // Mirrors useInbox's seed: cached.filter((e) => belongsInFolder(e, 'STARRED')).
    const cached: Email[] = [
      email({ id: 'starred-1', isStarred: true }),
      email({ id: 'received-1', isStarred: false }),
    ];
    const seeded = cached.filter((e) => belongsInFolder(e, 'STARRED'));
    expect(seeded.map((e) => e.id)).toEqual(['starred-1']);
  });

  it('reconcileList admits a freshly-starred message into the cached STARRED list', () => {
    // Pins the optimistic star toggle: the warm cached Starred list must
    // gain the row (and the seed below pins it must never have gained it
    // before the toggle).
    const cached: Email[] = [];
    const patched = new Map<string, Email>([['m1', email({ id: 'm1', isStarred: true })]]);
    const next = reconcileList(cached, patched, 'STARRED');
    expect(next.map((m) => m.id)).toEqual(['m1']);
  });

  it('reconcileList drops an unstarred message from the cached STARRED list', () => {
    const cached: Email[] = [email({ id: 'starred-1', isStarred: true })];
    const patched = new Map<string, Email>([
      ['starred-1', email({ id: 'starred-1', isStarred: false })],
    ]);
    const next = reconcileList(cached, patched, 'STARRED');
    expect(next.map((m) => m.id)).toEqual([]);
  });

  it('reconcileList does not admit a starred draft into the cached STARRED list', () => {
    const cached: Email[] = [];
    const patched = new Map<string, Email>([
      ['m1', email({ id: 'm1', isStarred: true, isDraft: true })],
    ]);
    expect(reconcileList(cached, patched, 'STARRED')).toEqual([]);
  });
});
