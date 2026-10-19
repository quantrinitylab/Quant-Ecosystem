// ============================================================================
// QuantMail - Open-tracking beacon (public, unauthenticated)
//
// GET /track/open/:token — the 1x1 image embedded in tracked outbound mail.
// Fetched by the RECIPIENT's mail client, which holds no QuantMail session,
// so this route is intentionally public: app.ts lists it in `publicPaths`
// (GET only, exact-prefix) and the Next proxy allow-lists it in
// backend/lib/routes-config.ts. The token is a 48-hex unguessable id minted
// at send time; it authorizes nothing except counting this one message's
// opens.
//
// Security posture:
//   - Always answers 200 + GIF, even for unknown/malformed tokens: token
//     validity is never leaked to scanners, and mail-client link-checkers
//     see a working image either way.
//   - No auth, no PII in the response, no user lookup: the token maps to one
//     Email row, and only its open counters move.
//   - Cache-Control: no-store — a cached pixel would silently eat opens, and
//     a shared cache would attribute one recipient's open to another's client.
//   - A DB failure must never fail the pixel: the catch swallows and still
//     serves the GIF (a missed count is honest; a broken image is a lie
//     about the message's formatting).
// ============================================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  OPEN_TRACKING_GIF,
  recordOpen,
  type OpenTrackingStore,
} from '../services/open-tracking.service';

function getPrisma(fastify: FastifyInstance): PrismaClient {
  return (fastify as unknown as { prisma: PrismaClient }).prisma;
}

export default async function openTrackingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { token: string } }>(
    '/open/:token',
    async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
      const token = request.params?.token;
      try {
        await recordOpen(
          getPrisma(fastify) as unknown as OpenTrackingStore,
          token,
        );
      } catch (err) {
        // A missed count is honest; a 500 on a tracking pixel is not.
        fastify.log.warn({ err, tokenPresent: Boolean(token) }, '[open-tracking] count failed');
      }
      return reply
        .header('Content-Type', 'image/gif')
        .header('Content-Length', String(OPEN_TRACKING_GIF.length))
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .send(OPEN_TRACKING_GIF);
    },
  );
}
