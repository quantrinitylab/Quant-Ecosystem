// Webhook receiver and MTA Hook stub for the Stalwart lab. No dependencies (Node 18+).
//
//   POST /webhook   Stalwart webhook batches ({"events":[...]}). Answers 204.
//   POST /mta-hook  MTA Hook stage calls. Answers {"action":"accept"} for everything.
//   GET  /captured  Last captured payloads as JSON (?kind=webhook|mta-hook&limit=50).
//   GET  /healthz   Liveness.
//
// Every payload is logged as one JSON line on stdout and appended to
// $HOOK_DATA_DIR/<kind>.jsonl (default ./captured). Nothing is ever rejected.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.HOOK_PORT || 9000);
const dataDir = process.env.HOOK_DATA_DIR || path.resolve('captured');
const maxBody = 64 * 1024 * 1024;
const recent = { webhook: [], 'mta-hook': [] };

try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (err) {
  console.error(JSON.stringify({ level: 'warn', msg: 'cannot create data dir', dataDir, err: String(err) }));
}

function record(kind, req, body) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = { unparsed: body.slice(0, 2000) };
  }
  const entry = {
    receivedAt: new Date().toISOString(),
    kind,
    path: req.url,
    signature: req.headers['x-signature'] || null,
    payload,
  };
  const line = JSON.stringify(entry);
  console.log(line);
  recent[kind].push(entry);
  if (recent[kind].length > 500) recent[kind].shift();
  try {
    fs.appendFileSync(path.join(dataDir, `${kind}.jsonl`), line + '\n');
  } catch (err) {
    console.error(JSON.stringify({ level: 'warn', msg: 'cannot append capture file', err: String(err) }));
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/captured') {
    const kind = url.searchParams.get('kind') || 'webhook';
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 500);
    const items = (recent[kind] || []).slice(-limit);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ kind, count: items.length, items }));
    return;
  }
  if (req.method !== 'POST' || !['/webhook', '/mta-hook'].includes(url.pathname)) {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > maxBody) {
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    if (url.pathname === '/webhook') {
      record('webhook', req, body);
      res.writeHead(204).end();
    } else {
      record('mta-hook', req, body);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ action: 'accept' }));
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', msg: 'hook receiver listening', port, dataDir }));
});
