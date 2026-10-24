// In-process SMTP submission server for transport tests. Records what crosses
// the wire (envelope vs. message headers) and can be told to reject MAIL FROM,
// RCPT TO or AUTH with a chosen SMTP reply code. Uses the smtp-server package's
// built-in self-signed certificate for STARTTLS.

import { SMTPServer, type SMTPServerSession } from 'smtp-server';
import type { AddressInfo } from 'node:net';

export interface CapturedMessage {
  mailFrom: string;
  rcptTo: string[];
  raw: Buffer;
  /** Header block of the received message, unfolded to one line per header. */
  headers: string;
  authUser: string | undefined;
  secure: boolean;
}

export interface FakeSmtpOptions {
  /** Do not advertise STARTTLS (simulates a plaintext-only server). */
  noStartTls?: boolean;
  user?: string;
  pass?: string;
  /** Reject these RCPT TO addresses with the given reply code. */
  rejectRcpt?: Record<string, number>;
  /** Reject every MAIL FROM with this reply code. */
  rejectMailFrom?: number;
  /** Reject the DATA phase with this reply code. */
  rejectData?: number;
}

export interface FakeSmtpServer {
  port: number;
  messages: CapturedMessage[];
  close(): Promise<void>;
}

function replyError(message: string, responseCode: number): Error {
  return Object.assign(new Error(message), { responseCode });
}

export async function startFakeSmtpServer(opts: FakeSmtpOptions = {}): Promise<FakeSmtpServer> {
  const user = opts.user ?? 'relay-user';
  const pass = opts.pass ?? 'relay-pass';
  const messages: CapturedMessage[] = [];

  const server = new SMTPServer({
    name: 'fake-relay.test',
    banner: 'fake relay',
    authOptional: false,
    // Plain-text AUTH is only offered after STARTTLS, like a real relay.
    allowInsecureAuth: false,
    hideSTARTTLS: opts.noStartTls === true,
    disabledCommands: opts.noStartTls ? ['STARTTLS'] : [],
    logger: false,
    onAuth(auth, _session, callback) {
      if (auth.username === user && auth.password === pass) {
        callback(null, { user: auth.username });
      } else {
        callback(replyError('Invalid credentials', 535));
      }
    },
    onMailFrom(_address, _session, callback) {
      callback(opts.rejectMailFrom ? replyError('sender refused', opts.rejectMailFrom) : null);
    },
    onRcptTo(address, _session, callback) {
      const code = opts.rejectRcpt?.[address.address.toLowerCase()];
      callback(code ? replyError('recipient refused', code) : null);
    },
    onData(stream, session: SMTPServerSession, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        if (opts.rejectData) {
          callback(replyError('message refused', opts.rejectData));
          return;
        }
        const raw = Buffer.concat(chunks);
        const end = raw.indexOf('\r\n\r\n');
        const headers = raw
          .subarray(0, end === -1 ? raw.length : end)
          .toString('utf8')
          .replace(/\r\n[ \t]+/g, ' ');
        messages.push({
          mailFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          rcptTo: session.envelope.rcptTo.map((r) => r.address),
          raw,
          headers,
          authUser: (session.user as string | undefined) ?? undefined,
          secure: session.secure,
        });
        callback(null, 'queued as fake-queue-id-1');
      });
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.server.address() as AddressInfo).port;

  return {
    port,
    messages,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
