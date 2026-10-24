// @vitest-environment node
// ============================================================================
// SMTP relay transport (lib/smtp-sender.ts + lib/mail-transport.ts) against an
// in-process fake submission server: envelope vs. headers, Bcc handling,
// STARTTLS enforcement, 4xx/5xx classification, large attachments and
// Message-ID propagation.
// ============================================================================

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  MailTransportError,
  closeMailTransport,
  getMailTransport,
  isMailTransportConfigured,
  prepareRawMessage,
  sendMail,
  sendMailDetailed,
} from '../lib/mail-transport';
import {
  SmtpMailTransport,
  isSmtpConfigured,
  readSmtpConfig,
  type SmtpConfig,
} from '../lib/smtp-sender';
import { startFakeSmtpServer, type FakeSmtpServer } from './helpers/fake-smtp-server';

const PASSWORD = 'relay-pass-s3cr3t';
const SMTP_ENV_KEYS = [
  'MAIL_TRANSPORT',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_REQUIRE_TLS',
  'SMTP_FROM_DEFAULT',
  'SMTP_DKIM_SIGN',
] as const;

let server: FakeSmtpServer;
const fake = (opts: Parameters<typeof startFakeSmtpServer>[0] = {}) =>
  startFakeSmtpServer({ user: 'relay-user', pass: PASSWORD, ...opts });
const savedEnv: Record<string, string | undefined> = {};
let savedTlsReject: string | undefined;

function configFor(port: number, over: Partial<SmtpConfig> = {}): SmtpConfig {
  return {
    host: '127.0.0.1',
    port,
    user: 'relay-user',
    pass: PASSWORD,
    requireTls: true,
    poolMaxConnections: 2,
    poolMaxMessages: 100,
    connectionTimeoutMs: 3_000,
    greetingTimeoutMs: 3_000,
    socketTimeoutMs: 20_000,
    // The fake server presents smtp-server's built-in self-signed certificate.
    tlsOptions: { rejectUnauthorized: false },
    ...over,
  };
}

function useEnv(port: number, over: Record<string, string> = {}): void {
  process.env['MAIL_TRANSPORT'] = 'smtp';
  process.env['SMTP_HOST'] = '127.0.0.1';
  process.env['SMTP_PORT'] = String(port);
  process.env['SMTP_USER'] = 'relay-user';
  process.env['SMTP_PASS'] = PASSWORD;
  for (const [k, v] of Object.entries(over)) process.env[k] = v;
}

beforeAll(async () => {
  for (const k of SMTP_ENV_KEYS) savedEnv[k] = process.env[k];
  // Only for the env-driven (façade) tests: the fake server's certificate is
  // self-signed and env config deliberately has no knob to relax verification.
  savedTlsReject = process.env['NODE_TLS_REJECT_UNAUTHORIZED'];
  server = await fake({ user: 'relay-user', pass: PASSWORD });
});

afterAll(async () => {
  await server.close();
  if (savedTlsReject === undefined) delete process.env['NODE_TLS_REJECT_UNAUTHORIZED'];
  else process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = savedTlsReject;
});

beforeEach(() => {
  server.messages.length = 0;
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
});

afterEach(() => {
  closeMailTransport();
  for (const k of SMTP_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('SMTP transport: envelope and headers', () => {
  it('delivers over STARTTLS with auth; Bcc is in the envelope and never in the headers', async () => {
    useEnv(server.port);
    const result = await sendMailDetailed({
      from: 'QuantMail <no-reply@quantmail.in>',
      to: ['alice@example.com'],
      cc: ['carol@example.com'],
      bcc: ['secret-bcc@example.com'],
      subject: 'Hello',
      bodyText: 'plain body',
      bodyHtml: '<p>html body</p>',
      replyTo: 'no-reply@quantmail.in',
    });

    expect(server.messages).toHaveLength(1);
    const msg = server.messages[0]!;
    expect(msg.secure).toBe(true);
    expect(msg.authUser).toBe('relay-user');
    expect(msg.mailFrom).toBe('no-reply@quantmail.in');
    expect(msg.rcptTo.sort()).toEqual(
      ['alice@example.com', 'carol@example.com', 'secret-bcc@example.com'].sort(),
    );
    // Visible headers name To/Cc only.
    expect(msg.headers).toMatch(/^To: alice@example\.com$/m);
    expect(msg.headers).toMatch(/^Cc: carol@example\.com$/m);
    expect(msg.headers).toMatch(/^From: QuantMail <no-reply@quantmail\.in>$/m);
    // The Bcc address appears nowhere in the message bytes and there is no Bcc header.
    expect(msg.headers).not.toMatch(/^Bcc:/im);
    expect(msg.raw.toString('latin1')).not.toContain('secret-bcc@example.com');
    expect(result.accepted.sort()).toEqual(msg.rcptTo.sort());
    expect(result.response).toContain('queued as fake-queue-id-1');
  });

  it('a Bcc-only send has a well-formed empty To group and still reaches the Bcc recipient', async () => {
    useEnv(server.port);
    await sendMail({
      from: 'no-reply@quantmail.in',
      to: [],
      bcc: ['only-bcc@example.com'],
      subject: 'Bcc only',
      bodyText: 'hi',
    });
    const msg = server.messages[0]!;
    expect(msg.rcptTo).toEqual(['only-bcc@example.com']);
    expect(msg.headers).toMatch(/^To: undisclosed-recipients:;$/m);
    expect(msg.raw.toString('latin1')).not.toContain('only-bcc@example.com');
  });

  it('the envelope sender is the bare address even when From has a display name', async () => {
    useEnv(server.port);
    await sendMail({
      from: '"Quant Calendar" <calendar@quantmail.in>',
      to: ['alice@example.com'],
      subject: 'Invite',
      bodyText: 'x',
    });
    expect(server.messages[0]!.mailFrom).toBe('calendar@quantmail.in');
  });

  it('refuses a prepared message that carries a Bcc header', async () => {
    const transport = new SmtpMailTransport(configFor(server.port));
    const raw = Buffer.from(
      'From: a@quantmail.in\r\nTo: b@example.com\r\nBcc: leak@example.com\r\nSubject: x\r\n\r\nbody\r\n',
    );
    await expect(
      transport.sendRaw({ raw, envelope: { from: 'a@quantmail.in', to: ['b@example.com'] } }),
    ).rejects.toMatchObject({ kind: 'permanent', code: 'BCC_HEADER_PRESENT' });
    expect(server.messages).toHaveLength(0);
    transport.close();
  });

  it('prepareRawMessage never renders Bcc, and uses SMTP_FROM_DEFAULT when From is empty', () => {
    const prepared = prepareRawMessage(
      { from: '', to: ['a@example.com'], bcc: ['hidden@example.com'], subject: 's', bodyText: 't' },
      'default-sender@quantmail.in',
    );
    expect(prepared.envelope).toEqual({
      from: 'default-sender@quantmail.in',
      to: ['a@example.com', 'hidden@example.com'],
    });
    expect(prepared.raw.toString('latin1')).not.toContain('hidden@example.com');
  });
});

describe('SMTP transport: TLS and authentication', () => {
  it('fails (and sends nothing) when STARTTLS is required but not offered', async () => {
    const plain = await fake({ noStartTls: true });
    try {
      const transport = new SmtpMailTransport(configFor(plain.port));
      const error = await transport
        .sendRaw(prepareRawMessage({ from: 'a@quantmail.in', to: ['b@example.com'], subject: 's', bodyText: 't' }))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MailTransportError);
      expect(error).toMatchObject({ code: 'SMTP_TLS_REQUIRED', kind: 'transient' });
      expect(plain.messages).toHaveLength(0);
      expect((error as Error).message).not.toContain(PASSWORD);
      transport.close();
    } finally {
      await plain.close();
    }
  });

  it('wrong credentials are transient (an operator fixes them; the mail is kept) and the password is never in the error', async () => {
    const transport = new SmtpMailTransport(configFor(server.port, { pass: 'definitely-wrong-pass' }));
    const error = await transport
      .sendRaw(prepareRawMessage({ from: 'a@quantmail.in', to: ['b@example.com'], subject: 's', bodyText: 't' }))
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'SMTP_AUTH_FAILED', kind: 'transient' });
    expect((error as Error).message).not.toContain('definitely-wrong-pass');
    transport.close();
  });

  it('never writes credentials to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    try {
      useEnv(server.port);
      await sendMail({ from: 'a@quantmail.in', to: ['b@example.com'], subject: 's', bodyText: 't' });
      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain(PASSWORD);
        }
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});

describe('SMTP transport: error classification', () => {
  const message = prepareRawMessage({
    from: 'a@quantmail.in',
    to: ['bad@example.com'],
    subject: 's',
    bodyText: 't',
  });

  it('5xx on RCPT TO is permanent', async () => {
    const srv = await fake({ rejectRcpt: { 'bad@example.com': 550 } });
    try {
      const transport = new SmtpMailTransport(configFor(srv.port));
      const error = await transport.sendRaw(message).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MailTransportError);
      expect(error).toMatchObject({ kind: 'permanent', smtpCode: 550, code: 'SMTP_REJECTED' });
      transport.close();
    } finally {
      await srv.close();
    }
  });

  it('4xx on RCPT TO is transient', async () => {
    const srv = await fake({ rejectRcpt: { 'bad@example.com': 451 } });
    try {
      const transport = new SmtpMailTransport(configFor(srv.port));
      const error = await transport.sendRaw(message).catch((e: unknown) => e);
      expect(error).toMatchObject({ kind: 'transient', smtpCode: 451, code: 'SMTP_DEFERRED' });
      transport.close();
    } finally {
      await srv.close();
    }
  });

  it('5xx on MAIL FROM is permanent and 4xx on DATA is transient', async () => {
    const refusedSender = await fake({ rejectMailFrom: 553 });
    const busyData = await fake({ rejectData: 452 });
    try {
      const a = new SmtpMailTransport(configFor(refusedSender.port));
      await expect(a.sendRaw(message)).rejects.toMatchObject({ kind: 'permanent', smtpCode: 553 });
      a.close();
      const b = new SmtpMailTransport(configFor(busyData.port));
      await expect(b.sendRaw(message)).rejects.toMatchObject({ kind: 'transient', smtpCode: 452 });
      b.close();
    } finally {
      await refusedSender.close();
      await busyData.close();
    }
  });

  it('a refused connection is transient', async () => {
    // Port 1 on loopback: nothing listens there.
    const transport = new SmtpMailTransport(configFor(1));
    const error = await transport.sendRaw(message).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'transient', code: 'SMTP_NETWORK' });
    transport.close();
  });

  it('with one good and one refused recipient the message goes out and the refusal is reported', async () => {
    const srv = await fake({ rejectRcpt: { 'bad@example.com': 550 } });
    try {
      const transport = new SmtpMailTransport(configFor(srv.port));
      const result = await transport.sendRaw(
        prepareRawMessage({
          from: 'a@quantmail.in',
          to: ['good@example.com', 'bad@example.com'],
          subject: 's',
          bodyText: 't',
        }),
      );
      expect(result.accepted).toEqual(['good@example.com']);
      expect(result.rejected).toEqual(['bad@example.com']);
      expect(srv.messages[0]!.rcptTo).toEqual(['good@example.com']);
      transport.close();
    } finally {
      await srv.close();
    }
  });
});

describe('SMTP transport: attachments and Message-ID', () => {
  it('carries a large attachment intact', async () => {
    const content = randomBytes(5 * 1024 * 1024);
    useEnv(server.port);
    await sendMail({
      from: 'no-reply@quantmail.in',
      to: ['alice@example.com'],
      bcc: ['hidden@example.com'],
      subject: 'Big file',
      bodyText: 'see attached',
      attachments: [{ filename: 'big.bin', contentType: 'application/octet-stream', content }],
    });
    const msg = server.messages[0]!;
    expect(msg.raw.byteLength).toBeGreaterThan(Math.floor((content.byteLength * 4) / 3));
    const text = msg.raw.toString('latin1');
    const marker = 'filename="big.bin"\r\nContent-Transfer-Encoding: base64\r\n\r\n';
    const start = text.indexOf(marker) + marker.length;
    const end = text.indexOf('\r\n--', start);
    const decoded = Buffer.from(text.slice(start, end).replace(/\r\n/g, ''), 'base64');
    expect(decoded.equals(content)).toBe(true);
    expect(msg.rcptTo).toContain('hidden@example.com');
    expect(text).not.toContain('hidden@example.com');
  });

  it('uses the caller-supplied Message-ID on the wire and returns it', async () => {
    useEnv(server.port);
    const id = await sendMail({
      from: 'no-reply@quantmail.in',
      to: ['alice@example.com'],
      subject: 's',
      bodyText: 't',
      messageId: '<stable-id-123@quantmail.in>',
    });
    expect(id).toBe('<stable-id-123@quantmail.in>');
    expect(server.messages[0]!.headers).toMatch(/^Message-ID: <stable-id-123@quantmail\.in>$/m);
  });

  it('generates a Message-ID when none is given and returns the one that was sent', async () => {
    useEnv(server.port);
    const id = await sendMail({
      from: 'no-reply@quantmail.in',
      to: ['alice@example.com'],
      subject: 's',
      bodyText: 't',
    });
    expect(id).toMatch(/^<[0-9a-f-]{36}@quantmail\.in>$/);
    expect(server.messages[0]!.headers).toContain(`Message-ID: ${id}`);
  });

  it('adds a Message-ID to a prepared message that lacks one', async () => {
    const transport = new SmtpMailTransport(configFor(server.port));
    const raw = Buffer.from('From: a@quantmail.in\r\nTo: b@example.com\r\nSubject: x\r\n\r\nbody\r\n');
    const result = await transport.sendRaw({
      raw,
      envelope: { from: 'a@quantmail.in', to: ['b@example.com'] },
    });
    expect(result.messageId).toMatch(/^<[0-9a-f-]{36}@quantmail\.in>$/);
    expect(server.messages[0]!.headers).toContain(`Message-ID: ${result.messageId}`);
    transport.close();
  });
});

describe('transport selection and configuration', () => {
  it('defaults to SES so nothing changes until MAIL_TRANSPORT is set', () => {
    delete process.env['MAIL_TRANSPORT'];
    expect(getMailTransport().name).toBe('ses');
    process.env['MAIL_TRANSPORT'] = 'ses';
    expect(getMailTransport().name).toBe('ses');
  });

  it('reads SMTP settings with the documented defaults', () => {
    const cfg = readSmtpConfig({ SMTP_HOST: 'smtp.example.net', SMTP_USER: 'u', SMTP_PASS: 'p' });
    expect(cfg).toMatchObject({ host: 'smtp.example.net', port: 587, requireTls: true });
    expect(readSmtpConfig({})).toBeNull();
    expect(readSmtpConfig({ SMTP_HOST: 'h', SMTP_REQUIRE_TLS: 'false' })?.requireTls).toBe(false);
  });

  it('is configured only with a host and credentials while TLS is required', () => {
    expect(isSmtpConfigured({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' })).toBe(true);
    expect(isSmtpConfigured({ SMTP_HOST: 'h' })).toBe(false);
    expect(isSmtpConfigured({ SMTP_HOST: 'h', SMTP_USER: 'u' })).toBe(false);
    // Credential-less relay only for local development without TLS.
    expect(isSmtpConfigured({ SMTP_HOST: 'localhost', SMTP_REQUIRE_TLS: 'false' })).toBe(true);
  });

  it('isMailTransportConfigured follows MAIL_TRANSPORT', () => {
    useEnv(server.port);
    expect(isMailTransportConfigured()).toBe(true);
    delete process.env['SMTP_PASS'];
    expect(isMailTransportConfigured()).toBe(false);
  });
});
