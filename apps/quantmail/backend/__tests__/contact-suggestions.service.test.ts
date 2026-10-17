// @vitest-environment node
// ============================================================================
// ContactService.getContactSuggestions — "Suggested from your mail"
// (the Gmail Merge & Fix analogue).
//
// What this pins:
//
//   1. The suggestion set comes from REAL MAIL, not the contact table: inbound
//      from Email.fromAddress, outbound from the to/cc/bcc of sent rows.
//      `GET /contacts/frequent` answers "who do I talk to most" but only from
//      saved contacts, so a correspondent emailed 50 times who was never
//      saved never appeared anywhere.
//   2. Exclusions are load-bearing, not cosmetic: the user's own address,
//      addresses already in the address book (case-insensitive), drafts
//      (writing half a message to somebody is not contacting them — the same
//      rule as the send-path recordRecipients wiring), spam, trash and
//      soft-deleted rows. Suggesting a spammer as a contact would be a bug,
//      not a feature.
//   3. Ranking: message count first, then recency. One message to the same
//      person in To AND Cc counts once — messageCount counts messages.
//   4. The display name is the most recent mail's fromName, or null when no
//      mail ever carried one; the UI renders the address itself rather than
//      inventing a name.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContactService } from '../services/contact.service';

const ME = 'me@quantmail.in';

function mailRow(partial: Record<string, unknown>) {
  return {
    userId: 'u1',
    fromAddress: 'nobody@example.com',
    fromName: null,
    toAddresses: [],
    ccAddresses: [],
    bccAddresses: [],
    isSent: false,
    receivedAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    isDraft: false,
    isSpam: false,
    isTrash: false,
    deletedAt: null,
    ...partial,
  };
}

function createMockPrisma() {
  const state = { rows: [] as Array<Record<string, unknown>> };
  return {
    user: { findUnique: vi.fn() },
    contact: { findMany: vi.fn() },
    // A tiny in-memory prisma: honors the service's `where` predicate, because
    // the exclusion contract (no drafts/spam/trash/deleted) IS that predicate.
    // Asserting the args are passed (see the "bounded window" test) pins the
    // same thing from the other side.
    email: {
      findMany: vi.fn().mockImplementation((args: { where?: Record<string, unknown> }) => {
        const where = args?.where ?? {};
        const matched = state.rows.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
        return Promise.resolve(matched);
      }),
    },
    __state: state,
  };
}

describe('ContactService.getContactSuggestions', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ContactService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ContactService(prisma as never);
    prisma.user.findUnique.mockResolvedValue({ email: ME });
    prisma.contact.findMany.mockResolvedValue([]);
  });

  function run(rows: Array<Record<string, unknown>>, limit = 10) {
    prisma.__state.rows = rows.map(mailRow);
    return service.getContactSuggestions('u1', limit);
  }

  it('suggests frequent inbound senders who are not contacts', async () => {
    const out = await run([
      { fromAddress: 'alice@example.com', fromName: 'Alice' },
      { fromAddress: 'alice@example.com', fromName: 'Alice' },
      { fromAddress: 'bob@example.com' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      email: 'alice@example.com',
      name: 'Alice',
      messageCount: 2,
      direction: 'inbound',
    });
    expect(out[1]).toMatchObject({ email: 'bob@example.com', name: null, messageCount: 1 });
  });

  it('excludes the user\'s own address, existing contacts, drafts, spam, trash and deleted rows', async () => {
    prisma.contact.findMany.mockResolvedValue([{ email: 'Friend@Example.com' }]);
    const out = await run([
      { fromAddress: ME, fromName: 'Me' }, // own address (e.g. a sent copy)
      { fromAddress: 'friend@example.com', fromName: 'Friend' }, // existing contact, other case
      { fromAddress: 'drafty@example.com', isDraft: true },
      { fromAddress: 'spammer@example.com', isSpam: true },
      { fromAddress: 'trashed@example.com', isTrash: true },
      { fromAddress: 'gone@example.com', deletedAt: new Date('2026-10-02T00:00:00.000Z') },
      { fromAddress: 'real@example.com', fromName: 'Real Person' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.email).toBe('real@example.com');
  });

  it('counts outbound correspondents from the to/cc/bcc of sent rows', async () => {
    const out = await run([
      {
        isSent: true,
        fromAddress: ME,
        toAddresses: ['carol@example.com'],
        ccAddresses: ['dave@example.com'],
        bccAddresses: [],
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.direction)).toEqual(['outbound', 'outbound']);
    expect(new Set(out.map((s) => s.email))).toEqual(
      new Set(['carol@example.com', 'dave@example.com']),
    );
  });

  it('counts one message once even when the same address is in To and Cc', async () => {
    const out = await run([
      {
        isSent: true,
        fromAddress: ME,
        toAddresses: ['carol@example.com'],
        ccAddresses: ['Carol@Example.com'],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ email: 'carol@example.com', messageCount: 1, direction: 'outbound' });
  });

  it('marks a correspondent seen in both directions as "both"', async () => {
    const out = await run([
      { fromAddress: 'erin@example.com', fromName: 'Erin' },
      { isSent: true, fromAddress: ME, toAddresses: ['erin@example.com'] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ email: 'erin@example.com', messageCount: 2, direction: 'both' });
  });

  it('ranks by message count, then by recency', async () => {
    const out = await run([
      { fromAddress: 'old@example.com', createdAt: new Date('2026-09-01T00:00:00.000Z'), receivedAt: new Date('2026-09-01T00:00:00.000Z') },
      { fromAddress: 'old@example.com', createdAt: new Date('2026-09-02T00:00:00.000Z'), receivedAt: new Date('2026-09-02T00:00:00.000Z') },
      { fromAddress: 'new@example.com', createdAt: new Date('2026-10-10T00:00:00.000Z'), receivedAt: new Date('2026-10-10T00:00:00.000Z') },
      { fromAddress: 'new@example.com', createdAt: new Date('2026-10-11T00:00:00.000Z'), receivedAt: new Date('2026-10-11T00:00:00.000Z') },
      { fromAddress: 'busy@example.com' },
      { fromAddress: 'busy@example.com' },
      { fromAddress: 'busy@example.com' },
    ]);
    // busy: 3 msgs first; then the 2-count tie broken by recency (new beats old)
    expect(out.map((s) => s.email)).toEqual(['busy@example.com', 'new@example.com', 'old@example.com']);
  });

  it('takes the display name from the most recent mail that carries one', async () => {
    const out = await run([
      { fromAddress: 'nick@example.com', fromName: 'Old Name', createdAt: new Date('2026-09-01T00:00:00.000Z'), receivedAt: new Date('2026-09-01T00:00:00.000Z') },
      { fromAddress: 'nick@example.com', fromName: 'New Name', createdAt: new Date('2026-10-01T00:00:00.000Z'), receivedAt: new Date('2026-10-01T00:00:00.000Z') },
      { fromAddress: 'nick@example.com', createdAt: new Date('2026-10-05T00:00:00.000Z'), receivedAt: new Date('2026-10-05T00:00:00.000Z') },
    ]);
    // The newest mail carries no name; the newest NAME still wins.
    expect(out[0]).toMatchObject({ email: 'nick@example.com', name: 'New Name' });
  });

  it('clamps the limit to 1..100', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ fromAddress: `p${i}@example.com` }));
    expect((await run(rows, 999))).toHaveLength(5);
    expect((await run(rows, 2))).toHaveLength(2);
    expect((await run(rows, 0))).toHaveLength(1);
  });

  it('scans a bounded window of recent mail in a single indexed query', async () => {
    await run([{ fromAddress: 'alice@example.com' }]);
    const arg = prisma.email.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
      take: number;
    };
    expect(arg.where).toMatchObject({
      userId: 'u1',
      deletedAt: null,
      isDraft: false,
      isSpam: false,
      isTrash: false,
    });
    expect(arg.orderBy).toEqual([{ createdAt: 'desc' }]);
    // Bounded: one indexed query, not a full-mailbox table scan.
    expect(arg.take).toBeLessThanOrEqual(5000);
  });

  it('ignores non-array recipient groups instead of crashing', async () => {
    const out = await run([
      { isSent: true, fromAddress: ME, toAddresses: 'not-an-array' as never, ccAddresses: null as never },
    ]);
    expect(out).toHaveLength(0);
  });
});
