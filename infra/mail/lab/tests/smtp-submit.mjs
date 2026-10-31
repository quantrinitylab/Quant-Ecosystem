// T2: authenticated submission (587 + STARTTLS) alice -> bob, then confirm delivery through JMAP as bob.
// Also checks that submission without credentials cannot relay.
//   TEST_ALICE_PASSWORD=... TEST_BOB_PASSWORD=... node smtp-submit.mjs
import { cfg, need, result, buildMessage, submission, Smtp } from './lib.mjs';
import { Jmap } from './jmap-lib.mjs';

need('TEST_ALICE_PASSWORD', 'TEST_BOB_PASSWORD');
const subject = `lab-submit-${Date.now()}`;

try {
  const s = await submission(cfg.alice, cfg.alicePass);
  const msg = buildMessage({ from: cfg.alice, to: cfg.bob, subject });
  const reply = await s.send({ mailFrom: cfg.alice, rcptTo: cfg.bob, raw: msg.raw });
  await s.quit();
  result('submission accepted (587, STARTTLS, AUTH PLAIN)', true, reply.split(/\r?\n/).pop());
} catch (e) {
  result('submission accepted (587, STARTTLS, AUTH PLAIN)', false, e.message);
}

try {
  const bob = new Jmap(cfg.bob, cfg.bobPass);
  const mail = await bob.waitFor(subject, 60000);
  result('alice -> bob delivered to the INBOX of bob (JMAP)', Boolean(mail), mail ? `id=${mail.id}` : 'not found in 60 s');
} catch (e) {
  result('alice -> bob delivered to the INBOX of bob (JMAP)', false, e.message);
}

try {
  const s = await new Smtp({ port: cfg.submissionPort, starttls: true }).connect();
  let rejected = false;
  try {
    await s.send({ mailFrom: cfg.alice, rcptTo: 'someone@example.net', raw: buildMessage({ from: cfg.alice, to: 'someone@example.net', subject: 'must not relay' }).raw });
  } catch (e) {
    rejected = e.code >= 400;
  }
  await s.quit();
  result('unauthenticated relay to an external domain is refused', rejected);
} catch (e) {
  result('unauthenticated relay to an external domain is refused', false, e.message);
}
