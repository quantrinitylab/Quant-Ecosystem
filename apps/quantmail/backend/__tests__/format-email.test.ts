import { describe, expect, it } from 'vitest';
import { formatEmailRecord } from '../lib/format-email';

/**
 * The wire contract for a message's kind.
 *
 * This is the single point where the Prisma enum (`MAIL` / `CHAT`) becomes what
 * the client reads (`mail` / `chat`), and every mailbox and thread response goes
 * through it. A regression here does not throw — it silently relabels every chat
 * message in the product as a letter — so the mapping is pinned rather than
 * trusted.
 */
describe('formatEmailRecord: messageKind', () => {
  // Typed as an open record on purpose: `formatEmailRecord` returns its argument's
  // type widened with the fields it adds, so a narrow literal type here would hide
  // the very fields under test.
  const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'email-1',
    fromAddress: 'sender@example.com',
    toAddresses: ['me@quantmail.in'],
    subject: 'Design review',
    bodyPlain: 'Hello',
    ...over,
  });

  it('lowercases the stored enum', () => {
    expect(formatEmailRecord(row({ messageKind: 'CHAT' })).messageKind).toBe('chat');
    expect(formatEmailRecord(row({ messageKind: 'MAIL' })).messageKind).toBe('mail');
  });

  it('accepts a value that is already lowercase', () => {
    // A record that has been through this formatter once must survive a second
    // pass unchanged — the reply route formats what the send path returns.
    expect(formatEmailRecord(row({ messageKind: 'chat' })).messageKind).toBe('chat');
  });

  it('calls a row written before the column existed a letter', () => {
    // Migration 0052 defaults the column to `MAIL`, but a payload assembled in
    // code — an optimistic response, a fixture — can still arrive without it.
    expect(formatEmailRecord(row()).messageKind).toBe('mail');
    expect(formatEmailRecord(row({ messageKind: null })).messageKind).toBe('mail');
  });

  it('treats an unrecognized value as a letter rather than passing it through', () => {
    expect(formatEmailRecord(row({ messageKind: 'sms' })).messageKind).toBe('mail');
  });

  it('leaves the rest of the record intact', () => {
    const formatted = formatEmailRecord(row({ messageKind: 'CHAT' }));

    expect(formatted.subject).toBe('Design review');
    expect(formatted.from).toEqual({ email: 'sender@example.com', name: 'sender' });
    expect(formatted.bodyText).toBe('Hello');
  });
});

/**
 * Folder-state bridging for the client's `belongsInFolder` predicate.
 *
 * The database tracks archive/trash via `folderId` and `isTrash`, but the
 * client predicate reads `isArchived` / `trashedAt`. These were always
 * undefined on server data, so optimistic reconciliations and the offline
 * cache seed mis-filed messages. The formatter now derives them.
 */
describe('formatEmailRecord: folder-state bridging', () => {
  const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'email-1',
    fromAddress: 'sender@example.com',
    toAddresses: ['me@quantmail.in'],
    subject: 'Design review',
    bodyPlain: 'Hello',
    ...over,
  });

  it('derives trashedAt from isTrash when the field is absent', () => {
    const formatted = formatEmailRecord(
      row({ isTrash: true, updatedAt: '2026-10-06T10:00:00.000Z' }),
    );
    expect(Boolean(formatted.trashedAt)).toBe(true);
  });

  it('leaves trashedAt undefined for non-trashed mail', () => {
    const formatted = formatEmailRecord(row({ isTrash: false }));
    expect(formatted.trashedAt).toBeUndefined();
  });

  it('preserves an explicitly set trashedAt', () => {
    const formatted = formatEmailRecord(row({ isTrash: true, trashedAt: '2026-01-01T00:00:00Z' }));
    expect(formatted.trashedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('derives isArchived from the folder relation when present', () => {
    const formatted = formatEmailRecord(row({ folder: { type: 'ARCHIVE' } }));
    expect(formatted.isArchived).toBe(true);
  });

  it('isArchived is false for a non-archive folder relation', () => {
    const formatted = formatEmailRecord(row({ folder: { type: 'INBOX' } }));
    expect(formatted.isArchived).toBe(false);
  });

  it('preserves an explicitly set isArchived over the folder relation', () => {
    const formatted = formatEmailRecord(row({ isArchived: true, folder: { type: 'INBOX' } }));
    expect(formatted.isArchived).toBe(true);
  });
});

/**
 * Snooze-state bridging for the client's `belongsInFolder` predicate.
 *
 * The database tracks snooze on `EmailThread` (there is no `snoozedUntil`
 * column on Email), but the client predicate reads `email.snoozedUntil`.
 * GET /emails?folderType=SNOOZED filtered server-side on the thread relation
 * without including it, so rows shipped with `snoozedUntil` undefined and the
 * offline seed dropped every row. The SNOOZED list query now includes the
 * thread relation (snoozedUntil only) and the formatter bridges it on.
 */
describe('formatEmailRecord: snooze-state bridging', () => {
  const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'email-1',
    fromAddress: 'sender@example.com',
    toAddresses: ['me@quantmail.in'],
    subject: 'Design review',
    bodyPlain: 'Hello',
    ...over,
  });

  it('derives snoozedUntil from the thread relation when present', () => {
    const until = new Date('2026-10-20T10:00:00.000Z');
    const formatted = formatEmailRecord(row({ thread: { snoozedUntil: until } }));
    expect(formatted.snoozedUntil).toBe(until);
  });

  it('leaves snoozedUntil undefined when the thread relation is absent', () => {
    // Only the SNOOZED list query includes the thread relation; every other
    // query must keep its old behaviour exactly.
    expect(formatEmailRecord(row()).snoozedUntil).toBeUndefined();
    expect(formatEmailRecord(row({ thread: null })).snoozedUntil).toBeUndefined();
  });

  it('bridges a null thread snoozedUntil to undefined, never to null', () => {
    const formatted = formatEmailRecord(row({ thread: { snoozedUntil: null } }));
    expect(formatted.snoozedUntil).toBeUndefined();
  });

  it('preserves an explicitly set snoozedUntil over the thread relation', () => {
    // The snooze optimistic patch sets the value directly on the client
    // object; the formatter must not let a stale relation overwrite it.
    const explicit = new Date('2026-10-25T10:00:00.000Z');
    const formatted = formatEmailRecord(
      row({ snoozedUntil: explicit, thread: { snoozedUntil: new Date('2026-10-20T10:00:00.000Z') } }),
    );
    expect(formatted.snoozedUntil).toBe(explicit);
  });
});

/**
 * Attachment id namespace isolation (QM-M39-010).
 *
 * `att_<uuid>` is the AttachmentService namespace: such an id means the
 * backend can read the bytes (download route, Save-to-Drive). The formatter
 * used to synthesize `att_${idx}` / `att_${idx}_${Date.now()}` for metadata-
 * only attachments, so a prefix-based gate offered Save-to-Drive on rows whose
 * bytes the backend could not read (readAttachment 404). Synthesized ids must
 * never start with `att_`; they use `meta_` instead.
 */
describe('formatEmailRecord: attachment id prefix', () => {
  const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'email-1',
    fromAddress: 'sender@example.com',
    toAddresses: ['me@quantmail.in'],
    subject: 'Design review',
    bodyPlain: 'Hello',
    ...over,
  });
  const ids = (attachments: unknown[]) =>
    (formatEmailRecord(row({ attachments })).attachments as { id: string }[]).map((a) => a.id);
  // The strict shape the client matches before offering Save-to-Drive.
  const SERVICE_ID = /^att_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it('gives string attachments a meta_-prefixed id, never att_', () => {
    const [id] = ids(['/uploads/notes.txt']);
    expect(id.startsWith('meta_')).toBe(true);
    expect(id.startsWith('att_')).toBe(false);
    expect(SERVICE_ID.test(id)).toBe(false);
  });

  it('gives id-less object attachments a meta_-prefixed id, never att_', () => {
    const [id] = ids([{ filename: 'report.pdf', mimeType: 'application/pdf' }]);
    expect(id.startsWith('meta_')).toBe(true);
    expect(id.startsWith('att_')).toBe(false);
    expect(SERVICE_ID.test(id)).toBe(false);
  });

  it('keeps a real AttachmentService att_<uuid> id untouched', () => {
    const stored = 'att_550e8400-e29b-41d4-a716-446655440000';
    const [id] = ids([{ id: stored, filename: 'kept.pdf' }]);
    expect(id).toBe(stored);
  });

  it('never emits a synthesized id that the AttachmentService regex would accept', () => {
    const formatted = formatEmailRecord(
      row({
        attachments: ['/uploads/a.txt', { filename: 'b.pdf' }, { id: '', filename: 'c.pdf' }],
      }),
    );
    const out = (formatted.attachments as { id: string }[]).map((a) => a.id);
    for (const id of out) {
      expect(id.startsWith('att_')).toBe(false);
      expect(SERVICE_ID.test(id)).toBe(false);
    }
  });
});
