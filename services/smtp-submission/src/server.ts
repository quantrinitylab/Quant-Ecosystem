// ============================================================================
// SMTP Submission Daemon - Stateful TCP Server (RFC 6409 / RFC 8314)
// ============================================================================

import { SMTPServer, type SMTPServerSession, type SMTPServerAddress } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { SmtpAuthService, type AuthenticatedUser, SmtpError } from './auth';
import { verifySenderIdentity, sanitizeAndTraceMime } from './envelope';
import { OutboundSubmissionQueue } from './queue';
import { resolveTlsKeyPair, type TlsKeyPair } from './tls';

export interface SmtpSubmissionConfig {
  submissionPort?: number; // Port 587 (STARTTLS)
  smtpsPort?: number; // Port 465 (Implicit TLS)
  host?: string;
  submissionHost?: string;
  tls?: Partial<TlsKeyPair>;
  authService?: SmtpAuthService;
  queue?: OutboundSubmissionQueue;
  maxMessageSize?: number;
  allowInsecureAuth?: boolean;
}

/**
 * Stateful RFC 6409 authenticated SMTP submission daemon.
 * Manages dual TCP listeners:
 * - Port 587: Opportunistic STARTTLS (RFC 6409 / RFC 3207)
 * - Port 465: Implicit TLS / SMTPS (RFC 8314)
 */
export class SmtpSubmissionServer {
  private readonly config: Required<Omit<SmtpSubmissionConfig, 'tls' | 'authService' | 'queue'>> & {
    tls: TlsKeyPair;
  };
  private readonly authService: SmtpAuthService;
  private readonly queue: OutboundSubmissionQueue;

  private submissionServer: SMTPServer | null = null;
  private smtpsServer: SMTPServer | null = null;

  constructor(options: SmtpSubmissionConfig = {}) {
    const tlsKeyPair = resolveTlsKeyPair(options.tls);

    this.config = {
      submissionPort: options.submissionPort ?? Number(process.env['SUBMISSION_PORT'] ?? 587),
      smtpsPort: options.smtpsPort ?? Number(process.env['SMTPS_PORT'] ?? 465),
      host: options.host ?? process.env['HOST'] ?? '0.0.0.0',
      submissionHost:
        options.submissionHost ?? process.env['SUBMISSION_HOST'] ?? 'submission.quantmail.in',
      maxMessageSize: options.maxMessageSize ?? 50 * 1024 * 1024,
      allowInsecureAuth: options.allowInsecureAuth ?? process.env['NODE_ENV'] === 'test',
      tls: tlsKeyPair,
    };

    this.authService = options.authService ?? new SmtpAuthService();
    this.queue = options.queue ?? new OutboundSubmissionQueue();
  }

  /**
   * Starts both SMTP listeners (Port 587 and Port 465).
   */
  async start(): Promise<{ submissionPort: number; smtpsPort: number }> {
    // 1. Initialize Port 587 (Opportunistic STARTTLS)
    this.submissionServer = this.createSmtpInstance(false);
    // 2. Initialize Port 465 (Implicit TLS)
    this.smtpsServer = this.createSmtpInstance(true);

    const [subPort, smtpsPort] = await Promise.all([
      this.listenServer(this.submissionServer, this.config.submissionPort),
      this.listenServer(this.smtpsServer, this.config.smtpsPort),
    ]);

    return { submissionPort: subPort, smtpsPort };
  }

  /**
   * Gracefully stops both listeners and cleans up connections.
   */
  async stop(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.submissionServer) {
      promises.push(
        new Promise<void>((resolve) => {
          this.submissionServer?.close(() => {
            this.submissionServer = null;
            resolve();
          });
        }),
      );
    }

    if (this.smtpsServer) {
      promises.push(
        new Promise<void>((resolve) => {
          this.smtpsServer?.close(() => {
            this.smtpsServer = null;
            resolve();
          });
        }),
      );
    }

    await Promise.all(promises);
    await this.queue.close();
  }

  /**
   * Creates an SMTPServer instance configured for RFC 6409 submission.
   */
  private createSmtpInstance(isSecure: boolean): SMTPServer {
    return new SMTPServer({
      secure: isSecure,
      key: this.config.tls.key,
      cert: this.config.tls.cert,
      banner: 'QuantMail RFC 6409 Authenticated Submission Daemon Ready',
      size: this.config.maxMessageSize,
      authMethods: ['PLAIN', 'LOGIN', 'XOAUTH2'],
      authOptional: false, // Rejects unauthenticated commands before MAIL FROM
      allowInsecureAuth: isSecure ? true : this.config.allowInsecureAuth,
      disabledCommands: isSecure ? ['STARTTLS'] : [],

      // SASL Authentication
      onAuth: (auth, session, callback) => {
        void (async () => {
          try {
            const user = await this.authService.authenticate(auth, session);
            if (!user) {
              const err = new SmtpError('Invalid username or password', 535);
              return callback(err);
            }
            // Store user in session
            return callback(null, { user });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Authentication failure';
            return callback(new SmtpError(message, 535));
          }
        })();
      },

      // Envelope MAIL FROM validation & strict anti-spoofing
      onMailFrom: (address: SMTPServerAddress, session: SMTPServerSession, callback) => {
        const user = session.user as AuthenticatedUser | undefined;
        if (!user) {
          const err = new SmtpError('5.7.0 Authentication required', 530);
          return callback(err);
        }

        const verification = verifySenderIdentity(user, address.address);
        if (!verification.valid) {
          const err = new SmtpError(verification.error || '5.7.1 Sender identity mismatch', 550);
          return callback(err);
        }

        return callback();
      },

      // Envelope RCPT TO validation
      onRcptTo: (_address: SMTPServerAddress, session: SMTPServerSession, callback) => {
        const user = session.user as AuthenticatedUser | undefined;
        if (!user) {
          const err = new SmtpError('5.7.0 Authentication required', 530);
          return callback(err);
        }

        return callback();
      },

      // Message payload handler
      onData: (stream: Readable, session: SMTPServerSession, callback) => {
        void (async () => {
          try {
            const user = session.user as AuthenticatedUser | undefined;
            if (!user) {
              return callback(new SmtpError('5.7.0 Authentication required', 530));
            }

            // Collect raw stream chunks
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const rawMime = Buffer.concat(chunks).toString('utf-8');

            // Parse structure for queueing
            const parsed = await simpleParser(rawMime);
            const messageId = parsed.messageId || `<${randomUUID()}@${this.config.submissionHost}>`;

            // Validate MIME From: header against authenticated identity (RFC 6409 Section 8.1 anti-spoofing)
            if (parsed.from && parsed.from.value && Array.isArray(parsed.from.value)) {
              for (const fromAddr of parsed.from.value) {
                if (fromAddr.address) {
                  const mimeVerification = verifySenderIdentity(user, fromAddr.address);
                  if (!mimeVerification.valid) {
                    return callback(
                      new SmtpError('550 5.7.1 MIME From header spoofing detected', 550),
                    );
                  }
                }
              }
            }

            // Sanitize MIME (strip Bcc: to fix P1-03 leak) and inject RFC 6409 trace header
            const cleanMime = sanitizeAndTraceMime(
              rawMime,
              session,
              messageId,
              this.config.submissionHost,
            );

            // Extract recipients
            const rcptToAddresses = session.envelope.rcptTo.map((r) => r.address);
            const mailFromAddress = session.envelope.mailFrom
              ? session.envelope.mailFrom.address
              : user.email;

            // Push to BullMQ outbound-delivery queue
            await this.queue.enqueueOutbound({
              userId: user.id,
              from: mailFromAddress,
              to: rcptToAddresses,
              subject: parsed.subject || '',
              bodyText: parsed.text || undefined,
              bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
              rawMime: cleanMime,
              messageId,
            });

            return callback(null);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Processing error';
            return callback(new SmtpError(message, 451));
          }
        })();
      },
    });
  }

  /**
   * Helper to bind an SMTPServer to a port and return actual listening port.
   */
  private async listenServer(server: SMTPServer, port: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, this.config.host, () => {
        server.removeListener('error', reject);
        const address = server.server.address();
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          resolve(port);
        }
      });
    });
  }
}
