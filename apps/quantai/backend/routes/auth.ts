import type { FastifyInstance } from 'fastify';

/**
 * Identity routes for the QuantAI backend.
 *
 * GET /auth/me — returns the caller identity as verified by the global
 * requireAuth onRequest hook (packages/server-core). The hook already
 * rejected missing/invalid tokens with 401 before this handler runs, so
 * request.auth is guaranteed present here.
 *
 * This endpoint exists because the QuantAI frontend never issues tokens —
 * the ecosystem identity root (QuantMail backend) does. SSO handoff tickets
 * are verified by calling this endpoint with the candidate token
 * (see UniversalSSOTokenBridge.consumeHandoffTicket -> /api/auth/userinfo).
 * Without it, every SSO round-trip silently failed closed and the user was
 * left on /login with no session.
 */
export default async function authRoutes(fastify: FastifyInstance) {
  fastify.get('/me', async (request, reply) => {
    // NOTE: cast via `unknown` — FastifyRequest's generics don't sufficiently
    // overlap with the structural auth shape for a direct assertion (TS2352).
    const auth = (request as unknown as { auth?: Record<string, unknown> }).auth ?? {};
    return reply.send({
      success: true,
      data: {
        id: auth['userId'] ?? '',
        sub: auth['userId'] ?? '',
        email: auth['email'] ?? '',
        username: auth['username'] ?? '',
        displayName: auth['username'] ?? '',
        role: auth['role'] ?? '',
      },
    });
  });
}
