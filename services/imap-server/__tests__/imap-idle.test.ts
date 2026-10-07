// ============================================================================
// IMAP4rev1 Daemon - RFC 2177 IDLE Push Tests (<30ms latency / Task W33-11)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import net from 'node:net';
import argon2 from 'argon2';
import { ImapServer } from '../src/server';
import { MailboxManager } from '../src/mailbox';
import { ImapEventBus } from '../src/events';
import type { PrismaClient } from '@quant/database';

describe('RFC 2177 IMAP IDLE Push Engine (<30ms latency)', () => {
  let server: ImapServer;
  let port: number;
  let eventBus: ImapEventBus;
  let mockPrisma: any;
  let testPasswordHash: string;

  beforeEach(async () => {
    testPasswordHash = await argon2.hash('IdleSecret2026!');

    const folderRecord = {
      id: 'fld_inbox_idle',
      userId: 'usr_idle',
      name: 'INBOX',
      type: 'INBOX',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    mockPrisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'usr_idle',
          email: 'idleuser@quantmail.in',
          username: 'idleuser',
          displayName: 'Idle User',
          passwordHash: testPasswordHash,
        }),
      },
      emailFolder: {
        findFirst: vi.fn().mockResolvedValue(folderRecord),
        findMany: vi.fn().mockResolvedValue([folderRecord]),
        create: vi.fn().mockResolvedValue(folderRecord),
      },
      email: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'msg_idle_1',
            userId: 'usr_idle',
            folderId: 'fld_inbox_idle',
            fromAddress: 'sender@quantmail.in',
            toAddresses: ['idleuser@quantmail.in'],
            subject: 'Existing Email',
            bodyPlain: 'Welcome!',
            isRead: true,
            isStarred: false,
            isTrash: false,
            isDraft: false,
            createdAt: new Date('2026-09-23T12:00:00Z'),
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const mailboxManager = new MailboxManager(mockPrisma as unknown as PrismaClient);
    eventBus = new ImapEventBus();

    server = new ImapServer({
      tlsPort: 0,
      cleartextPort: 0,
      mailboxManager,
      eventBus,
      db: mockPrisma as unknown as PrismaClient,
    });

    const started = await server.start();
    port = started.cleartextPort;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('binds to Redis PubSub, receives untagged push in <30ms, and gracefully exits on DONE', async () => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setEncoding('utf-8');

    let transcript = '';
    let isIdling = false;
    let pushReceivedAt = 0;
    let publishTriggeredAt = 0;

    await new Promise<void>((resolve, reject) => {
      socket.on('data', (data: string) => {
        transcript += data;

        // 1. Initial greeting -> Login
        if (transcript.includes('* OK') && !transcript.includes('I1 ')) {
          socket.write('I1 LOGIN "idleuser@quantmail.in" "IdleSecret2026!"\r\n');
        }

        // 2. Login complete -> Select INBOX
        if (transcript.includes('I1 OK') && !transcript.includes('I2 ')) {
          socket.write('I2 SELECT INBOX\r\n');
        }

        // 3. Select complete -> Enter IDLE
        if (transcript.includes('I2 OK') && !transcript.includes('I3 ')) {
          socket.write('I3 IDLE\r\n');
        }

        // 4. Server acknowledges IDLE with `+ idling` continuation
        if (transcript.includes('+ idling') && !isIdling) {
          isIdling = true;

          // Trigger simulated incoming email event via event bus
          setTimeout(() => {
            publishTriggeredAt = performance.now();
            void eventBus.publish('usr_idle', 'fld_inbox_idle', {
              emailId: 'new_msg_999',
              folderId: 'fld_inbox_idle',
              userId: 'usr_idle',
              timestamp: Date.now(),
              newCount: 2,
              recentCount: 1,
            });
          }, 50);
        }

        // 5. Untagged EXISTS and RECENT received
        if (isIdling && transcript.includes('* 2 EXISTS') && transcript.includes('* 1 RECENT')) {
          if (pushReceivedAt === 0) {
            pushReceivedAt = performance.now();
            // Client terminates IDLE mode with DONE
            socket.write('DONE\r\n');
          }
        }

        // 6. IDLE completed confirmed
        if (transcript.includes('I3 OK IDLE completed')) {
          socket.write('I4 LOGOUT\r\n');
          resolve();
        }
      });

      socket.on('error', reject);
    });

    // Verification of protocol and performance
    expect(transcript).toContain('+ idling');
    expect(transcript).toContain('* 2 EXISTS');
    expect(transcript).toContain('* 1 RECENT');
    expect(transcript).toContain('I3 OK IDLE completed');

    // Strict performance verification: Push latency must be < 30ms!
    expect(publishTriggeredAt).toBeGreaterThan(0);
    expect(pushReceivedAt).toBeGreaterThan(0);
    const latencyMs = pushReceivedAt - publishTriggeredAt;
    console.log(`[TEST: IMAP IDLE Push Latency]: ${latencyMs.toFixed(2)}ms`);
    expect(latencyMs).toBeLessThan(30); // Acceptance criteria requirement: <30ms

    socket.destroy();
  });
});
