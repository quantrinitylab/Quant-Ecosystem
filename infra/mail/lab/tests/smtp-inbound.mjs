// T3 helper and T11: act as an external sender on port 25.
//   node smtp-inbound.mjs [recipient]
// 1. delivers one message to the recipient (default alice) and prints its subject,
// 2. checks that an unknown local recipient is rejected at RCPT (no backscatter),
// 3. checks that relaying to a foreign domain without authentication is refused.
import { cfg, result, buildMessage, Smtp } from './lib.mjs';

const rcpt = process.argv[2] || cfg.alice;
const domain = rcpt.split('@')[1];
const subject = `lab-inbound-${Date.now()}`;
const from = 'sender@external-sender.example';

async function session() {
  return new Smtp({ port: cfg.smtpPort, starttls: true }).connect();
}

try {
  const s = await session();
  const msg = buildMessage({ from, to: rcpt, subject });
  const reply = await s.send({ mailFrom: from, rcptTo: rcpt, raw: msg.raw });
  await s.quit();
  result('inbound delivery accepted on port 25', true, `${subject} | ${reply.split(/\r?\n/).pop()}`);
} catch (e) {
  result('inbound delivery accepted on port 25', false, e.message);
}

try {
  const s = await session();
  await s.cmd(`MAIL FROM:<${from}>`, 250);
  let code = 0;
  try {
    await s.cmd(`RCPT TO:<no-such-user-${Date.now()}@${domain}>`, 250);
  } catch (e) {
    code = e.code || 0;
  }
  await s.quit();
  result('unknown recipient rejected at RCPT (5xx)', code >= 500 && code < 600, `code=${code}`);
} catch (e) {
  result('unknown recipient rejected at RCPT (5xx)', false, e.message);
}

try {
  const s = await session();
  await s.cmd(`MAIL FROM:<${from}>`, 250);
  let code = 0;
  try {
    await s.cmd('RCPT TO:<victim@example.net>', 250);
  } catch (e) {
    code = e.code || 0;
  }
  await s.quit();
  result('open relay check: foreign recipient refused without AUTH', code >= 400, `code=${code}`);
} catch (e) {
  result('open relay check: foreign recipient refused without AUTH', false, e.message);
}
