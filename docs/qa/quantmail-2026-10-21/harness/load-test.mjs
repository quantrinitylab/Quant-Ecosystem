// QuantMail load test — simulates real user traffic against the backend.
// Node 22 global fetch. Phases: read-heavy (inbox+search), write (compose/send),
// and a login rate-limit probe. Emits JSON + console summary with p50/p95/p99.
import { writeFileSync } from 'node:fs';

const BASE = process.env.QM_BASE || 'http://127.0.0.1:3010';
const ORIGIN = 'http://localhost:3000';
const RUN = Date.now().toString(36);
const PW = 'QaPassw0rd!234';
const READ_CONC = +(process.env.READ_CONC || 60);
const READ_SECS = +(process.env.READ_SECS || 15);
const WRITE_CONC = +(process.env.WRITE_CONC || 20);
const WRITE_SECS = +(process.env.WRITE_SECS || 10);
const SEED_MAILS = +(process.env.SEED_MAILS || 25);

const H = (extra = {}) => ({ Origin: ORIGIN, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, path, { token, body, idem } = {}) {
  const headers = H();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idem) headers['Idempotency-Key'] = idem;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const txt = await res.text();
    return { status: res.status, ms: performance.now() - t0, txt };
  } catch (e) { return { status: 0, ms: performance.now() - t0, err: String(e) }; }
}
function pct(arr, p) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))].toFixed(1); }
function stat(name, lat, statuses) {
  const codes = {}; for (const s of statuses) codes[s] = (codes[s] || 0) + 1;
  const ok = statuses.filter((s) => s >= 200 && s < 300).length;
  const o = { name, requests: lat.length, ok, errPct: +((1 - ok / lat.length) * 100).toFixed(2), rps: null,
    p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: +Math.max(...lat).toFixed(1), codes };
  return o;
}
async function runPhase(name, conc, secs, taskFn) {
  const lat = [], statuses = [];
  const deadline = performance.now() + secs * 1000;
  let n = 0;
  async function worker() {
    while (performance.now() < deadline) { const r = await taskFn(n++); lat.push(r.ms); statuses.push(r.status); }
  }
  const t0 = performance.now();
  await Promise.all(Array.from({ length: conc }, worker));
  const secsReal = (performance.now() - t0) / 1000;
  const s = stat(name, lat, statuses); s.rps = +(lat.length / secsReal).toFixed(1); s.concurrency = conc; s.durationS = +secsReal.toFixed(1);
  console.log(`\n[${name}] conc=${conc} ${s.durationS}s  req=${s.requests} rps=${s.rps} ok=${s.ok} err%=${s.errPct}`);
  console.log(`   latency ms: p50=${s.p50} p95=${s.p95} p99=${s.p99} max=${s.max}  codes=${JSON.stringify(s.codes)}`);
  return s;
}

(async () => {
  console.log(`\n=== QuantMail LOAD TEST (run ${RUN}) against ${BASE} ===`);
  console.log(`read: conc=${READ_CONC} ${READ_SECS}s | write: conc=${WRITE_CONC} ${WRITE_SECS}s | seed=${SEED_MAILS}\n`);
  const report = { run: RUN, base: BASE, config: { READ_CONC, READ_SECS, WRITE_CONC, WRITE_SECS, SEED_MAILS }, phases: [] };

  // ---- setup: user + mail ----
  const u = { email: `load.${RUN}@quantmail.in`, username: `load${RUN}`, displayName: 'Load User', password: PW };
  const reg = await call('POST', '/auth/register', { body: u });
  let token = JSON.parse(reg.txt || '{}')?.data?.accessToken;
  if (!token) { const li = await call('POST', '/auth/login', { body: { email: u.email, password: PW } }); token = JSON.parse(li.txt || '{}')?.data?.accessToken; }
  if (!token) { console.error('SETUP FAILED: no token', reg.status, reg.txt?.slice(0, 200)); process.exit(1); }
  console.log(`setup: user ${u.email} token acquired; seeding ${SEED_MAILS} emails...`);
  let seeded = 0;
  for (let i = 0; i < SEED_MAILS; i++) {
    const r = await call('POST', '/emails', { token, idem: `seed-${RUN}-${i}`, body: { to: [u.email], subject: `Load seed ${i} ${RUN}`, bodyText: `Body number ${i} with searchable token zphrase${RUN}.`, send: true } });
    if (r.status >= 200 && r.status < 300) seeded++;
  }
  console.log(`seeded ${seeded}/${SEED_MAILS} emails`);
  await sleep(500);

  // ---- warm check ----
  const warm = await call('GET', '/emails', { token });
  console.log(`warm GET /emails -> ${warm.status}, ${JSON.parse(warm.txt || '{}')?.data?.length ?? '?'} msgs`);

  // ---- Phase: health under load (public) ----
  report.phases.push(await runPhase('GET /livez (health)', 40, 8, () => call('GET', '/livez')));

  // ---- Phase: read-heavy (inbox list + search mix) ----
  report.phases.push(await runPhase('GET /emails (inbox list)', READ_CONC, READ_SECS, () => call('GET', '/emails?pageSize=50', { token })));
  report.phases.push(await runPhase('GET /search/emails (broken fast-path->fallback)', READ_CONC, READ_SECS, () => call('GET', `/search/emails?q=zphrase${RUN}`, { token })));

  // ---- Phase: write (compose+send, idempotency+delivery+DB writes) ----
  report.phases.push(await runPhase('POST /emails (compose+send)', WRITE_CONC, WRITE_SECS, (n) => call('POST', '/emails', { token, idem: `w-${RUN}-${n}-${Math.random().toString(36).slice(2, 8)}`, body: { to: [u.email], subject: `w ${n}`, bodyText: 'load write', send: true } })));

  // ---- Phase: login rate-limit probe (per-route 5/min, keyed by IP) ----
  {
    const lat = [], statuses = [];
    await Promise.all(Array.from({ length: 30 }, async () => { const r = await call('POST', '/auth/login', { body: { email: u.email, password: PW } }); lat.push(r.ms); statuses.push(r.status); }));
    const s = stat('POST /auth/login (rate-limit probe, 30 reqs)', lat, statuses); s.rps = null;
    console.log(`\n[${s.name}] req=${s.requests} codes=${JSON.stringify(s.codes)}  (expect few 200 then 429 — shared IP bucket)`);
    report.phases.push(s);
  }

  report.generatedAt = new Date().toISOString();
  writeFileSync(process.env.QM_OUT || '/projects/sandbox/.qa-env/results/load-results.json', JSON.stringify(report, null, 2));
  console.log('\n=== LOAD TEST DONE ===');
  process.exit(0);
})().catch((e) => { console.error('LOAD CRASH', e); process.exit(1); });
