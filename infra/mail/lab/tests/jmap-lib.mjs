// Small JMAP client for the lab tests (RFC 8620 / 8621). Uses the global fetch of Node 18+.
import { cfg } from './lib.mjs';

export const USING = [
  'urn:ietf:params:jmap:core',
  'urn:ietf:params:jmap:mail',
  'urn:ietf:params:jmap:submission',
];

export class Jmap {
  constructor(user, pass, base = `https://${cfg.host}${cfg.httpsPort === 443 ? '' : ':' + cfg.httpsPort}`) {
    this.base = base;
    this.auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }

  // The session document advertises URLs on the public hostname. Tests always talk to this.base
  // (so they also work against a local instance or through a tunnel), keeping only path and query.
  rebase(u) {
    const url = new URL(u, this.base);
    return new URL(url.pathname + url.search, this.base).toString();
  }

  async http(url, init = {}) {
    try {
      return await fetch(url, { ...init, headers: { authorization: this.auth, ...(init.headers || {}) }, redirect: 'follow' });
    } catch (e) {
      const c = e.cause ? ` (${e.cause.code || e.cause.message})` : '';
      throw new Error(`${e.message}${c} for ${url}`);
    }
  }

  // Discovery: /.well-known/jmap redirects to the session resource.
  async session() {
    const res = await this.http(`${this.base}/.well-known/jmap`);
    if (!res.ok) throw new Error(`session request failed: HTTP ${res.status}`);
    this.sessionDoc = await res.json();
    const s = this.sessionDoc;
    this.apiUrl = this.rebase(s.apiUrl);
    this.accountId = s.primaryAccounts['urn:ietf:params:jmap:mail'];
    return s;
  }

  async call(methodCalls, using = USING) {
    if (!this.apiUrl) await this.session();
    const res = await this.http(this.apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ using, methodCalls }),
    });
    if (!res.ok) throw new Error(`JMAP call failed: HTTP ${res.status} ${await res.text()}`);
    const json = await res.json();
    for (const [name, args] of json.methodResponses) {
      if (name === 'error') throw new Error(`JMAP method error: ${JSON.stringify(args)}`);
    }
    return json.methodResponses;
  }

  async ensure() {
    if (!this.apiUrl) await this.session();
  }

  async mailboxes() {
    await this.ensure();
    const [[, r]] = await this.call([['Mailbox/get', { accountId: this.accountId }, '0']]);
    return r.list;
  }

  async mailboxId(role) {
    const m = (await this.mailboxes()).find((x) => x.role === role);
    return m ? m.id : null;
  }

  // Find emails by subject text in any mailbox (newest first).
  async findBySubject(subject, limit = 10) {
    await this.ensure();
    const res = await this.call([
      ['Email/query', { accountId: this.accountId, filter: { subject }, sort: [{ property: 'receivedAt', isAscending: false }], limit }, 'q'],
      [
        'Email/get',
        {
          accountId: this.accountId,
          '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
          properties: ['id', 'threadId', 'mailboxIds', 'keywords', 'subject', 'receivedAt', 'messageId', 'headers', 'size', 'blobId'],
        },
        'g',
      ],
    ]);
    return res[1][1].list;
  }

  // Poll until a message with the subject shows up. Returns the email or null.
  async waitFor(subject, timeoutMs = 60000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const list = await this.findBySubject(subject, 1);
      if (list.length) return list[0];
      await new Promise((r) => setTimeout(r, 2000));
    }
    return null;
  }
}
