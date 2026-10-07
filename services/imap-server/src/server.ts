// ============================================================================
// IMAP4rev1 Daemon - Stateful TCP Server (RFC 3501 / Port 993 & Port 143)
// ============================================================================

import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { MailboxManager } from './mailbox';
import { ImapEventBus } from './events';
import { IdleHandler } from './idle';
import { parseImapLine, executeImapCommand } from './commands';
import { resolveTlsKeyPair, type TlsKeyPair } from './tls';
import type { ImapSessionState } from './types';
import { prisma, type PrismaClient } from '@quant/database';

export interface ImapServerConfig {
  tlsPort?: number; // Port 993 (Implicit TLS)
  cleartextPort?: number; // Port 143 (STARTTLS)
  host?: string;
  tls?: Partial<TlsKeyPair>;
  mailboxManager?: MailboxManager;
  eventBus?: ImapEventBus;
  db?: PrismaClient;
}

/**
 * Stateful RFC 3501 IMAP4rev1 server daemon.
 * Dual-listener architecture:
 * - Port 993: Implicit TLS (RFC 8314)
 * - Port 143: Opportunistic STARTTLS (RFC 3501 Section 6.2.1)
 */
export class ImapServer {
  private readonly config: Required<
    Omit<ImapServerConfig, 'tls' | 'mailboxManager' | 'eventBus' | 'db'>
  > & {
    tls: TlsKeyPair;
  };
  private readonly mailboxManager: MailboxManager;
  private readonly eventBus: ImapEventBus;
  private readonly db: PrismaClient;

  private tlsServer: tls.Server | null = null;
  private tcpServer: net.Server | null = null;
  private readonly activeSockets: Set<net.Socket> = new Set();

  constructor(options: ImapServerConfig = {}) {
    const tlsKeyPair = resolveTlsKeyPair(options.tls);

    this.config = {
      tlsPort: options.tlsPort ?? Number(process.env['IMAP_TLS_PORT'] ?? 993),
      cleartextPort: options.cleartextPort ?? Number(process.env['IMAP_PORT'] ?? 143),
      host: options.host ?? process.env['HOST'] ?? '0.0.0.0',
      tls: tlsKeyPair,
    };

    this.db = options.db || (prisma as PrismaClient);
    this.mailboxManager = options.mailboxManager ?? new MailboxManager(this.db);
    this.eventBus = options.eventBus ?? new ImapEventBus();
  }

  /**
   * Starts both IMAP listeners (Port 993 and Port 143).
   */
  async start(): Promise<{ tlsPort: number; cleartextPort: number }> {
    // 1. Initialize Port 993 (Implicit TLS)
    this.tlsServer = tls.createServer(
      {
        key: this.config.tls.key,
        cert: this.config.tls.cert,
      },
      (socket) => this.handleConnection(socket, true),
    );

    // 2. Initialize Port 143 (Cleartext + STARTTLS)
    this.tcpServer = net.createServer((socket) => this.handleConnection(socket, false));

    const [tlsPort, cleartextPort] = await Promise.all([
      this.listenServer(this.tlsServer, this.config.tlsPort),
      this.listenServer(this.tcpServer, this.config.cleartextPort),
    ]);

    return { tlsPort, cleartextPort };
  }

  /**
   * Graceful shutdown of servers, active sockets, and event listeners.
   */
  async stop(): Promise<void> {
    for (const socket of this.activeSockets) {
      try {
        socket.destroy();
      } catch {
        // Ignore
      }
    }
    this.activeSockets.clear();

    const promises: Promise<void>[] = [];

    if (this.tlsServer) {
      promises.push(
        new Promise<void>((resolve) => {
          this.tlsServer?.close(() => {
            this.tlsServer = null;
            resolve();
          });
        }),
      );
    }

    if (this.tcpServer) {
      promises.push(
        new Promise<void>((resolve) => {
          this.tcpServer?.close(() => {
            this.tcpServer = null;
            resolve();
          });
        }),
      );
    }

    await Promise.all(promises);
    await this.eventBus.close();
  }

  /**
   * Connection lifecycle handler for raw TCP / TLS socket.
   */
  private handleConnection(initialSocket: net.Socket, isTls: boolean): void {
    let currentSocket: net.Socket = initialSocket;
    this.activeSockets.add(currentSocket);

    const session: ImapSessionState = {
      id: randomUUID(),
      state: 'NOT_AUTHENTICATED',
      isTls,
      isIdling: false,
      createdAt: new Date(),
    };

    let idleHandler = new IdleHandler(session, currentSocket, this.eventBus);
    let lineBuffer = '';

    const setupSocketListeners = (socket: net.Socket) => {
      socket.setEncoding('utf-8');

      // Send initial greeting
      const caps = `IMAP4rev1 ${!session.isTls ? 'STARTTLS ' : ''}AUTH=PLAIN IDLE UNSELECT UIDPLUS NAMESPACE`;
      socket.write(`* OK [CAPABILITY ${caps}] IMAP4rev1 Server ready\r\n`);

      socket.on('data', (chunk: string) => {
        lineBuffer += chunk;

        while (lineBuffer.includes('\n')) {
          const newlineIndex = lineBuffer.indexOf('\n');
          const rawLine = lineBuffer.slice(0, newlineIndex).replace(/\r$/, '');
          lineBuffer = lineBuffer.slice(newlineIndex + 1);

          if (!rawLine.trim()) continue;

          // Special case: client sending DONE while in IDLE
          if (session.isIdling && rawLine.trim().toUpperCase() === 'DONE') {
            idleHandler.stop();
            continue;
          }

          const parsed = parseImapLine(rawLine);
          if (!parsed) {
            socket.write('* BAD Malformed IMAP syntax\r\n');
            continue;
          }

          void executeImapCommand(parsed, {
            session,
            socket,
            mailboxManager: this.mailboxManager,
            idleHandler,
            db: this.db,
            onStartTls: () => {
              this.upgradeToTls(socket, session, (upgradedSocket) => {
                this.activeSockets.delete(socket);
                currentSocket = upgradedSocket;
                this.activeSockets.add(currentSocket);
                idleHandler = new IdleHandler(session, currentSocket, this.eventBus);
                setupSocketListeners(currentSocket);
              });
            },
          });
        }
      });

      socket.on('close', () => {
        idleHandler.cleanup();
        this.activeSockets.delete(socket);
      });

      socket.on('error', () => {
        idleHandler.cleanup();
        this.activeSockets.delete(socket);
      });
    };

    setupSocketListeners(currentSocket);
  }

  /**
   * Upgrades a cleartext TCP socket on Port 143 to TLS via STARTTLS.
   */
  private upgradeToTls(
    socket: net.Socket,
    session: ImapSessionState,
    onUpgraded: (tlsSocket: tls.TLSSocket) => void,
  ): void {
    socket.removeAllListeners('data');

    const tlsSocket = new tls.TLSSocket(socket, {
      isServer: true,
      secureContext: tls.createSecureContext({
        key: this.config.tls.key,
        cert: this.config.tls.cert,
      }),
    });

    tlsSocket.on('secure', () => {
      session.isTls = true;
      onUpgraded(tlsSocket);
    });

    tlsSocket.on('error', () => {
      socket.destroy();
    });
  }

  /**
   * Helper to bind server and retrieve actual allocated port.
   */
  private async listenServer(server: net.Server, port: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, this.config.host, () => {
        server.removeListener('error', reject);
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          resolve(addr.port);
        } else {
          resolve(port);
        }
      });
    });
  }
}
