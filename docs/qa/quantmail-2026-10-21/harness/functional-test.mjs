// QuantMail end-to-end functional test — behaves like two real users (Alice & Bob).
// Node 22 global fetch. Emits JSON + console summary. No external deps.
import { writeFileSync } from 'node:fs';

const BASE = process.env.QM_BASE || 'http://127.0.0.1:3010';
const ORIGIN = 'http://localhost:3000';
const RUN = Date.now().toString(36);
const PW = 'QaPassw0rd!234';
const results = [];
const timings = [];

function rec(name, pass, info, extra = {}) {
  results.push({ name, pass: !!pass, info: info || '', ...extra });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${info ? ' :: ' + info : ''}`);
}

async function req(method, path, opts = {}) {
  const headers = {};
  if (opts.origin !== null) headers['Origin'] = opts.origin || ORIGIN;
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.idem) headers['Idempotency-Key'] = opts.idem;
  if (opts.cookie) headers['Cookie'] = opts.cookie;
  let body;
  if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const t0 = performance.now();
  let res, text = '', err;
  try {
    res = await fetch(BASE + path, { method, headers, body, redirect: 'manual' });
    text = await res.text();
  } catch (e) { err = e; }
  const ms = +(performance.now() - t0).toFixed(1);
  timings.push({ method, path: path.split('?')[0], status: res?.status ?? 0, ms });
  let json; try { json = JSON.parse(text); } catch {}
  const setCookie = res?.headers?.getSetCookie ? res.headers.getSetCookie() : [];
  return { status: res?.status ?? 0, ms, json, text, setCookie, err };
}
const idem = (p) => `${p}-${RUN}-${Math.random().toString(36).slice(2, 10)}`;
function refreshCookie(arr) {
  for (const c of arr || []) { const m = /^quantmail_refresh=([^;]*)/.exec(c); if (m) return 'quantmail_refresh=' + m[1]; }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const alice = { email: `qa.alice.${RUN}@quantmail.in`, username: `qaalice${RUN}`, displayName: 'QA Alice', password: PW };
const bob = { email: `qa.bob.${RUN}@quantmail.in`, username: `qabob${RUN}`, displayName: 'QA Bob', password: PW };

(async () => {
  console.log(`\n=== QuantMail functional test (run ${RUN}) against ${BASE} ===\n`);

  // ---------- HEALTH ----------
  for (const p of ['/health', '/livez', '/readyz', '/api/health']) {
    const r = await req('GET', p);
    rec(`health ${p} -> 200`, r.status === 200, `status=${r.status}`);
  }

  // ---------- SIGN-UP ----------
  const regA = await req('POST', '/auth/register', { body: alice });
  rec('register Alice -> 2xx + token + cookie',
    (regA.status === 200 || regA.status === 201) && regA.json?.success && regA.json?.data?.accessToken && !!refreshCookie(regA.setCookie),
    `status=${regA.status} hasToken=${!!regA.json?.data?.accessToken} cookie=${!!refreshCookie(regA.setCookie)} emailVerification=${JSON.stringify(regA.json?.data?.emailVerification)}`);
  const regB = await req('POST', '/auth/register', { body: bob });
  rec('register Bob -> 2xx', (regB.status === 200 || regB.status === 201) && regB.json?.success, `status=${regB.status}`);

  const dup = await req('POST', '/auth/register', { body: alice });
  rec('register duplicate -> 409 USER_EXISTS', dup.status === 409 && dup.json?.error?.code === 'USER_EXISTS', `status=${dup.status} code=${dup.json?.error?.code}`);

  const weak = await req('POST', '/auth/register', { body: { email: `qa.weak.${RUN}@quantmail.in`, username: `qaweak${RUN}`, password: 'short' } });
  rec('register weak password -> 400', weak.status === 400, `status=${weak.status} code=${weak.json?.error?.code}`);

  const noOrigin = await req('POST', '/auth/register', { origin: null, body: { email: `qa.no.${RUN}@quantmail.in`, username: `qano${RUN}`, password: PW } });
  rec('register without Origin -> 403 UNTRUSTED_ORIGIN', noOrigin.status === 403, `status=${noOrigin.status} code=${noOrigin.json?.error?.code}`);

  // ---------- LOGIN ----------
  const loginA = await req('POST', '/auth/login', { body: { email: alice.email, password: PW } });
  let aTok = loginA.json?.data?.accessToken;
  let aCookie = refreshCookie(loginA.setCookie);
  rec('login Alice -> 200 + token', loginA.status === 200 && !!aTok, `status=${loginA.status}`);

  const loginB = await req('POST', '/auth/login', { body: { email: bob.email, password: PW } });
  const bTok = loginB.json?.data?.accessToken;
  rec('login Bob -> 200 + token', loginB.status === 200 && !!bTok, `status=${loginB.status}`);

  const badPw = await req('POST', '/auth/login', { body: { email: alice.email, password: 'wrong-password' } });
  rec('login wrong password -> 401 INVALID_CREDENTIALS', badPw.status === 401 && badPw.json?.error?.code === 'INVALID_CREDENTIALS', `status=${badPw.status} code=${badPw.json?.error?.code}`);

  const loginNoOrigin = await req('POST', '/auth/login', { origin: null, body: { email: alice.email, password: PW } });
  rec('login without Origin -> 403', loginNoOrigin.status === 403, `status=${loginNoOrigin.status} code=${loginNoOrigin.json?.error?.code}`);

  // ---------- CRITICAL: access token actually works (JWT_SECRET mismatch regression) ----------
  const sess = await req('GET', '/auth/sessions', { token: aTok });
  rec('CRITICAL access token valid on /auth/sessions -> 200 (JWT mismatch check)', sess.status === 200 && sess.json?.success, `status=${sess.status} sessions=${sess.json?.data?.sessions?.length}`);

  const twofa = await req('GET', '/auth/2fa/status', { token: aTok });
  rec('2fa status -> 200 enabled:false', twofa.status === 200 && twofa.json?.data?.enabled === false, `status=${twofa.status} enabled=${twofa.json?.data?.enabled}`);

  const noTok = await req('GET', '/auth/sessions');
  rec('protected endpoint w/o token -> 401', noTok.status === 401, `status=${noTok.status}`);

  // ---------- FOLDERS & LABELS ----------
  const folders = await req('GET', '/folders', { token: aTok });
  const fTypes = (folders.json?.data || []).map((f) => (f.type || f.name || '').toUpperCase());
  const expectF = ['INBOX', 'SENT', 'DRAFTS', 'ARCHIVE', 'TRASH', 'SPAM'];
  rec('default folders created at signup', folders.status === 200 && expectF.every((t) => fTypes.some((x) => x.includes(t))), `status=${folders.status} types=${JSON.stringify(fTypes)}`);

  const lab0 = await req('GET', '/labels', { token: aTok });
  rec('labels list -> 200 array', lab0.status === 200 && Array.isArray(lab0.json?.data), `status=${lab0.status}`);
  const labNew = await req('POST', '/labels', { token: aTok, body: { name: `work-${RUN}`, color: '#FF7A00' } });
  rec('create label -> 201', labNew.status === 201 && labNew.json?.data?.id, `status=${labNew.status}`);

  // ---------- COMPOSE & SEND internal A -> B ----------
  const sendBody = { to: [bob.email], subject: `QA hello ${RUN}`, bodyText: 'Hello Bob, this is an internal delivery test.', send: true };
  const sendKey = idem('send');
  const send1 = await req('POST', '/emails', { token: aTok, idem: sendKey, body: sendBody });
  const sentId = send1.json?.data?.id;
  rec('Alice sends internal email (send:true) -> 201', (send1.status === 201 || send1.status === 200) && send1.json?.success && sentId, `status=${send1.status} id=${sentId} deliveryStatus=${send1.json?.data?.deliveryStatus}`);

  // missing idempotency key
  const noKey = await req('POST', '/emails', { token: aTok, body: sendBody });
  rec('compose without Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED', noKey.status === 400 && noKey.json?.error?.code === 'IDEMPOTENCY_KEY_REQUIRED', `status=${noKey.status} code=${noKey.json?.error?.code}`);

  // idempotent replay (same key + same body) -> should NOT create a duplicate
  const replay = await req('POST', '/emails', { token: aTok, idem: sendKey, body: sendBody });
  rec('idempotent replay (same key/body) -> same id, no dup', (replay.status === 201 || replay.status === 200) && replay.json?.data?.id === sentId, `status=${replay.status} id=${replay.json?.data?.id}`);

  // same key + different body -> 422 reuse
  const reuse = await req('POST', '/emails', { token: aTok, idem: sendKey, body: { ...sendBody, subject: 'different' } });
  rec('same key + different body -> 422 IDEMPOTENCY_KEY_REUSE', reuse.status === 422 && reuse.json?.error?.code === 'IDEMPOTENCY_KEY_REUSE', `status=${reuse.status} code=${reuse.json?.error?.code}`);

  // Alice SENT folder shows it
  const sent = await req('GET', '/emails?folderType=SENT', { token: aTok });
  rec('Alice SENT folder contains the message', sent.status === 200 && (sent.json?.data || []).some((m) => m.subject === sendBody.subject), `status=${sent.status} count=${sent.json?.data?.length}`);

  // Bob INBOX receives it (poll briefly)
  let inboxHit = null;
  for (let i = 0; i < 6 && !inboxHit; i++) {
    const inbox = await req('GET', '/emails', { token: bTok });
    inboxHit = (inbox.json?.data || []).find((m) => m.subject === sendBody.subject);
    if (!inboxHit) await sleep(500);
  }
  rec('CORE internal delivery A->B: Bob INBOX has Alice\'s email', !!inboxHit,
    inboxHit ? `from=${inboxHit.fromAddress || inboxHit.from?.email} deliveryStatus=${inboxHit.deliveryStatus} isRead=${inboxHit.isRead}` : 'not found in inbox after ~3s');
  const bobMsgId = inboxHit?.id;

  // Bob reads the single message
  if (bobMsgId) {
    const read = await req('GET', `/emails/${bobMsgId}`, { token: bTok });
    rec('Bob reads received email -> 200', read.status === 200 && read.json?.data?.id === bobMsgId, `status=${read.status}`);
  } else rec('Bob reads received email -> 200', false, 'skipped (no inbox message)');

  // Threads
  const threads = await req('GET', '/threads', { token: bTok });
  rec('Bob threads list -> 200', threads.status === 200 && threads.json?.success, `status=${threads.status}`);

  // ---------- TENANT ISOLATION (IDOR) ----------
  if (sentId) {
    const idor = await req('GET', `/emails/${sentId}`, { token: bTok });
    rec('IDOR: Bob cannot read Alice\'s SENT message id -> 403/404', idor.status === 403 || idor.status === 404, `status=${idor.status}`);
  }

  // ---------- CONTACTS ----------
  const cNew = await req('POST', '/contacts', { token: aTok, body: { name: 'Bob Q', email: bob.email, tags: ['colleague'] } });
  rec('create contact -> 201', cNew.status === 201 && cNew.json?.data?.id, `status=${cNew.status}`);
  const cList = await req('GET', '/contacts', { token: aTok });
  rec('list contacts -> 200 + metadata', cList.status === 200 && Array.isArray(cList.json?.data) && cList.json?.metadata, `status=${cList.status} total=${cList.json?.metadata?.total}`);
  const cBad = await req('POST', '/contacts', { token: aTok, body: { name: 'X', email: bob.email, bogusField: 1 } });
  rec('contacts strict schema rejects unknown key -> 400', cBad.status === 400, `status=${cBad.status} code=${cBad.json?.error?.code}`);

  // ---------- CALENDAR ----------
  const calNew = await req('POST', '/calendars', { token: aTok, body: { name: `QA Cal ${RUN}`, color: '#FF7A00' } });
  const calId = calNew.json?.data?.id;
  rec('create calendar -> 201', calNew.status === 201 && calId, `status=${calNew.status}`);
  const calList = await req('GET', '/calendars', { token: aTok });
  rec('list calendars -> 200', calList.status === 200 && (calList.json?.data || []).some((c) => c.id === calId), `status=${calList.status} count=${calList.json?.data?.length}`);
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 86400000 + 3600000).toISOString();
  const evNew = await req('POST', '/events', { token: aTok, body: { title: `QA Event ${RUN}`, start, end, timezone: 'UTC', calendarId: calId } });
  const evId = evNew.json?.data?.id;
  rec('create event -> 201', evNew.status === 201 && evId, `status=${evNew.status}`);
  const evList = await req('GET', `/events?start=${encodeURIComponent(new Date(Date.now() - 3600000).toISOString())}&end=${encodeURIComponent(new Date(Date.now() + 3 * 86400000).toISOString())}`, { token: aTok });
  rec('list events in window -> 200 includes event', evList.status === 200 && (evList.json?.data || []).some((e) => e.id === evId || e.title === `QA Event ${RUN}`), `status=${evList.status} count=${evList.json?.data?.length}`);
  const evBad = await req('POST', '/events', { token: aTok, body: { title: 'bad range', start: end, end: start, timezone: 'UTC' } });
  rec('event end<start -> 400', evBad.status === 400, `status=${evBad.status} code=${evBad.json?.error?.code}`);

  // ---------- DRIVE ----------
  const quota = await req('GET', '/drive/quota', { token: aTok });
  rec('drive quota -> 200 raw {used,total}', quota.status === 200 && quota.json && ('used' in quota.json) && ('total' in quota.json), `status=${quota.status} used=${quota.json?.used} total=${quota.json?.total}`);
  const dfiles = await req('GET', '/drive/files', { token: aTok });
  rec('drive files list -> 200 (DB-backed, no storage needed)', dfiles.status === 200 && dfiles.json && ('files' in dfiles.json), `status=${dfiles.status} files=${dfiles.json?.files?.length}`);

  // ---------- SEARCH ----------
  const se = await req('GET', `/search/emails?q=${encodeURIComponent('QA hello ' + RUN)}`, { token: bTok });
  rec('search emails finds delivered message', se.status === 200 && (se.json?.data || []).some((m) => m.subject === sendBody.subject), `status=${se.status} count=${se.json?.data?.length}`);
  const sa = await req('GET', `/search/all?q=${encodeURIComponent('QA')}`, { token: aTok });
  rec('search/all cross-app -> 200', sa.status === 200 && sa.json?.success, `status=${sa.status}`);

  // ---------- AI (expected unconfigured) ----------
  const ai = await req('POST', '/ai/chat', { token: aTok, body: { messages: [{ role: 'user', content: 'hello' }] } });
  rec('AI chat unconfigured -> 503 AI_UNAVAILABLE (graceful)', ai.status === 503 && ai.json?.error?.code === 'AI_UNAVAILABLE', `status=${ai.status} code=${ai.json?.error?.code}`);

  // ---------- REFRESH / LOGOUT ----------
  const refr = await req('POST', '/auth/refresh', { cookie: aCookie });
  const aTok2 = refr.json?.data?.accessToken;
  const aCookie2 = refreshCookie(refr.setCookie) || aCookie;
  rec('refresh with cookie -> 200 new token', refr.status === 200 && !!aTok2, `status=${refr.status} rotated=${!!refreshCookie(refr.setCookie)}`);
  const newTokWorks = await req('GET', '/auth/sessions', { token: aTok2 });
  rec('refreshed token works -> 200', newTokWorks.status === 200, `status=${newTokWorks.status}`);
  const logout = await req('POST', '/auth/logout', { cookie: aCookie2 });
  rec('logout -> 200', logout.status === 200, `status=${logout.status}`);
  const refrAfter = await req('POST', '/auth/refresh', { cookie: aCookie2 });
  rec('refresh after logout -> 401 (revoked family)', refrAfter.status === 401, `status=${refrAfter.status}`);

  // ---------- UNKNOWN ROUTE ----------
  const unk = await req('GET', '/this-route-does-not-exist', { token: bTok });
  rec('unknown route -> 404', unk.status === 404, `status=${unk.status}`);

  // ---------- RATE LIMIT (run last; shared IP bucket) ----------
  let got429 = false, codes = [];
  for (let i = 0; i < 8; i++) {
    const r = await req('POST', '/auth/login', { body: { email: `nobody${RUN}@quantmail.in`, password: 'x' } });
    codes.push(r.status);
    if (r.status === 429) { got429 = true; break; }
  }
  rec('login rate-limit kicks in (<=8 attempts) -> 429', got429, `sequence=${JSON.stringify(codes)}`);

  // ---------- SUMMARY ----------
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  const byEp = {};
  for (const t of timings) { const k = `${t.method} ${t.path}`; (byEp[k] ||= []).push(t.ms); }
  const latency = Object.entries(byEp).map(([k, arr]) => ({ endpoint: k, n: arr.length, avgMs: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1), maxMs: Math.max(...arr) })).sort((a, b) => b.avgMs - a.avgMs);
  const summary = { run: RUN, base: BASE, total: results.length, pass, fail, results, latency };
  writeFileSync(process.env.QM_OUT || '/projects/sandbox/.qa-env/results/functional-results.json', JSON.stringify(summary, null, 2));
  console.log(`\n=== SUMMARY: ${pass}/${results.length} passed, ${fail} failed ===`);
  if (fail) { console.log('FAILURES:'); results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.name} :: ${r.info}`)); }
  console.log('\nSlowest endpoints:'); latency.slice(0, 8).forEach((l) => console.log(`  ${l.endpoint}  avg=${l.avgMs}ms max=${l.maxMs}ms n=${l.n}`));
  process.exit(0);
})().catch((e) => { console.error('HARNESS CRASH', e); process.exit(1); });
