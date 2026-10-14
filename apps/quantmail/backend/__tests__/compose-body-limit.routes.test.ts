/**
 * Compose/draft body-limit regression tests (P1: attachments 413).
 *
 * Both composers (DockedComposer, EmailComposer) advertise 20 MB per file /
 * 25 MB total and read files as base64 data URLs (~4/3 inflation) POSTed
 * inside the compose JSON. The Fastify default bodyLimit is 1 MiB, so any
 * attachment pushing the compose JSON past ~1 MB returned 413 Payload Too
 * Large on BOTH the 10s autosave (PUT /emails/:id) and the send
 * (POST /emails, POST /emails/compose).
 *
 * The fix raises a per-route bodyLimit of 40 MB on the three compose/draft
 * routes — enough for the advertised totals under base64 inflation, still
 * under the ingress 50m ceiling and the SESv2 40 MB raw-message cap.
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
        // base64-ish payload; size is what matters for the body parser
        dataUrl: 'data:application/octet-stream;base64,' + 'A'.repeat(bytes),
      },
    ],
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

  it('POST /emails/compose accepts a 35 MiB payload (~25 MB advertised total under base64 inflation)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/emails/compose',
      payload: bigComposePayload(35 * MIB),
    });
    expect(res.statusCode).not.toBe(413);
    expect(res.statusCode).toBe(401);
  });

  it('POST /emails/compose still rejects a 41 MiB payload with 413 (limit is raised, not removed)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/emails/compose',
      payload: bigComposePayload(41 * MIB),
    });
    expect(res.statusCode).toBe(413);
  });
});
