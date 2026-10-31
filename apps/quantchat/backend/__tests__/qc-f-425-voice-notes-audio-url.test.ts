// ===========================================================================
// QC-F-425 — voice-notes `audioUrl` was gated by `z.string().url()` ONLY:
// any authenticated caller could hand POST /voice-notes/transcribe or
// /voice-notes/auto-reply ANY URL (private IP, cloud-metadata, loopback,
// another user's media, an arbitrary public host). Today that is latent —
// the default NullTranscriber never fetches (fail-closed 503) — but the
// service's own design wires a real STT provider in staging, and the day
// that adapter lands, this route becomes a server-side fetch (SSRF)
// surface with no further code change.
//
// Fix (Slice 1, brief specialist-qc-f-425-buildprep.md §2 band): route-
// boundary own-storage binding. Both handlers run
// `assertTranscribableAudioUrl(audioUrl, callerId)` BEFORE the service is
// constructed: the URL must pass QC-F-330's validateMediaUrl (https,
// ownership key-shape `<callerId>/media_*/<file>`, `data:` rejected) AND
// its host must match the env-derived own-storage host set EXACTLY —
// F-330's local-host allowance is for browser-loaded media; on a server
// fetch, localhost/127.0.0.1/minio are this server's own loopback.
// Every failure is one 400 MEDIA_URL_NOT_ALLOWED (no host/key oracle).
// The service contract, lib/media-url.ts and the schemas are untouched;
// no provider, no proxy, no consumer is added (HG-425-2/3/4/7).
//
// Harness (brief §3.1): bare Fastify + only the voice-note routes plugin,
// an auth stub, a `prisma` decorate the handlers never reach on reject
// cases, and a stable module-level MessageService stub (the real class's
// constructor builds outbox/streaks/storage; the sink is not this
// finding's subject — its send path stays F-330-pinned). The partial mock
// keeps the module's real exports (lib/media-url derives storage keys via
// the real `extractStorageKey`).
//
// Negative control (brief §3.2/HG-425-6): on the pre-fix route T1–T8 and
// T11 FAIL — every one of those URLs sails past the schema and reaches
// the fail-closed service, answering 503 instead of 400. T9/T10/T12 are
// controls that PASS pre- and post-fix. T3 is additionally the
// validator-only NC: dropping the exact-host check (validator alone)
// makes T3 FAIL, because F-330's validator returns ok:true for a
// loopback URL with a valid own key-shape.
// ===========================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stable module-level mock: only MessageService is replaced; every other
// export of the real module (extractStorageKey above all) stays real.
vi.mock('../services/message.service', async () => {
  const actual = await vi.importActual<typeof import('../services/message.service')>(
    '../services/message.service',
  );
  return {
    ...actual,
    MessageService: class StubMessageService {
      async sendMessage(): Promise<{ id: string }> {
        return { id: 'stub-message' };
      }
    },
  };
});

import Fastify, { type FastifyInstance } from 'fastify';
import voiceNoteRoutes from '../routes/voice-notes';

const CALLER = 'user-1';
const OWN_URL = 'https://quantchat-media.s3.amazonaws.com/user-1/media_abc123/note.mp3';

// ---------------------------------------------------------------------------
// Env hygiene (F-330 pattern): own-host derivation reads process.env, so
// the storage env is unset for every case and restored afterwards — the
// default own host (quantchat-media.s3.amazonaws.com) is deterministic.
// ---------------------------------------------------------------------------
const ENV_KEYS = [
  'S3_BASE_URL',
  'S3_BUCKET',
  'S3_ENDPOINT',
  'R2_ENDPOINT',
  'CLOUDFLARE_R2_ENDPOINT',
  'ATTACHMENTS_BUCKET',
  'R2_BUCKET',
] as const;
let savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

async function buildRouteApp(opts: { withAuth?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  // Decorate pattern mirrors qc-f-466 (the cast keeps the PrismaClient
  // augmentation from producing the PR #903/#905 TS2345 in typecheck).
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate('prisma', {});
  if (opts.withAuth !== false) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = { userId: CALLER, username: 'caller' };
    });
  }
  await app.register(voiceNoteRoutes, { prefix: '/voice-notes' });
  await app.ready();
  return app;
}

interface ErrorBody {
  success: boolean;
  error?: { code?: string; message?: string; statusCode?: number };
}

describe('QC-F-425: voice-notes audioUrl own-storage binding', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRouteApp();
  });
  afterEach(async () => {
    await app.close();
  });

  async function transcribe(audioUrl: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/voice-notes/transcribe',
      payload: { audioUrl },
    });
    return { status: res.statusCode, body: JSON.parse(res.body) as ErrorBody };
  }

  async function autoReply(audioUrl: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/voice-notes/auto-reply',
      payload: { conversationId: 'c1', audioUrl },
    });
    return { status: res.statusCode, body: JSON.parse(res.body) as ErrorBody };
  }

  function expectNotAllowed(r: { status: number; body: ErrorBody }) {
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.error?.code).toBe('MEDIA_URL_NOT_ALLOWED');
  }

  it('T1 rejects an RFC1918 private-IP URL on /transcribe', async () => {
    expectNotAllowed(await transcribe('https://10.0.0.5/user-1/media_abc/note.mp3'));
  });

  it('T2 rejects the cloud metadata link-local address on /transcribe', async () => {
    expectNotAllowed(await transcribe('https://169.254.169.254/latest/meta-data'));
  });

  it('T3 rejects loopback with a valid own key-shape (exact-host layer)', async () => {
    expectNotAllowed(await transcribe('http://127.0.0.1:9000/user-1/media_abc/note.mp3'));
    expectNotAllowed(await transcribe('https://localhost/user-1/media_abc/note.mp3'));
  });

  it('T4 rejects http on the public own-storage host', async () => {
    expectNotAllowed(
      await transcribe('http://quantchat-media.s3.amazonaws.com/user-1/media_abc/note.mp3'),
    );
  });

  it('T5 rejects a userinfo trick whose real host is external', async () => {
    expectNotAllowed(
      await transcribe('https://quantchat-media.s3.amazonaws.com@evil.example/user-1/media_abc/note.mp3'),
    );
  });

  it("T6 rejects another user's own-storage media (cross-owner key)", async () => {
    expectNotAllowed(
      await transcribe('https://quantchat-media.s3.amazonaws.com/user-2/media_abc/note.mp3'),
    );
  });

  it('T7 rejects a valid public https URL on an external host', async () => {
    expectNotAllowed(await transcribe('https://cdn.example.com/user-1/media_abc/note.mp3'));
  });

  it('T8 rejects a data: URL', async () => {
    expectNotAllowed(await transcribe('data:audio/mpeg;base64,AAAA'));
  });

  it('T9 PASS control: the caller’s own uploaded media reaches the fail-closed transcriber', async () => {
    const r = await transcribe(OWN_URL);
    expect(r.status).toBe(503);
    expect(r.body.error?.code).toBe('TRANSCRIBER_NOT_CONFIGURED');
  });

  it('T10 PASS control: /auto-reply with the caller’s own media reaches the fail-closed service', async () => {
    const r = await autoReply(OWN_URL);
    expect(r.status).toBe(503);
    expect(r.body.error?.code).toBe('REPLY_GENERATOR_NOT_CONFIGURED');
  });

  it('T11 rejects a private-IP URL on /auto-reply too', async () => {
    expectNotAllowed(await autoReply('https://192.168.1.10/user-1/media_abc/note.mp3'));
  });

  it('T12 control: unauthenticated requests stay 401 fail-closed', async () => {
    const anon = await buildRouteApp({ withAuth: false });
    try {
      const res = await anon.inject({
        method: 'POST',
        url: '/voice-notes/transcribe',
        payload: { audioUrl: OWN_URL },
      });
      const body = JSON.parse(res.body) as ErrorBody;
      expect(res.statusCode).toBe(401);
      expect(body.error?.code).toBe('UNAUTHORIZED');
    } finally {
      await anon.close();
    }
  });
});
