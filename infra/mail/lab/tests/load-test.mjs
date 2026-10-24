// T13: tiny load test. Submits N messages (default 2000) from alice to bob over a few parallel
// authenticated submission connections, then waits until bob's mailbox holds all of them.
//   TEST_ALICE_PASSWORD=... TEST_BOB_PASSWORD=... node load-test.mjs [count] [connections]
// Prints throughput and the delivery completeness. Check RAM/CPU/disk on the VM separately
// (see lab/tests/resource-snapshot.sh).
import { cfg, need, result, buildMessage, submission, sleep } from './lib.mjs';
import { Jmap } from './jmap-lib.mjs';

need('TEST_ALICE_PASSWORD', 'TEST_BOB_PASSWORD');
const total = Number(process.argv[2] || 2000);
const conns = Number(process.argv[3] || 4);
const run = `lab-load-${Date.now()}`;
const body = 'x'.repeat(2000) + '\r\n';
let sent = 0;
let failed = 0;
let reconnects = 0;
const errors = new Map();
const t0 = Date.now();

async function worker(id) {
  let s = await submission(cfg.alice, cfg.alicePass);
  for (;;) {
    const n = sent++;
    if (n >= total) break;
    const msg = buildMessage({ from: cfg.alice, to: cfg.bob, subject: `${run}-${n}`, body });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await s.send({ mailFrom: cfg.alice, rcptTo: cfg.bob, raw: msg.raw });
        break;
      } catch (e) {
        // 452 "maximum number of messages per session": open a new session and retry the same message.
        const sessionLimit = e.code === 452;
        if (!sessionLimit || attempt === 2) {
          failed++;
          errors.set(e.message, (errors.get(e.message) || 0) + 1);
          break;
        }
        reconnects++;
        try {
          await s.quit();
        } catch {
          /* ignore */
        }
        s = await submission(cfg.alice, cfg.alicePass);
      }
    }
    if (n > 0 && n % 250 === 0) console.log(`  ${id}: submitted ~${n}/${total}`);
  }
  await s.quit();
}

await Promise.all(Array.from({ length: conns }, (_, i) => worker(i)));
const submitSecs = (Date.now() - t0) / 1000;
const accepted = total - failed;
result('submission of the batch', failed === 0, `${accepted}/${total} accepted in ${submitSecs.toFixed(1)} s = ${(accepted / submitSecs).toFixed(1)} msg/s over ${conns} connections (${reconnects} session reconnects)`);
for (const [msg, n] of errors) console.log(`  error x${n}: ${msg}`);

const bob = new Jmap(cfg.bob, cfg.bobPass);
await bob.ensure();
const deadline = Date.now() + 5 * 60 * 1000;
let have = 0;
while (Date.now() < deadline) {
  const [[, q]] = await bob.call([['Email/query', { accountId: bob.accountId, filter: { subject: run }, calculateTotal: true, limit: 1 }, 'q']]);
  have = q.total;
  if (have >= accepted) break;
  await sleep(3000);
}
const totalSecs = (Date.now() - t0) / 1000;
result('all accepted messages arrived in bob\'s mailbox', have >= accepted, `${have}/${accepted} after ${totalSecs.toFixed(1)} s`);
