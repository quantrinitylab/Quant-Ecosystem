// ============================================================================
// Phase 0 RESTART-PERSISTENCE SMOKE (P0-6, spec §3.4) — ENV-GATED.
//
// This is the first honest "survives restart" evidence in the QuantCooks
// lane. Every persistence proof before it (P0-1..P0-5) is cross-instance over
// a shared FAKE store — it proves the services hold no in-memory state, but
// it cannot prove data survives a real process dying, a real Postgres, and
// real Prisma engines (none of which exist in the local extract).
//
// The smoke therefore works at the PROCESS level: it spawns the real backend
// (backend/server.ts — the same entry staging runs; NOT buildApp() in
// process), drives it over HTTP through the full Phase 0 chain, SIGTERMs it,
// respawns it against the same database + bucket, and re-asserts everything.
//
//   PHASE0_SMOKE=1  — enables the suite. Without it the suite SKIPS and the
//                     P0-6 gate reports G7/G8 as NOT RUN (never as passed).
//
// Required env when enabled (a gated run with incomplete env FAILS, listing
// what is missing — it does not quietly skip):
//   DATABASE_URL                       real Postgres (disposable in CI)
//   JWT_SECRET                         smoke-only secret; tokens are minted
//                                      locally with HS256 (node:crypto) in
//                                      the exact shape server-core's auth
//                                      plugin verifies (sub/iss/aud — see
//                                      backend/app.ts getConfig() defaults
//                                      quantedits / quant-ecosystem)
//   one of ATTACHMENTS_BUCKET / R2_BUCKET / S3_BUCKET
//                                      a QuantCooks bucket, explicitly set —
//                                      never the storage resolver's shared
//                                      default (spec §3.4 / audit bucket trap)
//   plus the @quant/storage connection env for that bucket, and `ffmpeg` +
//   `ffprobe` on PATH.
//
// Optional:
//   PHASE0_SMOKE_SERVER_CMD            full command to start the backend
//                                      (default: backend/dist/server.mjs if
//                                      present — the bundled staging artefact —
//                                      else `node --loader ts-node/esm
//                                      backend/server.ts`)
//   PHASE0_SMOKE_USER                  smoke user id (default below)
//
// Failure honesty: any step failure fails the suite with the step number and
// the response body in the message. No retries beyond the export poll.
// ============================================================================

import { describe, it, expect, afterAll } from 'vitest';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ENABLED = process.env['PHASE0_SMOKE'] === '1';
const SMOKE_USER = process.env['PHASE0_SMOKE_USER'] ?? 'phase0-smoke-user';
const BACKEND_DIR = dirname(fileURLToPath(import.meta.url)).replace(/\/__tests__$/, '');
const APP_DIR = dirname(BACKEND_DIR);

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'] as const;
const BUCKET_VARS = ['ATTACHMENTS_BUCKET', 'R2_BUCKET', 'S3_BUCKET'] as const;

function missingEnv(): string[] {
  const missing: string[] = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (!BUCKET_VARS.some((k) => process.env[k])) {
    missing.push(`one of ${BUCKET_VARS.join(' / ')} (explicit QuantCooks bucket)`);
  }
  return missing;
}

/** Mint an HS256 JWT in the shape @quant/server-core's auth plugin verifies. */
function mintSmokeToken(): string {
  const secret = process.env['JWT_SECRET'] as string;
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: SMOKE_USER,
    iss: process.env['JWT_ISSUER'] ?? 'quantedits',
    aud: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    iat: now,
    exp: now + 3600,
  };
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const sig = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${sig}`;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

interface RunningServer {
  child: ChildProcess;
  base: string;
  output: () => string;
}

async function startServer(port: number): Promise<RunningServer> {
  const override = process.env['PHASE0_SMOKE_SERVER_CMD'];
  const bundle = join(BACKEND_DIR, 'dist', 'server.mjs');
  const [cmd, args] = override
    ? (() => {
        const parts = override.split(' ');
        return [parts[0] as string, parts.slice(1)] as const;
      })()
    : existsSync(bundle)
      ? (['node', [bundle]] as const)
      : (['node', ['--loader', 'ts-node/esm', join(BACKEND_DIR, 'server.ts')]] as const);

  let log = '';
  const child = spawn(cmd, [...args], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      // The export processor must be ON for step 4 (it is storage-gated in
      // server.ts, and this smoke only runs with storage env present).
      EXPORT_PROCESSOR_DISABLED: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => (log += String(d)));
  child.stderr?.on('data', (d) => (log += String(d)));

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`backend exited during boot (code ${child.exitCode}). Output:\n${log}`);
    }
    try {
      const res = await fetch(`${base}/livez`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      throw new Error(`backend did not become ready within 60s. Output:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { child, base, output: () => log };
}

async function stopServer(server: RunningServer): Promise<void> {
  const { child } = server;
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 15_000)),
  ]);
  if (!graceful) {
    child.kill('SIGKILL');
    await exited;
  }
}

/** One asserted smoke step — failures carry the step number + response body. */
async function step<T>(n: number, name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new Error(
      `SMOKE STEP ${n} (${name}) FAILED: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

describe.skipIf(!ENABLED)('phase 0 restart-persistence smoke (real process, real DB, real storage)', () => {
  let server: RunningServer | null = null;
  let workDir: string | null = null;

  afterAll(async () => {
    if (server) await stopServer(server).catch(() => undefined);
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it(
    'create → upload → save state → export → SIGTERM → respawn → everything still true',
    async () => {
      const missing = missingEnv();
      if (missing.length > 0) {
        throw new Error(
          `PHASE0_SMOKE=1 but required env is missing: ${missing.join(', ')}. ` +
            'This is a FAILED gated run, not a skip.',
        );
      }

      const token = mintSmokeToken();
      const auth = { Authorization: `Bearer ${token}` };
      const port = await freePort();
      workDir = await mkdtemp(join(tmpdir(), 'qc-phase0-smoke-'));

      const call = async (
        base: string,
        method: string,
        path: string,
        body?: unknown,
      ): Promise<{ status: number; json: Record<string, never> }> => {
        const res = await fetch(`${base}${path}`, {
          method,
          headers: { ...auth, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          redirect: 'manual',
        });
        const text = await res.text();
        let json: Record<string, never> = {};
        try {
          json = JSON.parse(text);
        } catch {
          /* download/redirect steps read raw responses themselves */
        }
        return { status: res.status, json: Object.assign(json, { __raw: text }) };
      };
      const data = (r: { json: Record<string, never> }) =>
        (r.json as unknown as { data: Record<string, never> }).data;

      // -- Boot process A -----------------------------------------------------
      server = await step(0, 'boot process A', () => startServer(port));
      const base = server.base;

      // -- Step 1: create project ---------------------------------------------
      const projectId = await step(1, 'POST /projects → 201, version 1', async () => {
        const r = await call(base, 'POST', '/projects', {
          name: `Phase 0 smoke ${Date.now()}`,
          type: 'video',
        });
        expect(r.status, JSON.stringify(r.json)).toBe(201);
        const d = data(r) as unknown as { id: string };
        expect(d.id).toBeTruthy();
        return d.id;
      });

      // -- Step 2 (spec step 3, run first): upload a real fixture -------------
      const fixturePath = join(workDir, 'fixture.mp4');
      const fixtureBytes = await step(2, 'generate + upload fixture → READY, bytes round-trip', async () => {
        await execFileAsync('ffmpeg', [
          '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=10',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fixturePath,
        ]);
        const bytes = await readFile(fixturePath);

        const up = await call(base, 'POST', '/assets/upload-url', {
          projectId,
          filename: 'fixture.mp4',
          contentType: 'video/mp4',
          size: bytes.length,
        });
        expect(up.status, JSON.stringify(up.json)).toBe(200);
        const u = data(up) as unknown as {
          assetId: string; uploadUrl: string; requiredHeaders: Record<string, string>;
        };
        const headers = { ...u.requiredHeaders };
        delete headers['Content-Length']; // forbidden header; fetch sets it
        const put = await fetch(u.uploadUrl, { method: 'PUT', headers, body: bytes });
        expect(put.ok, `PUT to signed URL → ${put.status}`).toBe(true);

        const done = await call(base, 'POST', `/assets/${u.assetId}/complete`);
        expect(done.status, JSON.stringify(done.json)).toBe(200);
        const a = data(done) as unknown as { id: string; uploadStatus: string; url: string };
        expect(a.uploadStatus).toBe('READY');

        const dl = await fetch(a.url);
        expect(dl.ok).toBe(true);
        const roundTrip = Buffer.from(await dl.arrayBuffer());
        expect(roundTrip.equals(bytes), 'downloaded bytes differ from uploaded fixture').toBe(true);
        return { assetId: u.assetId, bytes };
      });

      // -- Step 3 (spec step 2): save editor state referencing the asset ------
      const DOC = {
        schemaVersion: 1,
        tracks: [
          {
            id: 'track-1', name: 'Video 1', type: 'video', locked: false, visible: true, height: 60,
            clips: [
              {
                id: 'clip-a', trackId: 'track-1', name: 'Fixture', startTime: 0, duration: 1,
                trimStart: 0, trimEnd: 0, type: 'video', thumbnail: '', volume: 1, opacity: 1,
                filters: { brightness: 0, contrast: 0, saturation: 0, blur: 0, hue: 0 },
                position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0,
                assetId: fixtureBytes.assetId,
              },
            ],
          },
          {
            id: 'track-2', name: 'Captions', type: 'text', locked: false, visible: true, height: 40,
            clips: [],
          },
        ],
        duration: 120,
        aspectRatio: '16:9',
      };
      await step(3, 'PUT /projects/:id/state → version 2 + layer projection carries assetId', async () => {
        const r = await call(base, 'PUT', `/projects/${projectId}/state`, { version: 1, timeline: DOC });
        expect(r.status, JSON.stringify(r.json)).toBe(200);
        expect((data(r) as unknown as { version: number }).version).toBe(2);

        const layers = await call(base, 'GET', `/projects/${projectId}/layers`);
        expect(layers.status, JSON.stringify(layers.json)).toBe(200);
        const rows = data(layers) as unknown as Array<{ content: { assetId?: string } }>;
        expect(rows.some((row) => row.content?.assetId === fixtureBytes.assetId)).toBe(true);
      });

      // -- Step 4: export → COMPLETED → playable download ----------------------
      const exportId = await step(4, 'POST /export → poll → COMPLETED → ffprobe-playable download', async () => {
        const q = await call(base, 'POST', '/export', {
          projectId, format: 'mp4', resolution: '720p', quality: 'high',
        });
        expect(q.status, JSON.stringify(q.json)).toBe(201);
        const id = (data(q) as unknown as { id: string }).id;

        const deadline = Date.now() + 120_000;
        let status = '';
        for (;;) {
          const s = await call(base, 'GET', `/export/${id}`);
          status = (data(s) as unknown as { status: string }).status;
          if (status === 'COMPLETED' || status === 'FAILED') break;
          if (Date.now() > deadline) throw new Error(`export still ${status} after 120s`);
          await new Promise((r) => setTimeout(r, 1000));
        }
        expect(status).toBe('COMPLETED');

        const dlRes = await fetch(`${base}/export/${id}/download`, {
          headers: auth, redirect: 'manual',
        });
        expect(dlRes.status, 'download should redirect to a signed URL').toBe(302);
        const location = dlRes.headers.get('location');
        expect(location).toBeTruthy();
        const file = await fetch(location as string);
        expect(file.ok).toBe(true);
        const outPath = join(workDir as string, 'export.mp4');
        await writeFile(outPath, Buffer.from(await file.arrayBuffer()));

        const { VideoTranscoder } = await import('@quant/media');
        const info = (await new VideoTranscoder().getMediaInfo(outPath)) as unknown as {
          format?: { duration?: string };
          streams?: Array<{ height?: number; codec_type?: string }>;
        };
        const video = info.streams?.find((s) => s.codec_type === 'video');
        expect(video, 'export has no video stream').toBeTruthy();
        expect(video?.height ?? 9999).toBeLessThanOrEqual(720);
        const dur = Number(info.format?.duration ?? 0);
        // The render sourced the 1s fixture asset (spec §3.5's explicit
        // assertion): output duration ≈ source duration, not some other
        // project's media.
        expect(dur, `export duration ${dur}s does not match the 1s fixture`).toBeGreaterThan(0.4);
        expect(dur).toBeLessThan(1.8);
        return id;
      });

      // -- Step 5: restart ------------------------------------------------------
      await step(5, 'SIGTERM process A → respawn process B (same DB, same bucket)', async () => {
        await stopServer(server as RunningServer);
        server = await startServer(port);
      });
      const baseB = (server as RunningServer).base;

      // -- Step 6: re-assert everything against process B -----------------------
      await step(6, 'post-restart: state deep-equals, asset READY + bytes, export COMPLETED', async () => {
        const st = await call(baseB, 'GET', `/projects/${projectId}/state`);
        expect(st.status, JSON.stringify(st.json)).toBe(200);
        const sd = data(st) as unknown as { version: number; timeline: unknown };
        expect(sd.version).toBe(2);
        expect(sd.timeline).toEqual(DOC);

        const assets = await call(baseB, 'GET', `/assets?projectId=${projectId}`);
        expect(assets.status, JSON.stringify(assets.json)).toBe(200);
        const list = data(assets) as unknown as Array<{ id: string; uploadStatus: string; url: string }>;
        const asset = list.find((a) => a.id === fixtureBytes.assetId);
        expect(asset, 'asset missing after restart').toBeTruthy();
        expect(asset?.uploadStatus).toBe('READY');
        const dl = await fetch(asset?.url as string);
        expect(dl.ok).toBe(true);
        expect(Buffer.from(await dl.arrayBuffer()).equals(fixtureBytes.bytes)).toBe(true);

        const ex = await call(baseB, 'GET', `/export/${exportId}`);
        expect((data(ex) as unknown as { status: string }).status).toBe('COMPLETED');
        const dlRes = await fetch(`${baseB}/export/${exportId}/download`, {
          headers: auth, redirect: 'manual',
        });
        expect(dlRes.status).toBe(302);
      });

      // -- Step 7: cleanup -------------------------------------------------------
      // Mandatory on staging (shared bucket/DB), courtesy in disposable CI.
      // Project soft-delete + asset delete go through the real APIs. The
      // export job row/object has no delete API in Phase 0 — recorded here
      // honestly: on a shared staging environment it is removed manually;
      // the smoke never pretends otherwise.
      await step(7, 'cleanup: soft-delete project, delete asset', async () => {
        const delAsset = await call(baseB, 'DELETE', `/assets/${fixtureBytes.assetId}`);
        expect([200, 204]).toContain(delAsset.status);
        const delProject = await call(baseB, 'DELETE', `/projects/${projectId}`);
        expect([200, 204]).toContain(delProject.status);
      });
    },
    300_000,
  );
});
