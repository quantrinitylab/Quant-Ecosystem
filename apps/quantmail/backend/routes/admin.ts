import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createAppError } from '@quant/server-core';

/**
 * QuantMail per-app Admin API (restructure Phase 1 pilot backend).
 *
 * Backs the KPI cards in `src/app/admin/page.tsx`. Read-only, staff-gated
 * operational metrics sourced from live Prisma models — no mutations live here.
 *
 * AUTHORIZATION — defence in depth, two layers:
 *  1. server-core's global `onRequest` hook already runs `requireAuth()` on every
 *     non-public path, and `/admin` is NOT in QuantMail's publicPaths, so an
 *     unauthenticated request never reaches these handlers (401 upstream).
 *  2. `requireStaff()` below adds the ROLE decision, mirroring the client
 *     `AdminGuard` (ADMIN + MODERATOR). It still checks `userId` itself so the
 *     module fails closed even when mounted in isolation (a unit test, or a
 *     future host that forgets the global hook).
 *
 * Role source: `request.auth.role` (JWT `role` claim). Kept as a Set so widening
 * staff access later is a one-line change — same contract as the frontend guard.
 */
const STAFF_ROLES = new Set(['ADMIN', 'MODERATOR']);

// 24h rolling windows for the "live" activity KPIs. Named so each response can
// echo its window back to the dashboard instead of hard-coding "24h" in the UI.
const ACTIVE_SESSION_WINDOW_HOURS = 24;
const DELIVERABILITY_WINDOW_HOURS = 24;

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma?: unknown }).prisma;
}

function requireStaff(request: FastifyRequest): { userId: string; role: string } {
  const auth = (request as unknown as { auth?: { userId?: string; role?: string } }).auth;
  if (!auth?.userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  const role = (auth.role ?? '').toUpperCase();
  if (!STAFF_ROLES.has(role)) {
    throw createAppError('Admin (staff) access required', 403, 'FORBIDDEN');
  }
  return { userId: auth.userId, role };
}

export default async function adminRoutes(fastify: FastifyInstance) {
  // GET /admin/accounts/count — total registered accounts (soft-deleted excluded).
  fastify.get('/accounts/count', async (request, reply) => {
    requireStaff(request);
    // `deletedAt` is the User soft-delete tombstone (schema.prisma). A bare
    // count() would inflate the KPI with erased accounts, so filter to live rows.
    const total = await getPrisma(fastify).user.count({ where: { deletedAt: null } });
    return reply.send({ success: true, data: { total } });
  });

  // GET /admin/sessions/active — sessions active in the last 24h and not expired.
  fastify.get('/sessions/active', async (request, reply) => {
    requireStaff(request);
    const now = new Date();
    const since = new Date(now.getTime() - ACTIVE_SESSION_WINDOW_HOURS * 3_600_000);
    const active = await getPrisma(fastify).session.count({
      where: {
        isActive: true,
        expiresAt: { gt: now },
        lastActivityAt: { gte: since },
      },
    });
    return reply.send({
      success: true,
      data: { active, windowHours: ACTIVE_SESSION_WINDOW_HOURS },
    });
  });

  // GET /admin/storage/summary — bytes used + live file count across Drive.
  fastify.get('/storage/summary', async (request, reply) => {
    requireStaff(request);
    const prisma = getPrisma(fastify);
    const [agg, fileCount] = await Promise.all([
      prisma.file.aggregate({ _sum: { size: true }, where: { isDeleted: false } }),
      prisma.file.count({ where: { isDeleted: false } }),
    ]);
    const usedBytes = Number(agg?._sum?.size ?? 0);
    return reply.send({ success: true, data: { usedBytes, fileCount } });
  });

  // GET /admin/mail/deliverability — per-status attempt counts + success rate (24h).
  fastify.get('/mail/deliverability', async (request, reply) => {
    requireStaff(request);
    const since = new Date(Date.now() - DELIVERABILITY_WINDOW_HOURS * 3_600_000);
    const grouped = await getPrisma(fastify).deliveryAttempt.groupBy({
      by: ['status'],
      where: { attemptedAt: { gte: since } },
      _count: true,
    });

    const counts = { queued: 0, sent: 0, deferred: 0, bounced: 0 };
    for (const row of grouped ?? []) {
      const status = row.status as keyof typeof counts;
      if (status in counts) {
        counts[status] = typeof row._count === 'number' ? row._count : (row._count?._all ?? 0);
      }
    }
    const total = counts.queued + counts.sent + counts.deferred + counts.bounced;
    // Rate over *resolved* attempts only (sent vs bounced): queued/deferred are
    // still in-flight, so counting them as failures would understate deliverability.
    const resolved = counts.sent + counts.bounced;
    const successRate = resolved > 0 ? counts.sent / resolved : null;

    return reply.send({
      success: true,
      data: { windowHours: DELIVERABILITY_WINDOW_HOURS, total, ...counts, successRate },
    });
  });
}
