import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  DeliverabilityAuthService,
  DkimSigner,
  type DnsResolverPort,
} from '../services/deliverability-auth.service';
import {
  InboundIngestAdapter,
  type EmailIndexerPort,
  type InboundRawMessage,
} from '../services/inbound-ingest.service';

/**
 * Unit tests for the inbound ingest adapter's authentication + quarantine
 * routing (QuantMail SuperHub — Pillar 1, Phase 2, task 7.3).
 *
 * These tests exercise the REAL implementations from task 7.1:
 *   - `DeliverabilityAuthService.verifyInbound` (SPF/DKIM/DMARC) with DNS behind
 *     an injected FAKE `DnsResolverPort` seeded with TXT/MX/A zones so the whole
 *     suite runs fully offline.
 *   - `InboundIngestAdapter.ingest` with the REAL `EmailService` + `ThreadService`
 *     backed by a mocked Prisma client, and a spy `EmailIndexerPort`.
 *
 * Coverage:
 *   1. AuthVerdict recording (Req 5.1) — passing SPF/DKIM/DMARC yields a verdict
 *      with `aligned === true` that is persisted on the email (`authResults`).
 *   2. Routing on pass (Req 5.2) — an authenticated message is persisted,
 *      thread-stitched (threadId set), routed to INBOX (not spam), and indexed.
 *   3. Quarantine on DMARC failure (Req 5.3) — a message that fails DMARC
 *      alignment is routed to SPAM (isSpam=true), NOT the inbox, and NOT indexed.
 *   4. Focused `verifyInbound` checks for SPF pass/fail and DKIM alignment using
 *      the fake DNS resolver.
 */

// ---------------------------------------------------------------------------
// Fake DNS resolver — seeded zones make SPF/DKIM/DMARC fully testable offline.
// ---------------------------------------------------------------------------

interface SeededZones {
  txt?: Record<string, string[][]>;
  mx?: Record<string, Array<{ exchange: string; priority: number }>>;
  a?: Record<string, string[]>;
  aaaa?: Record<string, string[]>;
}

class FakeDnsResolver implements DnsResolverPort {
  constructor(private readonly zones: SeededZones) {}

  async resolveTxt(hostname: string): Promise<string[][]> {
    const record = this.zones.txt?.[hostname.toLowerCase()];
    if (!record) {
      throw Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    }
    return record;
  }

  async resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>> {
    const record = this.zones.mx?.[domain.toLowerCase()];
    if (!record) {
      throw Object.assign(new Error(`ENOTFOUND ${domain}`), { code: 'ENOTFOUND' });
    }
    return record;
  }

  async resolve4(hostname: string): Promise<string[]> {
    const record = this.zones.a?.[hostname.toLowerCase()];
    if (!record) {
      throw Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    }
    return record;
  }

  async resolve6(hostname: string): Promise<string[]> {
    const record = this.zones.aaaa?.[hostname.toLowerCase()];
    if (!record) {
      throw Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    }
    return record;
  }
}

// ---------------------------------------------------------------------------
// Mocked Prisma — supplies just the delegate surface the real EmailService and
// ThreadService touch during an inbound ingest of a brand-new thread.
// ---------------------------------------------------------------------------

const INBOX_FOLDER_ID = 'folder-inbox-1';
const SPAM_FOLDER_ID = 'folder-spam-1';
const RECIPIENT_USER_ID = 'user-1';
const NEW_THREAD_ID = 'thread-1';

function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(async (args: { where: { email: string } }) =>
        args.where.email === 'alice@quantmail.test' ? { id: RECIPIENT_USER_ID } : null,
      ),
    },
    emailFolder: {
      findFirst: vi.fn(async (args: { where: { userId: string; type: string } }) =>
        args.where.type === 'SPAM' ? { id: SPAM_FOLDER_ID } : { id: INBOX_FOLDER_ID },
      ),
    },
    emailThread: {
      // New-thread path: no existing thread matches by subject.
      findMany: vi.fn(async () => [] as unknown[]),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: NEW_THREAD_ID,
        ...args.data,
      })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        ...args.data,
      })),
    },
    email: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'email-1',
        ...args.data,
      })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        ...args.data,
      })),
    },
  };
}

/** A spy indexer so we can assert whether index() was (or was not) invoked. */
function createSpyIndexer(): EmailIndexerPort & { index: ReturnType<typeof vi.fn> } {
  return { index: vi.fn(async () => undefined) };
}

/** Pull the `data` object passed to the (single) email.create call. */
function emailCreateData(prisma: ReturnType<typeof createMockPrisma>): Record<string, unknown> {
  expect(prisma.email.create).toHaveBeenCalledTimes(1);
  return (prisma.email.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
}

// ---------------------------------------------------------------------------
// Message + DNS builders.
// ---------------------------------------------------------------------------

const RECIPIENT = 'alice@quantmail.test';

/** A DMARC-aligned (SPF-aligned) inbound message from example.com. */
function buildPassingMessage(): InboundRawMessage {
  return {
    from: 'Newsletter <news@example.com>',
    to: [RECIPIENT],
    subject: 'Your weekly digest',
    text: 'Hello from a properly authenticated sender.',
    html: '<p>Hello from a properly authenticated sender.</p>',
    messageId: '<pass-1@example.com>',
    inReplyTo: null,
    date: new Date('2024-01-01T00:00:00Z'),
    envelopeFrom: 'bounce@example.com',
    clientIp: '203.0.113.10',
  };
}

/**
 * A spoofed message: From header is example.com but it is sent from an
 * unaligned envelope domain (mailer.net). SPF passes for mailer.net but does
 * NOT align with example.com, no DKIM, and example.com publishes a DMARC policy
 * -> dmarc === 'fail' -> must be quarantined.
 */
function buildDmarcFailMessage(): InboundRawMessage {
  return {
    from: 'Newsletter <news@example.com>',
    to: [RECIPIENT],
    subject: 'Urgent: verify your account',
    text: 'This message is not aligned with the From domain.',
    messageId: '<spoof-1@mailer.net>',
    inReplyTo: null,
    date: new Date('2024-01-02T00:00:00Z'),
    envelopeFrom: 'bounce@mailer.net',
    clientIp: '198.51.100.5',
  };
}

/** DNS zones supporting both the passing and the DMARC-fail scenarios. */
function buildZones(): SeededZones {
  return {
    txt: {
      // example.com authorizes 203.0.113.10 and publishes a DMARC reject policy.
      'example.com': [['v=spf1 ip4:203.0.113.10 -all']],
      '_dmarc.example.com': [['v=DMARC1; p=reject; rua=mailto:dmarc@example.com']],
      // mailer.net authorizes 198.51.100.5 (passes SPF but won't align to example.com).
      'mailer.net': [['v=spf1 ip4:198.51.100.5 -all']],
    },
  };
}

function makeAdapter(
  prisma: ReturnType<typeof createMockPrisma>,
  zones: SeededZones,
  indexer: EmailIndexerPort,
): InboundIngestAdapter {
  const auth = new DeliverabilityAuthService(prisma as never, {
    dns: new FakeDnsResolver(zones),
  });
  return new InboundIngestAdapter(prisma as never, auth, { indexer });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InboundIngestAdapter.ingest — auth recording + quarantine routing (Reqs 5.1/5.2/5.3)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let indexer: ReturnType<typeof createSpyIndexer>;

  beforeEach(() => {
    prisma = createMockPrisma();
    indexer = createSpyIndexer();
  });

  it('records the combined AuthVerdict on the persisted email when SPF/DMARC pass (Req 5.1)', async () => {
    const adapter = makeAdapter(prisma, buildZones(), indexer);

    const email = await adapter.ingest(buildPassingMessage());

    const data = emailCreateData(prisma);
    const verdict = data['authResults'] as {
      spf: string;
      dmarc: string;
      aligned: boolean;
      details: { fromDomain: string | null; spfAligned: boolean };
    };

    // The AuthVerdict is recorded on the email (Req 5.1)...
    expect(verdict).toBeDefined();
    expect(verdict.spf).toBe('pass');
    expect(verdict.dmarc).toBe('pass');
    expect(verdict.aligned).toBe(true);
    expect(verdict.details.fromDomain).toBe('example.com');
    expect(verdict.details.spfAligned).toBe(true);

    // ...and is reflected on the returned (persisted) email row.
    expect((email as unknown as { authResults: { aligned: boolean } }).authResults.aligned).toBe(
      true,
    );
  });

  it('persists, thread-stitches, routes to INBOX, and indexes an authenticated message (Req 5.2)', async () => {
    const adapter = makeAdapter(prisma, buildZones(), indexer);

    const email = await adapter.ingest(buildPassingMessage());

    const data = emailCreateData(prisma);

    // Routed to the INBOX folder, not spam.
    expect(data['folderId']).toBe(INBOX_FOLDER_ID);
    expect(data['isSpam']).toBe(false);
    expect(data['deliveryStatus']).toBe('delivered');

    // Thread-stitched: a new thread was created and its id recorded on the email.
    expect(prisma.emailThread.create).toHaveBeenCalledTimes(1);
    expect(data['threadId']).toBe(NEW_THREAD_ID);
    expect((email as unknown as { threadId: string }).threadId).toBe(NEW_THREAD_ID);

    // The passing message IS indexed (Req 5.2).
    expect(indexer.index).toHaveBeenCalledTimes(1);
    expect(indexer.index).toHaveBeenCalledWith(email);
  });

  it('quarantines a DMARC-misaligned message to SPAM and does NOT index it (Req 5.3)', async () => {
    const adapter = makeAdapter(prisma, buildZones(), indexer);

    await adapter.ingest(buildDmarcFailMessage());

    const data = emailCreateData(prisma);
    const verdict = data['authResults'] as { dmarc: string; aligned: boolean };

    // The verdict fails DMARC alignment...
    expect(verdict.dmarc).toBe('fail');
    expect(verdict.aligned).toBe(false);

    // ...so the message is quarantined to SPAM (flagged isSpam), NOT the inbox.
    expect(data['folderId']).toBe(SPAM_FOLDER_ID);
    expect(data['isSpam']).toBe(true);

    // Quarantined mail is NOT indexed (Req 5.3).
    expect(indexer.index).not.toHaveBeenCalled();
  });

  it('static shouldQuarantine() is true exactly when DMARC fails', () => {
    expect(InboundIngestAdapter.shouldQuarantine({ dmarc: 'fail' } as never)).toBe(true);
    expect(InboundIngestAdapter.shouldQuarantine({ dmarc: 'pass' } as never)).toBe(false);
    expect(InboundIngestAdapter.shouldQuarantine({ dmarc: 'none' } as never)).toBe(false);
  });

  // ── Smart-inbox categorization (QM-SMART-INBOX) ──────────────────────────
  // The category tabs read `aiCategory`, a column nothing wrote before this
  // wiring. Ingest now runs SmartInboxService over non-quarantined mail and
  // persists the partition, so a facebook.com sender lands in `social` instead
  // of everything collapsing to Primary.

  it('writes aiCategory on a non-quarantined inbound message (social sender -> social)', async () => {
    const adapter = makeAdapter(prisma, buildZones(), indexer);

    // facebook.com publishes no DMARC record in the seeded zones, so dmarc is
    // 'none' -> not quarantined -> routed to INBOX and eligible for a category.
    const social: InboundRawMessage = {
      from: 'Facebook <notifications@facebook.com>',
      to: [RECIPIENT],
      subject: 'You have a new friend request',
      text: 'Someone wants to connect with you.',
      messageId: '<social-1@facebook.com>',
      inReplyTo: null,
      date: new Date('2024-01-03T00:00:00Z'),
      envelopeFrom: 'bounce@facebook.com',
      clientIp: '203.0.113.99',
    };

    await adapter.ingest(social);

    const data = emailCreateData(prisma);
    expect(data['isSpam']).toBe(false);
    expect(data['folderId']).toBe(INBOX_FOLDER_ID);
    // The whole point of the change: the column is populated, not null.
    expect(data['aiCategory']).toBe('social');
  });

  it('does NOT categorize a quarantined (DMARC-fail) message — spam has no partition', async () => {
    const adapter = makeAdapter(prisma, buildZones(), indexer);

    await adapter.ingest(buildDmarcFailMessage());

    const data = emailCreateData(prisma);
    expect(data['isSpam']).toBe(true);
    // Quarantined mail belongs to Spam, never to a category tab: aiCategory
    // must be absent so it cannot surface under Primary/Social/etc.
    expect(data['aiCategory']).toBeUndefined();
  });

  it("a user's learned correction overrides the built-in heuristic for that sender", async () => {
    // The built-in rules would sort notifications@facebook.com as `social`, but
    // this user has previously moved that sender's mail to `updates`. The
    // learned decision must win.
    const learnedCategory = {
      lookup: vi.fn(async (_userId: string, sender: string) =>
        sender.toLowerCase().includes('facebook.com') ? 'updates' : null,
      ),
      record: vi.fn(async () => undefined),
    };
    const auth = new DeliverabilityAuthService(prisma as never, {
      dns: new FakeDnsResolver(buildZones()),
    });
    const adapter = new InboundIngestAdapter(prisma as never, auth, {
      indexer,
      learnedCategory,
    });

    await adapter.ingest({
      from: 'Facebook <notifications@facebook.com>',
      to: [RECIPIENT],
      subject: 'You have a new friend request',
      text: 'Someone wants to connect.',
      messageId: '<learned-1@facebook.com>',
      inReplyTo: null,
      date: new Date('2024-01-04T00:00:00Z'),
      envelopeFrom: 'bounce@facebook.com',
      clientIp: '203.0.113.99',
    });

    expect(learnedCategory.lookup).toHaveBeenCalledTimes(1);
    const data = emailCreateData(prisma);
    // `updates` (learned) beats `social` (built-in rule for facebook.com).
    expect(data['aiCategory']).toBe('updates');
  });
});

describe('DeliverabilityAuthService.verifyInbound — SPF pass/fail + DKIM alignment (Req 5.1)', () => {
  it('returns spf=pass when the connecting IP is authorized by the envelope domain SPF record', async () => {
    const prisma = createMockPrisma();
    const auth = new DeliverabilityAuthService(prisma as never, {
      dns: new FakeDnsResolver(buildZones()),
    });

    const verdict = await auth.verifyInbound({
      headerFrom: 'news@example.com',
      headers: { from: 'news@example.com' },
      rawBody: 'hi',
      envelopeFrom: 'bounce@example.com',
      clientIp: '203.0.113.10',
    });

    expect(verdict.spf).toBe('pass');
    expect(verdict.details.spfAligned).toBe(true);
    expect(verdict.aligned).toBe(true);
    expect(verdict.dmarc).toBe('pass');
  });

  it('returns spf=fail when the connecting IP is not authorized by a `-all` SPF record', async () => {
    const prisma = createMockPrisma();
    const auth = new DeliverabilityAuthService(prisma as never, {
      dns: new FakeDnsResolver(buildZones()),
    });

    const verdict = await auth.verifyInbound({
      headerFrom: 'news@example.com',
      headers: { from: 'news@example.com' },
      rawBody: 'hi',
      envelopeFrom: 'bounce@example.com',
      clientIp: '192.0.2.99', // not in example.com's SPF record
    });

    expect(verdict.spf).toBe('fail');
    expect(verdict.details.spfAligned).toBe(false);
    // No DKIM either, but example.com publishes DMARC -> overall dmarc fails.
    expect(verdict.aligned).toBe(false);
    expect(verdict.dmarc).toBe('fail');
  });

  it('verifies a real DKIM signature and reports dkim=pass with alignment to the From domain', async () => {
    const prisma = createMockPrisma();

    // Generate a real RSA keypair; publish the public key at the DKIM selector.
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const pubB64 = publicKey.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

    const zones: SeededZones = {
      txt: {
        '_dmarc.example.com': [['v=DMARC1; p=reject']],
        'sel._domainkey.example.com': [[`v=DKIM1; k=rsa; p=${pubB64}`]],
      },
    };

    const signer = new DkimSigner({
      domain: 'example.com',
      selector: 'sel',
      privateKeyPem: privateKey,
    });

    const body = 'Signed body content for DKIM verification.\r\n';
    const headers: Record<string, string> = {
      from: 'alice@example.com',
      to: 'bob@quantmail.test',
      subject: 'DKIM signed message',
      date: new Date('2024-01-01T00:00:00Z').toUTCString(),
      'message-id': '<dkim-1@example.com>',
    };

    const dkimValue = signer.sign(headers, body);

    const auth = new DeliverabilityAuthService(prisma as never, {
      dns: new FakeDnsResolver(zones),
    });

    const verdict = await auth.verifyInbound({
      headerFrom: headers['from']!,
      headers: { ...headers, 'dkim-signature': dkimValue },
      rawBody: body,
    });

    expect(verdict.dkim).toBe('pass');
    expect(verdict.details.dkimDomain).toBe('example.com');
    expect(verdict.details.dkimAligned).toBe(true);
    // DKIM alignment alone satisfies DMARC even with no SPF.
    expect(verdict.aligned).toBe(true);
    expect(verdict.dmarc).toBe('pass');
  });

  it('reports dkim=fail when the body is tampered after signing', async () => {
    const prisma = createMockPrisma();

    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const pubB64 = publicKey.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

    const zones: SeededZones = {
      txt: {
        'sel._domainkey.example.com': [[`v=DKIM1; k=rsa; p=${pubB64}`]],
      },
    };

    const signer = new DkimSigner({
      domain: 'example.com',
      selector: 'sel',
      privateKeyPem: privateKey,
    });

    const headers: Record<string, string> = {
      from: 'alice@example.com',
      to: 'bob@quantmail.test',
      subject: 'DKIM signed message',
      date: new Date('2024-01-01T00:00:00Z').toUTCString(),
      'message-id': '<dkim-2@example.com>',
    };

    const dkimValue = signer.sign(headers, 'original body\r\n');

    const auth = new DeliverabilityAuthService(prisma as never, {
      dns: new FakeDnsResolver(zones),
    });

    const verdict = await auth.verifyInbound({
      headerFrom: headers['from']!,
      headers: { ...headers, 'dkim-signature': dkimValue },
      rawBody: 'TAMPERED body\r\n', // body hash will not match
    });

    expect(verdict.dkim).toBe('fail');
    expect(verdict.details.dkimAligned).toBe(false);
  });
});
