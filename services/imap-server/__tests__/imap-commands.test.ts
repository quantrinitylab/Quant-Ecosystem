// ============================================================================
// IMAP4rev1 Daemon - Command Grammar & Mailbox Tests (RFC 3501 / Task W33-10)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import net from 'node:net';
import tls from 'node:tls';
import argon2 from 'argon2';
import { ImapServer } from '../src/server';
import { MailboxManager } from '../src/mailbox';
import { ImapEventBus } from '../src/events';
import { parseSequenceSet, parseImapLine } from '../src/commands';
import type { PrismaClient } from '@quant/database';

describe('IMAP Command Line & Sequence Parsing', () => {
  it('parses basic IMAP commands with quoted arguments', () => {
    const parsed = parseImapLine('A001 LOGIN "alice@quantmail.in" "secretPassword"');
    expect(parsed).not.toBeNull();
    expect(parsed?.tag).toBe('A001');
    expect(parsed?.command).toBe('LOGIN');
    expect(parsed?.args).toEqual(['alice@quantmail.in', 'secretPassword']);
  });

  it('parses parenthesized flag arguments', () => {
    const parsed = parseImapLine('A002 STORE 1:5 +FLAGS (\\Seen \\Flagged)');
    expect(parsed).not.toBeNull();
    expect(parsed?.tag).toBe('A002');
    expect(parsed?.command).toBe('STORE');
    expect(parsed?.args[0]).toBe('1:5');
    expect(parsed?.args[1]).toBe('+FLAGS');
    expect(parsed?.args[2]).toBe('(\\Seen \\Flagged)');
  });

  it('parses sequence sets correctly', () => {
    expect(parseSequenceSet('1', 10)).toEqual([1]);
    expect(parseSequenceSet('1:3', 10)).toEqual([1, 2, 3]);
    expect(parseSequenceSet('2:4,7', 10)).toEqual([2, 3, 4, 7]);
    expect(parseSequenceSet('8:*', 10)).toEqual([8, 9, 10]);
  });
});

describe('MailboxManager - RFC 3501 Storage Logic', () => {
  let mockPrisma: any;
  let manager: MailboxManager;

  beforeEach(() => {
    mockPrisma = {
      emailFolder: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
      },
      email: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };
    manager = new MailboxManager(mockPrisma as unknown as PrismaClient);
  });

  it('calculates deterministic UIDVALIDITY from folder creation date', () => {
    const date1 = new Date('2026-01-01T00:00:00Z');
    const date2 = new Date('2026-01-01T00:00:00Z');
    const date3 = new Date('2026-06-15T12:00:00Z');

    const uv1 = MailboxManager.calculateUidValidity(date1);
    const uv2 = MailboxManager.calculateUidValidity(date2);
    const uv3 = MailboxManager.calculateUidValidity(date3);

    expect(uv1).toBe(uv2);
    expect(uv1).toBe(Math.floor(date1.getTime() / 1000));
    expect(uv3).not.toBe(uv1);
    expect(uv1).toBeGreaterThan(0);
  });

  it('formats RFC 3501 ENVELOPE structure correctly', () => {
    const item: any = {
      date: new Date('2026-09-23T12:00:00Z'),
      subject: 'Quarterly Earnings',
      from: 'Astra <astra@quantmail.in>',
      to: ['developer@quantmail.in'],
      messageId: '<earnings-2026@quantmail.in>',
      inReplyTo: null,
    };

    const envelope = manager.formatEnvelope(item);
    expect(envelope).toContain('"Quarterly Earnings"');
    expect(envelope).toContain('"astra"');
    expect(envelope).toContain('"quantmail.in"');
    expect(envelope).toContain('"<earnings-2026@quantmail.in>"');
  });

  it('formats RFC 3501 BODYSTRUCTURE for text/plain', () => {
    const item: any = {
      bodyPlain: 'Line 1\nLine 2\nLine 3',
      size: 512,
    };

    const structure = manager.formatBodyStructure(item);
    expect(structure).toContain('"TEXT" "PLAIN"');
    expect(structure).toContain('512');
    expect(structure).toContain('3');
  });
});

describe('ImapServer - Stateful TCP Server & Standard Mail Client Commands', () => {
  let server: ImapServer;
  let cleartextPort: number;
  let tlsPort: number;
  let mockPrisma: any;
  let testPasswordHash: string;

  beforeEach(async () => {
    testPasswordHash = await argon2.hash('ImapSecretPass2026!');

    const folderCreatedAt = new Date('2026-01-15T10:00:00Z');
    const folderRecord = {
      id: 'fld_inbox',
      userId: 'usr_imap',
      name: 'INBOX',
      type: 'INBOX',
      createdAt: folderCreatedAt,
    };

    const emailRecords = [
      {
        id: 'msg_1',
        userId: 'usr_imap',
        folderId: 'fld_inbox',
        fromAddress: 'alice@quantmail.in',
        toAddresses: ['bob@quantmail.in'],
        ccAddresses: [],
        bccAddresses: [],
        subject: 'First Mail',
        bodyPlain: 'Hello Bob!',
        isRead: false,
        isStarred: false,
        isTrash: false,
        isDraft: false,
        createdAt: new Date('2026-09-23T10:00:00Z'),
      },
      {
        id: 'msg_2',
        userId: 'usr_imap',
        folderId: 'fld_inbox',
        fromAddress: 'charlie@quantmail.in',
        toAddresses: ['bob@quantmail.in'],
        ccAddresses: [],
        bccAddresses: [],
        subject: 'Important Update',
        bodyPlain: 'Please review the update.',
        isRead: true,
        isStarred: true,
        isTrash: false,
        isDraft: false,
        createdAt: new Date('2026-09-23T11:00:00Z'),
      },
    ];

    mockPrisma = {
      user: {
        findFirst: vi.fn().mockImplementation((args) => {
          const userOrEmail = args.where.OR[0].email;
          if (userOrEmail === 'bob@quantmail.in' || userOrEmail === 'bob') {
            return Promise.resolve({
              id: 'usr_imap',
              email: 'bob@quantmail.in',
              username: 'bob',
              displayName: 'Bob Quant',
              passwordHash: testPasswordHash,
            });
          }
          return Promise.resolve(null);
        }),
      },
      emailFolder: {
        findFirst: vi.fn().mockResolvedValue(folderRecord),
        findMany: vi.fn().mockResolvedValue([
          folderRecord,
          {
            id: 'fld_sent',
            userId: 'usr_imap',
            name: 'Sent',
            type: 'SENT',
            createdAt: folderCreatedAt,
          },
          {
            id: 'fld_trash',
            userId: 'usr_imap',
            name: 'Trash',
            type: 'TRASH',
            createdAt: folderCreatedAt,
          },
        ]),
        create: vi.fn().mockResolvedValue(folderRecord),
      },
      email: {
        findMany: vi.fn().mockResolvedValue(emailRecords),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const mailboxManager = new MailboxManager(mockPrisma as unknown as PrismaClient);
    const eventBus = new ImapEventBus();

    server = new ImapServer({
      tlsPort: 0,
      cleartextPort: 0,
      mailboxManager,
      eventBus,
      db: mockPrisma as unknown as PrismaClient,
    });

    const started = await server.start();
    cleartextPort = started.cleartextPort;
    tlsPort = started.tlsPort;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('negotiates CAPABILITY and rejects protected commands before LOGIN', async () => {
    const transcript = await sendImapCommands(cleartextPort, [
      'A1 CAPABILITY',
      'A2 SELECT INBOX',
      'A3 NOOP',
    ]);

    expect(transcript).toContain('* OK [CAPABILITY');
    expect(transcript).toContain('IMAP4rev1');
    expect(transcript).toContain('A1 OK CAPABILITY completed');
    expect(transcript).toContain('A2 NO Must authenticate');
    expect(transcript).toContain('A3 OK NOOP completed');
  });

  it('authenticates via LOGIN and handles SELECT, FETCH, STORE, SEARCH, EXPUNGE', async () => {
    const transcript = await sendImapCommands(cleartextPort, [
      'B1 LOGIN "bob@quantmail.in" "ImapSecretPass2026!"',
      'B2 LIST "" "*"',
      'B3 SELECT INBOX',
      'B4 FETCH 1:* (FLAGS RFC822.SIZE ENVELOPE BODYSTRUCTURE UID)',
      'B5 STORE 1 +FLAGS (\\Seen \\Flagged)',
      'B6 SEARCH ALL',
      'B7 SEARCH FLAGGED',
      'B8 STORE 2 +FLAGS (\\Deleted)',
      'B9 EXPUNGE',
      'B10 LOGOUT',
    ]);

    // LOGIN
    expect(transcript).toContain('B1 OK');
    expect(transcript).toContain('Logged in');

    // LIST
    expect(transcript).toContain('* LIST (\\HasNoChildren \\Inbox) "/" "INBOX"');
    expect(transcript).toContain('* LIST (\\HasNoChildren \\Sent) "/" "Sent"');
    expect(transcript).toContain('B2 OK LIST completed');

    // SELECT
    expect(transcript).toContain('* 2 EXISTS');
    expect(transcript).toContain('UIDVALIDITY');
    expect(transcript).toContain('UIDNEXT');
    expect(transcript).toContain('B3 OK [READ-WRITE] SELECT completed');

    // FETCH
    expect(transcript).toContain('* 1 FETCH');
    expect(transcript).toContain('RFC822.SIZE');
    expect(transcript).toContain('ENVELOPE');
    expect(transcript).toContain('BODYSTRUCTURE');
    expect(transcript).toContain('UID 1');
    expect(transcript).toContain('B4 OK FETCH completed');

    // STORE
    expect(transcript).toContain('* 1 FETCH (FLAGS (\\Seen \\Flagged))');
    expect(transcript).toContain('B5 OK STORE completed');

    // SEARCH
    expect(transcript).toContain('* SEARCH 1 2');
    expect(transcript).toContain('B6 OK SEARCH completed');

    // EXPUNGE
    expect(transcript).toContain('* 2 EXPUNGE');
    expect(transcript).toContain('B9 OK EXPUNGE completed');

    // LOGOUT
    expect(transcript).toContain('* BYE IMAP4rev1 Server logging out');
    expect(transcript).toContain('B10 OK LOGOUT completed');
  });

  it('supports UID FETCH and UID SEARCH commands', async () => {
    const transcript = await sendImapCommands(cleartextPort, [
      'C1 LOGIN "bob" "ImapSecretPass2026!"',
      'C2 SELECT INBOX',
      'C3 UID SEARCH ALL',
      'C4 UID FETCH 1 (FLAGS UID)',
      'C5 LOGOUT',
    ]);

    expect(transcript).toContain('C1 OK');
    expect(transcript).toContain('* SEARCH 1 2');
    expect(transcript).toContain('C3 OK UID SEARCH completed');
    expect(transcript).toContain('* 1 FETCH (UID 1');
    expect(transcript).toContain('C4 OK FETCH completed');
  });

  it('authenticates over Port 993 (implicit TLS)', async () => {
    const transcript = await sendImapCommandsTls(tlsPort, [
      'T1 CAPABILITY',
      'T2 LOGIN "bob@quantmail.in" "ImapSecretPass2026!"',
      'T3 STATUS INBOX (MESSAGES UNSEEN)',
      'T4 LOGOUT',
    ]);

    expect(transcript).toContain('T1 OK CAPABILITY completed');
    expect(transcript).toContain('T2 OK');
    expect(transcript).toContain('* STATUS "INBOX" (MESSAGES 2 UNSEEN 1)');
    expect(transcript).toContain('T3 OK STATUS completed');
    expect(transcript).toContain('T4 OK LOGOUT completed');
  });
});

/** Helper to send commands over cleartext TCP connection */
function sendImapCommands(port: number, commands: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let transcript = '';
    let commandIdx = 0;

    socket.setEncoding('utf-8');

    socket.on('data', (data) => {
      transcript += data;
      const lines = data.split('\r\n').filter((l) => l.trim().length > 0);

      for (const line of lines) {
        // Tagged response completes the active command
        if (commandIdx < commands.length) {
          const currentCmd = commands[commandIdx]!;
          const currentTag = currentCmd.split(' ')[0]!;

          if (line.startsWith(`${currentTag} `)) {
            commandIdx++;
            if (commandIdx < commands.length) {
              socket.write(`${commands[commandIdx]}\r\n`);
            }
          }
        }
      }

      // Initial greeting triggers first command
      if (commandIdx === 0 && transcript.includes('* OK') && commands.length > 0) {
        socket.write(`${commands[0]}\r\n`);
      }
    });

    socket.on('close', () => {
      resolve(transcript);
    });

    socket.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      socket.destroy();
      resolve(transcript);
    }, 4000);
  });
}

/** Helper to send commands over TLS socket */
function sendImapCommandsTls(port: number, commands: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = tls.connect({
      port,
      host: '127.0.0.1',
      rejectUnauthorized: false,
    });
    let transcript = '';
    let commandIdx = 0;

    socket.setEncoding('utf-8');

    socket.on('data', (data) => {
      transcript += data;
      const lines = data.split('\r\n').filter((l) => l.trim().length > 0);

      for (const line of lines) {
        if (commandIdx < commands.length) {
          const currentCmd = commands[commandIdx]!;
          const currentTag = currentCmd.split(' ')[0]!;

          if (line.startsWith(`${currentTag} `)) {
            commandIdx++;
            if (commandIdx < commands.length) {
              socket.write(`${commands[commandIdx]}\r\n`);
            }
          }
        }
      }

      if (commandIdx === 0 && transcript.includes('* OK') && commands.length > 0) {
        socket.write(`${commands[0]}\r\n`);
      }
    });

    socket.on('close', () => {
      resolve(transcript);
    });

    socket.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      socket.destroy();
      resolve(transcript);
    }, 4000);
  });
}
