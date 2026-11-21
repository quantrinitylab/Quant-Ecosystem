// T10: GTUBE spam test. Sends the standard GTUBE pattern to alice on port 25 as an external sender
// and checks (through JMAP as alice) that Stalwart classified it as spam.
//   TEST_ALICE_PASSWORD=... node gtube.mjs
import { cfg, need, result, buildMessage, Smtp } from './lib.mjs';
import { Jmap } from './jmap-lib.mjs';

need('TEST_ALICE_PASSWORD');
const subject = `lab-gtube-${Date.now()}`;
const GTUBE = 'XJS*C4JDBQADN1.NSBN3*2IDNEN*GTUBE-STANDARD-ANTI-UBE-TEST-EMAIL*C.34X';

let sent = false;
let rejectedAtSmtp = false;
try {
  const s = await new Smtp({ port: cfg.smtpPort, starttls: true }).connect();
  const msg = buildMessage({ from: 'spammer@external-sender.example', to: cfg.alice, subject, body: GTUBE + '\r\n' });
  const reply = await s.send({ mailFrom: 'spammer@external-sender.example', rcptTo: cfg.alice, raw: msg.raw });
  await s.quit();
  sent = true;
  result('GTUBE message accepted by SMTP', true, reply.split(/\r?\n/).pop());
} catch (e) {
  rejectedAtSmtp = e.code >= 500;
  result('GTUBE message accepted by SMTP', rejectedAtSmtp, rejectedAtSmtp ? `rejected at SMTP (${e.message}); acceptable policy` : e.message);
}

if (sent) {
  try {
    const alice = new Jmap(cfg.alice, cfg.alicePass);
    const mail = await alice.waitFor(subject, 60000);
    if (!mail) {
      result('GTUBE message is flagged as spam', false, 'message not found in 60 s');
    } else {
      const boxes = await alice.mailboxes();
      const junk = boxes.find((b) => b.role === 'junk');
      const inJunk = junk && mail.mailboxIds && mail.mailboxIds[junk.id];
      const kw = mail.keywords || {};
      const flagged = Boolean(inJunk || kw.$junk || kw['$Junk']);
      const spamHeader = (mail.headers || []).find((h) => /^x-spam/i.test(h.name));
      result('GTUBE message is flagged as spam', flagged, `junkMailbox=${Boolean(inJunk)} keywords=${Object.keys(kw).join(',')} header=${spamHeader ? spamHeader.name : 'none'}`);
    }
  } catch (e) {
    result('GTUBE message is flagged as spam', false, e.message);
  }
}
