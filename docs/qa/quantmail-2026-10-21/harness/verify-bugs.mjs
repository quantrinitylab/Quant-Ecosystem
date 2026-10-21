// Targeted verification of two suspected bugs:
//  (A) self-addressed mail is dropped from the sender's own inbox (P2002 on userId,messageId)
//  (B) calendar event created with a calendarId is not linked to that calendar
import { writeFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:3010', ORIGIN = 'http://localhost:3000', RUN = Date.now().toString(36), PW = 'QaPassw0rd!234';
const out = {};
async function call(method, path, { token, body, idem } = {}) {
  const h = { Origin: ORIGIN }; if (token) h.Authorization = `Bearer ${token}`; if (idem) h['Idempotency-Key'] = idem; if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch {} return { status: res.status, j, t };
}
const reg = async (p) => (await call('POST', '/auth/register', { body: p })).j?.data?.accessToken;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const S = { email: `self.${RUN}@quantmail.in`, username: `self${RUN}`, displayName: 'Self', password: PW };
  const D = { email: `dest.${RUN}@quantmail.in`, username: `dest${RUN}`, displayName: 'Dest', password: PW };
  const sTok = await reg(S); const dTok = await reg(D);

  // (A) self-send
  const subjSelf = `SELF ${RUN}`;
  const selfSend = await call('POST', '/emails', { token: sTok, idem: `self-${RUN}`, body: { to: [S.email], subject: subjSelf, bodyText: 'note to self', send: true } });
  await sleep(800);
  let selfInbox = null;
  for (let i = 0; i < 5 && !selfInbox; i++) { const r = await call('GET', '/emails', { token: sTok }); selfInbox = (r.j?.data || []).find(m => m.subject === subjSelf); if (!selfInbox) await sleep(400); }
  out.selfSend = { apiStatus: selfSend.status, apiReportedSuccess: !!selfSend.j?.success, deliveredToOwnInbox: !!selfInbox };

  // control: cross-user S -> D
  const subjCross = `CROSS ${RUN}`;
  const crossSend = await call('POST', '/emails', { token: sTok, idem: `cross-${RUN}`, body: { to: [D.email], subject: subjCross, bodyText: 'hi dest', send: true } });
  await sleep(800);
  let destInbox = null;
  for (let i = 0; i < 5 && !destInbox; i++) { const r = await call('GET', '/emails', { token: dTok }); destInbox = (r.j?.data || []).find(m => m.subject === subjCross); if (!destInbox) await sleep(400); }
  out.crossSend = { apiStatus: crossSend.status, deliveredToDestInbox: !!destInbox };

  // (A2) CC yourself: D -> D-inbox? send from D to [D] cc ... actually test: S sends to D, cc S -> does S (sender) get inbox copy?
  const subjCc = `CCSELF ${RUN}`;
  await call('POST', '/emails', { token: sTok, idem: `ccself-${RUN}`, body: { to: [D.email], cc: [S.email], subject: subjCc, bodyText: 'cc self', send: true } });
  await sleep(800);
  let sCcInbox = null;
  for (let i = 0; i < 5 && !sCcInbox; i++) { const r = await call('GET', '/emails', { token: sTok }); sCcInbox = (r.j?.data || []).find(m => m.subject === subjCc); if (!sCcInbox) await sleep(400); }
  out.ccSelf = { senderGotInboxCopyWhenCcingSelf: !!sCcInbox };

  // (B) calendar link
  const cal = await call('POST', '/calendars', { token: sTok, body: { name: `C ${RUN}`, color: '#FF7A00' } });
  const calId = cal.j?.data?.id;
  const start = new Date(Date.now() + 86400000).toISOString(), end = new Date(Date.now() + 90000000).toISOString();
  const ev = await call('POST', '/events', { token: sTok, body: { title: `E ${RUN}`, start, end, timezone: 'UTC', calendarId: calId } });
  const returnedCalId = ev.j?.data?.calendarId;
  out.calendar = { requestedCalendarId: calId, createStatus: ev.status, returnedEventCalendarId: returnedCalId ?? null, linkedToRequestedCalendar: !!calId && returnedCalId === calId };

  writeFileSync('/projects/sandbox/.qa-env/results/verify-bugs.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
