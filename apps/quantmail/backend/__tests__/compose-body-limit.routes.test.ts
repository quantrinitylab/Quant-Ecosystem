/**
 * Compose/draft body-limit regression tests (P1: attachments 413).
 *
 * Both composers (DockedComposer, EmailComposer) advertise 20 MB per file /
 * 25 MB total and read files as base64 data URLs (~4/3 inflation) POSTed
 * inside the compose JSON. The Fastify default bodyLimit was 1 MiB, so any
 * attachment pushing the compose JSON past ~1 MB returned 413 Payload Too
 * Large on BOTH the 10s autosave (PUT /emails/:id) and the send
 * (POST /emails, POST /emails/compose).
 *
 * The fix has two layers:
 * 1. A per-route bodyLimit of 40 MB on the three compose/draft routes —
 *    enough for the advertised totals under base64 inflation, still under the
 *    ingress 50m ceiling and the SESv2 40 MB raw-message cap.
 * 2. An honest attachment-size guard (assertComposeAttachmentSizes) enforcing
 *    the ADVERTISED 20 MB/file + 25 MB total at the trust boundary with typed
 *    413s (ATTACHMENT_TOO_LARGE / ATTACHMENTS_TOTAL_TOO_LARGE) — so a caller
 *    that bypasses the UI caps fails loudly with a named limit instead of
 *    413ing opaquely at the parser wall. QuantDrive picks are references, not
 *    bytes, and are excluded from the budget.
 *
 * These tests mount the REAL emailsRoutes plugin on a bare Fastify instance
 * and inject oversized JSON payloads. A payload the parser accepts reaches
 * the handler (schema-valid → 401 auth-required on the bare app); a payload
 * over the route limit is rejected during parsing → 413. Asserting "not 413"
 * proves the body was parsed.
 */
import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import emailsRoutes from '../routes/emails';
import {
  composeAttachmentByteSize,
  assertComposeAttachmentSizes,
  COMPOSE_MAX_ATTACHMENT_BYTES,
  COMPOSE_MAX_ATTACHMENTS_TOTAL_BYTES,
} from '../lib/outbound-attachments';

const MIB = 1024 * 1024;

function bigComposePayload(bytes: number) {
  return {
    subject: 'big attachment test',
    to: ['someone@example.com'],
    bodyText: 'x',
    attachments: [
      {
        filename: 'big.bin',
        contentType: 'application/octet-stream',
        // base64-ish payload; size is what matters for the body parser.
        // Real composer entries carry the data URL under `url`.
        url: 'data:application/octet-stream;base64,' + 'A'.repeat(bytes),
      },
    ],
  };
}

/** Realistic composer payload: the client always posts the File's raw size. */
function sizedComposePayload(sizes: number[]) {
  return {
    subject: 'sized attachment test',
    to: ['someone@example.com'],
    bodyText: 'x',
    attachments: sizes.map((size, i) => ({
      id: `att-${i}`,
      filename: `file-${i}.bin`,
      size,
      mimeType: 'application/octet-stream',
      // Stubbed small: the guard reads the declared size, like the real client.
      url: 'data:application/octet-stream;base64,AAAA',
    })),
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app: FastifyInstance = Fastify();
  await app.register(errorHandlerPlugin);
  // No auth hook: unauthenticated requests reach the handler and fail with
  // 401 AFTER the body is parsed — which is exactly the signal we need.
  await app.register(emailsRoutes, { prefix: '/emails' });
  return app;
}

describe('compose/draft routes accept advertised attachment payloads', () => {
  it('POST /emails/compose accepts a 1.5 MiB compose payload (was 413)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/emails/compose',
      payload: bigComposePayload(Math.floor(1.5 * MIB)),
    });
    expect(res.statusCode).not.toBe(413);
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('UNAUTHORIZED');
  });

  it('POST /emails accepts a 1.5 MiB compose payload (was 413)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/emails',
      payload: bigComposePayload(Math.floor(1.5 * MIB)),
    });
    expect(res.statusCode).not.toBe(413);
    expect(res.statusCode).toBe(401);
  });

  it('PUT /emails/:id accepts a 1.5 MiB draft-update payload (was 413)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/emails/draft-123',
      payload: bigComposePayload(Math.floor(1.5 * MIB)),
    });
    expect(res.statusCode).not.toBe(413);
    // Handler: schema parses, then auth fails on the bare app.
    expect([400, 401]).toContain(res.statusCode);
  });

  it('POST /emails/compose accepts the advertised 25 MB total (2 x 12.5 MB files)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/emails/compose',
      payload: sizedComposePayload([Math.floor(12.5 * MIB), Math.floor(12.5 * MIB)]),
    });
    expect(res.statusCode).not.toBe(413);
    expect(res.statusCode).toBe(401);
  });

  it('POST /emails/compose still rejects a 41 MiB payload with an honest 413 (limit is raised, not removed)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/emails/compose',
      payload: bigComposePayload(41 * MIB),
    });
    expect(res.statusCode).toBe(413);
    // The parser wall now speaks honestly instead of INTERNAL_ERROR.
    const body = res.json() as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body.error?.message).toMatch(/too large/i);
  });
});

describe('compose attachment size guard (honest 413 past the advertised limits)', () => {
  it('POST /emails/compose 413s a 21 MB file with ATTACHMENT_TOO_LARGE', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/emails/compose',
      payload: sizedComposePayload([21 * MIB]),
    });
    expect(res.statusCode).toBe(413);
    const body = res.json() as { error?: { code?: string; message?: string; details?: { filename?: string } } };
    expect(body.error?.code).toBe('ATTACHMENT_TOO_LARGE');
    expect(body.error?.message).toContain('file-0.bin');
    expect(body.error?.message).toMatch(/20 MB/);
    expect(body.error?.details?.filename).toBe('file-0.bin');
  });

  it('POST /emails 413s a 15 MB + 15 MB pair with ATTACHMENTS_TOTAL_TOO_LARGE', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/emails',
      payload: sizedComposePayload([15 * MIB, 15 * MIB]),
    });
    expect(res.statusCode).toBe(413);
    const body = res.json() as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('ATTACHMENTS_TOTAL_TOO_LARGE');
    expect(body.error?.message).toMatch(/25 MB/);
  });

  it('PUT /emails/:id 413s an oversize attachment on the autosave path too', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/emails/draft-123',
      payload: sizedComposePayload([21 * MIB]),
    });
    expect(res.statusCode).toBe(413);
    const body = res.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('ATTACHMENT_TOO_LARGE');
  });

  it('accepts exactly 20 MB per file and exactly 25 MB total (boundary)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/emails/compose',
      payload: sizedComposePayload([20 * MIB, 5 * MIB]),
    });
    // Guard passes (limits are exclusive, mirroring the client caps);
    // the bare app then fails closed on auth, proving the body parsed.
    expect(res.statusCode).toBe(401);
  });

  it('does not count QuantDrive picks against the payload budget', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/emails/compose',
      payload: {
        subject: 'drive pick test',
        to: ['someone@example.com'],
        bodyText: 'x',
        attachments: [
          {
            id: 'drive_abc123_1729000000000',
            filename: 'huge-video.mp4',
            // A 100 MB Drive file: referenced, not embedded — zero payload bytes.
            size: 100 * MIB,
            mimeType: 'video/mp4',
            url: '/api/drive/files/abc123/download',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('falls back to the data-URL size estimate when the client omits size', async () => {
    const app = await buildApp();
    // 28 MiB of base64 ~= 21 MiB raw — over the per-file limit by estimate.
    const res = await app.inject({
      method: 'POST',
      url: '/emails/compose',
      payload: bigComposePayload(28 * MIB),
    });
    expect(res.statusCode).toBe(413);
    const body = res.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('ATTACHMENT_TOO_LARGE');
  });
});

describe('composeAttachmentByteSize', () => {
  it('prefers the declared numeric size', () => {
    expect(
      composeAttachmentByteSize({ filename: 'a.bin', size: 12345, url: 'data:x;base64,AAAA' }),
    ).toBe(12345);
  });

  it('estimates raw bytes from a base64 data URL when size is absent', () => {
    // 400 base64 chars -> 300 raw bytes.
    expect(
      composeAttachmentByteSize({ filename: 'a.bin', url: 'data:x;base64,' + 'A'.repeat(400) }),
    ).toBe(300);
  });

  it('excludes QuantDrive references (URL and id forms)', () => {
    expect(
      composeAttachmentByteSize({
        id: 'drive_abc123_1729000000000',
        size: 100 * MIB,
        url: '/api/drive/files/abc123/download',
      }),
    ).toBe(0);
    expect(composeAttachmentByteSize({ id: 'drive_xyz_1', size: 50 * MIB })).toBe(0);
  });

  it('returns 0 for non-objects and entries without usable size info', () => {
    expect(composeAttachmentByteSize(null)).toBe(0);
    expect(composeAttachmentByteSize('nope')).toBe(0);
    expect(composeAttachmentByteSize({ filename: 'a.bin' })).toBe(0);
  });

  it('assertComposeAttachmentSizes is a no-op for empty/missing attachment lists', () => {
    expect(() => assertComposeAttachmentSizes(undefined)).not.toThrow();
    expect(() => assertComposeAttachmentSizes([])).not.toThrow();
    expect(() => assertComposeAttachmentSizes('junk')).not.toThrow();
  });

  it('assertComposeAttachmentSizes throws the typed 413s', () => {
    try {
      assertComposeAttachmentSizes([{ filename: 'big.bin', size: 21 * MIB }]);
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as { statusCode?: number; code?: string; message?: string };
      expect(e.statusCode).toBe(413);
      expect(e.code).toBe('ATTACHMENT_TOO_LARGE');
      expect(e.message).toContain('big.bin');
    }
    try {
      assertComposeAttachmentSizes([
        { filename: 'a.bin', size: 20 * MIB },
        { filename: 'b.bin', size: 6 * MIB },
      ]);
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as { statusCode?: number; code?: string };
      expect(e.statusCode).toBe(413);
      expect(e.code).toBe('ATTACHMENTS_TOTAL_TOO_LARGE');
    }
  });

  it('exports the advertised limits for tests and docs', () => {
    expect(COMPOSE_MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024);
    expect(COMPOSE_MAX_ATTACHMENTS_TOTAL_BYTES).toBe(25 * 1024 * 1024);
  });
});
