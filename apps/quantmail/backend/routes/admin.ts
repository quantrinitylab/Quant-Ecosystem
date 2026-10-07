import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  DnsPollerService,
  calculateVerificationStage,
  type DnsCheckResults,
  type DnsResolver,
} from '../services/dns-poller.service';
import { AuditService } from '../services/audit.service';
import { appendServerAuditRecord, getServerAuditLogStore } from './audit-logs';

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

  // ==========================================================================
  // K9 — M19 Admin Domains + M20 Admin DLP/Audit (Phase 2, QuantMail reference)
  // ==========================================================================
  //
  // Staff-gated, fail-closed admin mutations for mail-domain operations and the
  // read-only DLP/audit surfaces. Mirrors the authorization contract above:
  // global `requireAuth()` runs first (401 upstream); `requireStaff()` adds the
  // role decision. Every mutation writes a server-side audit record — client
  // code can never write audit entries (see `routes/audit-logs.ts`).
  // ==========================================================================

  // ── Organization scope (fail closed) ──────────────────────────────────────
  // Per `docs/quant-architecture/products/quantmail/backend/admin-domain.md`:
  // "Admin APIs fail closed when organization or scope is ambiguous." The JWT
  // carries no org claim, so the caller must name the organization explicitly
  // (body, query, or `x-organization-id` header). Absent → 400, never a guess.
  function resolveOrganizationId(request: FastifyRequest, bodyOrgId?: unknown): string {
    const query = request.query as { organizationId?: string; orgId?: string } | undefined;
    const header = request.headers['x-organization-id'];
    const headerOrg = Array.isArray(header) ? header[0] : header;
    const raw =
      (typeof bodyOrgId === 'string' && bodyOrgId.trim()) ||
      query?.organizationId?.trim() ||
      query?.orgId?.trim() ||
      headerOrg?.trim() ||
      '';
    if (!raw) {
      throw createAppError(
        'Organization scope is required for this admin operation',
        400,
        'ORGANIZATION_SCOPE_REQUIRED',
      );
    }
    return raw;
  }

  // ── Server-side audit writer ───────────────────────────────────────────────
  // Writes through `prisma.auditLog` when the database is reachable; otherwise
  // appends to the module's in-memory store (the same fallback `AuditService`
  // reads). Never throws: an audit-logging failure must not fail the mutation.
  async function recordAdminAudit(
    fastify: FastifyInstance,
    request: FastifyRequest,
    entry: {
      orgId: string | null;
      action: string;
      resource: string;
      resourceId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const auth = (request as unknown as { auth?: { userId?: string; role?: string } }).auth;
    const base = {
      userId: auth?.userId ?? 'unknown',
      orgId: entry.orgId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      metadata: { ...(entry.metadata ?? {}), actorRole: auth?.role ?? null },
      ip: request.ip ?? null,
      userAgent: (request.headers['user-agent'] as string) ?? null,
    };
    const prisma = getPrisma(fastify);
    if (prisma?.auditLog?.create) {
      try {
        const now = new Date();
        await prisma.auditLog.create({
          data: { ...base, metadata: base.metadata as never, timestamp: now, createdAt: now },
        });
        return;
      } catch {
        // Fall through to the memory store below.
      }
    }
    appendServerAuditRecord(base);
  }

  // ── DNS verification (live, injectable for tests) ──────────────────────────
  // Reuses the standalone check methods of `DnsPollerService` (ownership TXT,
  // MX, SPF, DKIM, DMARC). A fresh instance is created per call — the poller
  // is never started here, so no background timers leak into the server.

  const DNS_VERIFY_TIMEOUT_MS = 15_000;

  async function runDnsChecks(
    domain: string,
    verificationToken: string,
  ): Promise<DnsCheckResults> {
    const svc = getDnsService();
    const checks = withTimeout(
      Promise.all([
        svc.checkOwnershipTxt(domain, verificationToken),
        svc.checkMx(domain),
        svc.checkSpf(domain),
        svc.checkDkim(domain),
        svc.checkDmarc(domain),
      ]).then(([ownershipTxt, mx, spf, dkim, dmarc]) => ({
        ownershipTxt,
        mx,
        spf,
        dkim,
        dmarc,
      })),
      DNS_VERIFY_TIMEOUT_MS,
    );
    return checks;
  }

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(createAppError('DNS verification timed out', 504, 'DNS_VERIFICATION_TIMEOUT'));
      }, ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  // Prisma `DomainVerificationStatus` enum → cumulative checklist position.
  // The service's `VerificationStage` maps: TXT_VERIFIED → DNS_VERIFIED,
  // FAILED/PENDING → PENDING (still unverified, no FAILED state persisted).
  const DB_STAGE_FROM_SERVICE: Record<string, string> = {
    PENDING: 'PENDING',
    TXT_VERIFIED: 'DNS_VERIFIED',
    MX_VERIFIED: 'MX_VERIFIED',
    SPF_VERIFIED: 'SPF_VERIFIED',
    DKIM_VERIFIED: 'DKIM_VERIFIED',
    DMARC_VERIFIED: 'DMARC_VERIFIED',
    FULLY_VERIFIED: 'FULLY_VERIFIED',
    FAILED: 'PENDING',
  };

  const STAGE_RANK: Record<string, number> = {
    PENDING: 0,
    DNS_VERIFIED: 1,
    MX_VERIFIED: 2,
    SPF_VERIFIED: 3,
    DKIM_VERIFIED: 4,
    DMARC_VERIFIED: 5,
    FULLY_VERIFIED: 6,
  };

  const DNS_CHECK_DEFS = [
    { key: 'ownership', label: 'Ownership (TXT)' },
    { key: 'mx', label: 'MX' },
    { key: 'spf', label: 'SPF' },
    { key: 'dkim', label: 'DKIM' },
    { key: 'dmarc', label: 'DMARC' },
  ] as const;

  // The stored stage is cumulative (SPF_VERIFIED implies TXT+MX+SPF all passed),
  // so the checklist is derived honestly from the rank — never invented.
  function buildDnsChecklist(verificationStatus: string): Array<{
    key: string;
    label: string;
    status: 'verified' | 'pending';
  }> {
    const rank = STAGE_RANK[verificationStatus] ?? 0;
    return DNS_CHECK_DEFS.map((def, index) => ({
      key: def.key,
      label: def.label,
      status: rank >= index + 1 ? ('verified' as const) : ('pending' as const),
    }));
  }

  const isoOrNull = (value: unknown): string | null =>
    value ? new Date(value as string | number | Date).toISOString() : null;

  function serializeMailDomain(row: any) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      domain: row.domain,
      verificationStatus: row.verificationStatus,
      isPrimary: row.isPrimary,
      verifiedAt: isoOrNull(row.verifiedAt),
      createdAt: isoOrNull(row.createdAt),
      dnsChecklist: buildDnsChecklist(String(row.verificationStatus)),
    };
  }

  const DOMAIN_NAME_PATTERN =
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

  function normalizeDomainName(raw: string): string {
    const cleaned = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!DOMAIN_NAME_PATTERN.test(cleaned)) {
      throw createAppError('Invalid domain format', 400, 'INVALID_DOMAIN');
    }
    return cleaned;
  }

  // GET /admin/organizations — staff-gated org picker backing the M19/M20
  // screens. Real rows only; empty array when no organizations exist.
  fastify.get('/organizations', async (request, reply) => {
    requireStaff(request);
    const orgs = await getPrisma(fastify).organization.findMany({
      select: { id: true, name: true, slug: true, plan: true },
      orderBy: { name: 'asc' },
    });
    return reply.send({ success: true, data: { organizations: orgs ?? [] } });
  });

  // GET /admin/mail/domains — list accepted mail domains for one organization.
  fastify.get('/mail/domains', async (request, reply) => {
    requireStaff(request);
    const orgId = resolveOrganizationId(request);
    const domains = await getPrisma(fastify).organizationDomain.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    });
    return reply.send({
      success: true,
      data: { organizationId: orgId, domains: (domains ?? []).map(serializeMailDomain) },
    });
  });

  // POST /admin/mail/domains — register a domain for an organization.
  // Returns DNS setup instructions (including the TXT verification token) so
  // the admin can configure DNS before running verification.
  const registerMailDomainSchema = z.object({
    domain: z.string().trim().min(3).max(253),
    organizationId: z.string().trim().min(1).optional(),
  });

  fastify.post('/mail/domains', async (request, reply) => {
    requireStaff(request);
    const parsed = registerMailDomainSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid domain payload',
        400,
        'VALIDATION_ERROR',
      );
    }
    const orgId = resolveOrganizationId(request, parsed.data.organizationId);
    const domain = normalizeDomainName(parsed.data.domain);
    const prisma = getPrisma(fastify);

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw createAppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    const existing = await prisma.organizationDomain.findUnique({ where: { domain } });
    if (existing) {
      if (existing.organizationId !== orgId) {
        throw createAppError(
          'Domain already registered by another organization',
          409,
          'DOMAIN_CONFLICT',
        );
      }
      return reply.send({
        success: true,
        data: { domain: serializeMailDomain(existing), alreadyRegistered: true },
      });
    }

    const created = await prisma.organizationDomain.create({
      data: { organizationId: orgId, domain, verificationToken: randomUUID() },
    });

    await recordAdminAudit(fastify, request, {
      orgId,
      action: 'admin.mail.domain.register',
      resource: 'mail_domain',
      resourceId: created.id,
      metadata: { domain },
    });

    return reply.status(201).send({
      success: true,
      data: {
        domain: serializeMailDomain(created),
        alreadyRegistered: false,
        verificationToken: created.verificationToken,
        instructions: getDnsService().getInstructions(domain, created.verificationToken),
      },
    });
  });

  // POST /admin/mail/domains/:id/verify — run LIVE DNS checks against the
  // domain (ownership TXT, MX, SPF, DKIM, DMARC) and persist the resulting
  // verification stage. Fails closed on DNS timeout.
  const verifyMailDomainSchema = z.object({
    organizationId: z.string().trim().min(1).optional(),
  });

  fastify.post<{ Params: { id: string } }>('/mail/domains/:id/verify', async (request, reply) => {
    requireStaff(request);
    const parsed = verifyMailDomainSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid verify payload',
        400,
        'VALIDATION_ERROR',
      );
    }
    const orgId = resolveOrganizationId(request, parsed.data.organizationId);
    const prisma = getPrisma(fastify);

    const record = await prisma.organizationDomain.findUnique({
      where: { id: request.params.id },
    });
    if (!record) {
      throw createAppError('Domain not found', 404, 'DOMAIN_NOT_FOUND');
    }
    if (record.organizationId !== orgId) {
      throw createAppError(
        'Domain belongs to another organization',
        403,
        'ORGANIZATION_SCOPE_MISMATCH',
      );
    }

    const checks = await runDnsChecks(record.domain, record.verificationToken);
    const dbStage = DB_STAGE_FROM_SERVICE[calculateVerificationStage(checks)] ?? 'PENDING';

    const updated = await prisma.organizationDomain.update({
      where: { id: record.id },
      data: {
        verificationStatus: dbStage,
        ...(dbStage === 'FULLY_VERIFIED' && !record.verifiedAt
          ? { verifiedAt: new Date() }
          : {}),
      },
    });

    await recordAdminAudit(fastify, request, {
      orgId,
      action: 'admin.mail.domain.verify',
      resource: 'mail_domain',
      resourceId: record.id,
      metadata: {
        domain: record.domain,
        verificationStatus: dbStage,
        checks: {
          ownershipTxt: checks.ownershipTxt.valid,
          mx: checks.mx.valid,
          spf: checks.spf.valid,
          dkim: checks.dkim.valid,
          dmarc: checks.dmarc.valid,
        },
      },
    });

    const checkDetail = [
      { key: 'ownership', label: 'Ownership (TXT)', ...checks.ownershipTxt },
      { key: 'mx', label: 'MX', ...checks.mx },
      { key: 'spf', label: 'SPF', ...checks.spf },
      { key: 'dkim', label: 'DKIM', ...checks.dkim },
      { key: 'dmarc', label: 'DMARC', ...checks.dmarc },
    ];

    return reply.send({
      success: true,
      data: { domain: serializeMailDomain(updated), dnsChecks: checkDetail },
    });
  });

  // DELETE /admin/mail/domains/:id — remove a domain registration.
  // Organization scope travels in the body (DELETE has no query forwarding
  // through the Next proxy) or the `x-organization-id` header.
  const deleteMailDomainSchema = z.object({
    organizationId: z.string().trim().min(1).optional(),
  });

  fastify.delete<{ Params: { id: string } }>('/mail/domains/:id', async (request, reply) => {
    requireStaff(request);
    const parsed = deleteMailDomainSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid delete payload',
        400,
        'VALIDATION_ERROR',
      );
    }
    const orgId = resolveOrganizationId(request, parsed.data.organizationId);
    const prisma = getPrisma(fastify);

    const record = await prisma.organizationDomain.findUnique({
      where: { id: request.params.id },
    });
    if (!record) {
      throw createAppError('Domain not found', 404, 'DOMAIN_NOT_FOUND');
    }
    if (record.organizationId !== orgId) {
      throw createAppError(
        'Domain belongs to another organization',
        403,
        'ORGANIZATION_SCOPE_MISMATCH',
      );
    }

    await prisma.organizationDomain.delete({ where: { id: record.id } });

    await recordAdminAudit(fastify, request, {
      orgId,
      action: 'admin.mail.domain.remove',
      resource: 'mail_domain',
      resourceId: record.id,
      metadata: { domain: record.domain },
    });

    return reply.send({ success: true, data: { removed: true, id: record.id } });
  });

  // GET /admin/mail/dlp/policies — M20: list the organization's DLP/compliance
  // mail policies (`EnterpriseMailComplianceRule`). Read-only; real rows only.
  fastify.get('/mail/dlp/policies', async (request, reply) => {
    requireStaff(request);
    const orgId = resolveOrganizationId(request);
    const policies = await getPrisma(fastify).enterpriseMailComplianceRule.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    });
    return reply.send({
      success: true,
      data: {
        organizationId: orgId,
        policies: (policies ?? []).map((policy: any) => ({
          id: policy.id,
          name: policy.name,
          description: policy.description ?? null,
          ruleType: policy.ruleType,
          action: policy.action,
          severity: policy.severity,
          enabled: policy.enabled,
          createdAt: isoOrNull(policy.createdAt),
          updatedAt: isoOrNull(policy.updatedAt),
        })),
      },
    });
  });

  // GET /admin/audit/logs — M20: staff-gated, read-only audit log viewer.
  // Unlike `/audit-logs` (tenant-scoped, ADMIN/AUDITOR/OWNER), staff see across
  // organizations; pass `organizationId`/`orgId` to scope to one tenant.
  const adminAuditQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().optional(),
    organizationId: z.string().optional(),
    orgId: z.string().optional(),
    userId: z.string().optional(),
    action: z.string().optional(),
    resource: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  });

  fastify.get('/audit/logs', async (request, reply) => {
    requireStaff(request);
    const parsed = adminAuditQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid query parameters',
        400,
        'VALIDATION_ERROR',
      );
    }
    const orgId = parsed.data.organizationId ?? parsed.data.orgId ?? undefined;
    const service = new AuditService(getPrisma(fastify));
    const result = await service.queryLogs({ ...parsed.data, orgId }, getServerAuditLogStore());
    return reply.send({
      success: true,
      data: result.items,
      nextCursor: result.nextCursor,
      pagination: result.pagination,
    });
  });
}

// ── K9 test hook (module scope) ───────────────────────────────────────────────
// Inject a `DnsPollerService` with a stubbed DNS resolver so verification tests
// run deterministically without touching the network. Production code never
// calls this — the default service uses `node:dns`.
let adminDnsService: DnsPollerService | null = null;

function getDnsService(): DnsPollerService {
  return adminDnsService ?? new DnsPollerService();
}

export function __setAdminDnsService(service: DnsPollerService | null): void {
  adminDnsService = service;
}

// Re-export the resolver type for test files building stub resolvers.
export type { DnsResolver };
