// T7: JMAP end to end. Discovery, session, Mailbox/get, Email/query + Email/get, Email/set (keywords,
// move), Thread/get, EmailSubmission/set with cancel (undo send), blob upload/download, push (EventSource).
//   TEST_ALICE_PASSWORD=... TEST_BOB_PASSWORD=... node jmap-suite.mjs
// Every step prints PASS or FAIL with one line of evidence. Steps do not depend on each other more than
// necessary, so one failing step does not hide the others.
import { cfg, need, result, buildMessage, submission, sleep } from './lib.mjs';
import { Jmap } from './jmap-lib.mjs';

need('TEST_ALICE_PASSWORD', 'TEST_BOB_PASSWORD');
const alice = new Jmap(cfg.alice, cfg.alicePass);
const bob = new Jmap(cfg.bob, cfg.bobPass);

async function step(name, fn) {
  try {
    const detail = await fn();
    result(name, true, detail || '');
  } catch (e) {
    result(name, false, e.message);
  }
}

let received;
const subject = `lab-jmap-${Date.now()}`;

await step('discovery: /.well-known/jmap and session document', async () => {
  const s = await alice.session();
  const caps = Object.keys(s.capabilities);
  for (const c of ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission']) {
    if (!caps.includes(c)) throw new Error(`capability missing: ${c}`);
  }
  return `${caps.length} capabilities, account ${alice.accountId}`;
});

await step('Mailbox/get returns the standard roles', async () => {
  const boxes = await alice.mailboxes();
  const roles = boxes.map((b) => b.role).filter(Boolean).sort();
  for (const r of ['inbox', 'drafts', 'sent', 'trash', 'junk']) if (!roles.includes(r)) throw new Error(`role missing: ${r}`);
  return roles.join(',');
});

await step('SMTP submission, then Email/query + Email/get on the receiver', async () => {
  const s = await submission(cfg.alice, cfg.alicePass);
  const msg = buildMessage({ from: cfg.alice, to: cfg.bob, subject, body: 'jmap suite\r\n' });
  await s.send({ mailFrom: cfg.alice, rcptTo: cfg.bob, raw: msg.raw });
  await s.quit();
  received = await bob.waitFor(subject, 60000);
  if (!received) throw new Error('message did not arrive in 60 s');
  return `id=${received.id} thread=${received.threadId} size=${received.size}`;
});

await step('Email/set: keywords $seen and $flagged', async () => {
  if (!received) throw new Error('no received message');
  await bob.call([['Email/set', { accountId: bob.accountId, update: { [received.id]: { 'keywords/$seen': true, 'keywords/$flagged': true } } }, 's']]);
  const [[, g]] = await bob.call([['Email/get', { accountId: bob.accountId, ids: [received.id], properties: ['keywords'] }, 'g']]);
  const kw = g.list[0].keywords;
  if (!kw.$seen || !kw.$flagged) throw new Error(`keywords now ${JSON.stringify(kw)}`);
  return Object.keys(kw).join(',');
});

await step('Email/set: move between mailboxes', async () => {
  if (!received) throw new Error('no received message');
  const [[, c]] = await bob.call([['Mailbox/set', { accountId: bob.accountId, create: { m: { name: `lab-moved-${Date.now()}` } } }, 'mb']]);
  const target = c.created && c.created.m && c.created.m.id;
  if (!target) throw new Error(`mailbox not created: ${JSON.stringify(c.notCreated)}`);
  await bob.call([['Email/set', { accountId: bob.accountId, update: { [received.id]: { mailboxIds: { [target]: true } } } }, 'mv']]);
  const [[, g]] = await bob.call([['Email/get', { accountId: bob.accountId, ids: [received.id], properties: ['mailboxIds'] }, 'g']]);
  if (!g.list[0].mailboxIds[target]) throw new Error('email not in the new mailbox');
  return `moved to ${target}`;
});

await step('Thread/get returns the thread of the message', async () => {
  if (!received) throw new Error('no received message');
  const [[, t]] = await bob.call([['Thread/get', { accountId: bob.accountId, ids: [received.threadId] }, 't']]);
  if (!t.list.length || !t.list[0].emailIds.includes(received.id)) throw new Error('thread does not contain the email');
  return `thread ${t.list[0].id} has ${t.list[0].emailIds.length} email(s)`;
});

await step('EmailSubmission/set with HOLDUNTIL, then cancel (undo send)', async () => {
  await alice.ensure();
  const cancelSubject = `lab-undo-${Date.now()}`;
  const drafts = await alice.mailboxId('drafts');
  const [[, ids]] = await alice.call([['Identity/get', { accountId: alice.accountId }, 'i']]);
  const identity = ids.list.find((i) => i.email === cfg.alice) || ids.list[0];
  if (!identity) throw new Error('no identity for alice');
  const hold = new Date(Date.now() + 5 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  const res = await alice.call([
    [
      'Email/set',
      {
        accountId: alice.accountId,
        create: {
          d: {
            mailboxIds: { [drafts]: true },
            keywords: { $draft: true },
            from: [{ email: cfg.alice }],
            to: [{ email: cfg.bob }],
            subject: cancelSubject,
            bodyValues: { b: { value: 'this message must be cancelled before it leaves' } },
            textBody: [{ partId: 'b', type: 'text/plain' }],
          },
        },
      },
      'e',
    ],
    [
      'EmailSubmission/set',
      {
        accountId: alice.accountId,
        create: {
          s: {
            identityId: identity.id,
            emailId: '#d',
            envelope: {
              mailFrom: { email: cfg.alice, parameters: { HOLDUNTIL: hold } },
              rcptTo: [{ email: cfg.bob }],
            },
          },
        },
      },
      'sub',
    ],
  ]);
  const created = res[1][1].created && res[1][1].created.s;
  if (!created) throw new Error(`submission rejected: ${JSON.stringify(res[1][1].notCreated)}`);
  const subId = created.id;
  const before = created.undoStatus;
  const [[, upd]] = await alice.call([['EmailSubmission/set', { accountId: alice.accountId, update: { [subId]: { undoStatus: 'canceled' } } }, 'u']]);
  if (!upd.updated || !(subId in upd.updated)) throw new Error(`cancel refused: ${JSON.stringify(upd.notUpdated)}`);
  await sleep(8000);
  const leaked = await bob.findBySubject(cancelSubject, 1);
  if (leaked.length) throw new Error('cancelled message was still delivered');
  return `undoStatus before=${before}, cancel accepted, nothing delivered`;
});

await step('blob upload and download round trip', async () => {
  await alice.ensure();
  const upUrl = alice.rebase(alice.sessionDoc.uploadUrl.replace('{accountId}', encodeURIComponent(alice.accountId)));
  const payload = Buffer.from(`blob-${Date.now()}-` + 'x'.repeat(4096));
  const up = await alice.http(upUrl, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: payload });
  if (!up.ok) throw new Error(`upload failed: HTTP ${up.status}`);
  const meta = await up.json();
  const dlUrl = alice.rebase(
    alice.sessionDoc.downloadUrl
      .replace('{accountId}', encodeURIComponent(alice.accountId))
      .replace('{blobId}', encodeURIComponent(meta.blobId))
      .replace('{type}', 'application/octet-stream')
      .replace('{name}', 'lab.bin'),
  );
  const dl = await alice.http(dlUrl);
  if (!dl.ok) throw new Error(`download failed: HTTP ${dl.status}`);
  const back = Buffer.from(await dl.arrayBuffer());
  if (!back.equals(payload)) throw new Error('downloaded bytes differ');
  return `blob ${meta.blobId}, ${back.length} bytes`;
});

await step('push: EventSource delivers a state change when mail arrives', async () => {
  await bob.ensure();
  const tpl = bob.sessionDoc.eventSourceUrl;
  if (!tpl) throw new Error('no eventSourceUrl in the session');
  const url = bob.rebase(tpl.replace('{types}', '*').replace('{closeafter}', 'no').replace('{ping}', '0'));
  const ctrl = new AbortController();
  const res = await fetch(url, { headers: { authorization: bob.auth, accept: 'text/event-stream' }, signal: ctrl.signal });
  if (!res.ok) throw new Error(`eventsource HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let seen = '';
  const reading = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      seen += decoder.decode(value, { stream: true });
      if (/event: state/.test(seen) && /Email/.test(seen)) return;
    }
  })();
  await sleep(1500);
  const s = await submission(cfg.alice, cfg.alicePass);
  await s.send({ mailFrom: cfg.alice, rcptTo: cfg.bob, raw: buildMessage({ from: cfg.alice, to: cfg.bob, subject: `lab-push-${Date.now()}` }).raw });
  await s.quit();
  const timeout = sleep(30000).then(() => 'timeout');
  const outcome = await Promise.race([reading.then(() => 'event'), timeout]);
  ctrl.abort();
  if (outcome !== 'event') throw new Error('no state event within 30 s');
  return 'received a "state" event that mentions Email';
});
