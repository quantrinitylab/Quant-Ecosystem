// Shared helpers for the lab tests. Node 18+, no dependencies.
//
// Configuration comes from the environment (see ../../.env.example, "local test client settings"):
//   TEST_HOST, TEST_ALICE, TEST_BOB, TEST_ALICE_PASSWORD, TEST_BOB_PASSWORD
//   TEST_INSECURE=1      accept self-signed certificates (before ACME has issued one)
//   TEST_SMTP_PORT=25 / TEST_SUBMISSION_PORT=587 / TEST_HTTPS_PORT=443 (defaults shown)
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

export const cfg = {
  host: process.env.TEST_HOST || 'mail.lab.quantrinity.in',
  alice: process.env.TEST_ALICE || 'alice@lab.quantrinity.in',
  bob: process.env.TEST_BOB || 'bob@lab.quantrinity.in',
  alicePass: process.env.TEST_ALICE_PASSWORD || '',
  bobPass: process.env.TEST_BOB_PASSWORD || '',
  insecure: process.env.TEST_INSECURE === '1',
  smtpPort: Number(process.env.TEST_SMTP_PORT || 25),
  submissionPort: Number(process.env.TEST_SUBMISSION_PORT || 587),
  httpsPort: Number(process.env.TEST_HTTPS_PORT || 443),
};

if (cfg.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`missing environment variables: ${missing.join(', ')}`);
    process.exit(2);
  }
}

export function result(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
  if (!ok) process.exitCode = 1;
}

export function buildMessage({ from, to, subject, body = 'Lab test message.\r\n', extraHeaders = [], messageId }) {
  const id = messageId || `<${crypto.randomUUID()}@lab.test>`;
  const headers = [
    `From: ${from}`,
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    ...extraHeaders,
  ];
  return { id, raw: headers.join('\r\n') + '\r\n\r\n' + body.replace(/\r?\n/g, '\r\n') };
}

// Minimal SMTP client: connect (plain or implicit TLS), EHLO, optional STARTTLS, optional AUTH PLAIN,
// then one or more transactions. Throws on any unexpected reply and records the last reply.
export class Smtp {
  constructor(opts) {
    this.opts = { port: 25, host: cfg.host, implicitTls: false, starttls: false, ehlo: 'lab-client.test', ...opts };
    this.buffer = '';
    this.waiters = [];
    this.lastReply = '';
  }

  async connect() {
    const { host, port, implicitTls } = this.opts;
    await new Promise((resolve, reject) => {
      const onErr = (e) => reject(e);
      if (implicitTls) {
        this.sock = tls.connect({ host, port, servername: host, rejectUnauthorized: !cfg.insecure }, resolve);
      } else {
        this.sock = net.connect({ host, port }, resolve);
      }
      this.sock.once('error', onErr);
    });
    this.attach();
    await this.expect(220);
    await this.ehlo();
    if (this.opts.starttls) {
      await this.cmd('STARTTLS', 220);
      this.sock.removeAllListeners('data');
      this.sock.removeAllListeners('close');
      this.sock.removeAllListeners('error');
      this.sock.on('error', () => {});
      this.sock = tls.connect({ socket: this.sock, servername: this.opts.host, rejectUnauthorized: !cfg.insecure });
      await new Promise((res, rej) => {
        this.sock.once('secureConnect', res);
        this.sock.once('error', rej);
      });
      this.buffer = '';
      this.attach();
      await this.ehlo();
    }
    if (this.opts.user) {
      const token = Buffer.from(`\0${this.opts.user}\0${this.opts.pass}`).toString('base64');
      await this.cmd(`AUTH PLAIN ${token}`, 235);
    }
    return this;
  }

  attach() {
    this.sock.on('data', (d) => {
      this.buffer += d.toString('utf8');
      this.flush();
    });
    this.sock.on('error', (e) => {
      this.error = e;
      this.waiters.splice(0).forEach((w) => w.reject(e));
    });
    this.sock.on('close', () => {
      this.closed = true;
      this.waiters.splice(0).forEach((w) => w.reject(new Error('connection closed')));
    });
  }

  flush() {
    // A reply is complete when its last line has "NNN " (space) after the code.
    for (;;) {
      const m = this.buffer.match(/^(?:\d{3}-.*\r?\n)*\d{3} .*\r?\n/);
      if (!m) return;
      const text = m[0];
      this.buffer = this.buffer.slice(text.length);
      const w = this.waiters.shift();
      if (w) w.resolve(text);
    }
  }

  reply() {
    const p = new Promise((resolve, reject) => {
      if (this.error) return reject(this.error);
      if (this.closed) return reject(new Error('connection closed'));
      this.waiters.push({ resolve, reject });
      this.flush();
    });
    p.catch(() => {}); // the awaiting caller still sees the rejection; this only avoids unhandled-rejection crashes
    return p;
  }

  async expect(...codes) {
    const text = await this.reply();
    this.lastReply = text.trim();
    const code = Number(text.slice(0, 3));
    if (!codes.includes(code)) {
      const err = new Error(`unexpected SMTP reply: ${this.lastReply.split(/\r?\n/).pop()}`);
      err.code = code;
      err.reply = this.lastReply;
      throw err;
    }
    return text;
  }

  async cmd(line, ...codes) {
    this.sock.write(line + '\r\n');
    return this.expect(...codes);
  }

  async ehlo() {
    return this.cmd(`EHLO ${this.opts.ehlo}`, 250);
  }

  // Sends one message. Returns the final reply text. Throws with .code/.reply on rejection.
  async send({ mailFrom, rcptTo, raw }) {
    await this.cmd(`MAIL FROM:<${mailFrom}>`, 250);
    for (const r of [].concat(rcptTo)) await this.cmd(`RCPT TO:<${r}>`, 250, 251);
    await this.cmd('DATA', 354);
    const stuffed = raw.replace(/^\./gm, '..');
    this.sock.write(stuffed + '\r\n.\r\n');
    return (await this.expect(250)).trim();
  }

  async quit() {
    try {
      await this.cmd('QUIT', 221);
    } catch {
      /* ignore */
    }
    this.sock.destroy();
  }
}

export function submission(user, pass, extra = {}) {
  return new Smtp({ port: cfg.submissionPort, starttls: true, user, pass, ...extra }).connect();
}

export async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
