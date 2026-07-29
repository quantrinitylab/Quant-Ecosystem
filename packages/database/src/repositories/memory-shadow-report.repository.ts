import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export interface MemoryShadowReportRow {
  id: string;
  tenantId: string;
  orgId: string | null;
  actorUserId: string;
  requestId: string;
  mode: string;
  query: string;
  legacy: unknown;
  next: unknown;
  divergence: unknown;
  severity: string;
  agreementRate: number;
  infrastructureError: boolean;
  commitSha: string;
  policyVersion: string;
  corpusVersion: string;
  observedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export type CreateMemoryShadowReportInput = Omit<
  MemoryShadowReportRow,
  'id' | 'createdAt' | 'legacy' | 'next' | 'divergence'
> & {
  legacy: Prisma.InputJsonValue;
  next: Prisma.InputJsonValue;
  divergence: Prisma.InputJsonValue;
};

export interface MemoryShadowReportDelegate {
  create(args: { data: CreateMemoryShadowReportInput }): Promise<MemoryShadowReportRow>;
  findFirst(args: {
    where: { tenantId: string; requestId: string };
  }): Promise<MemoryShadowReportRow | null>;
  findMany(args: {
    where: { tenantId: string; actorUserId?: string; severity?: string };
    orderBy: { observedAt: 'desc' };
    take: number;
  }): Promise<MemoryShadowReportRow[]>;
  count(args: { where: { tenantId: string } }): Promise<number>;
  deleteMany(args: {
    where: { tenantId: string; expiresAt: { lte: Date } };
  }): Promise<{ count: number }>;
}

export interface MemoryShadowReportSqlClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export interface MemoryShadowReportPrismaClient {
  memoryShadowReport?: MemoryShadowReportDelegate;
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe?(query: string, ...values: unknown[]): Promise<number>;
}

export interface ListMemoryShadowReportsOptions {
  actorUserId?: string;
  severity?: string;
  limit?: number;
}

type CountRow = { count: number | bigint | string };

function hasDelegate(
  prisma: MemoryShadowReportPrismaClient,
): prisma is MemoryShadowReportPrismaClient & { memoryShadowReport: MemoryShadowReportDelegate } {
  return prisma.memoryShadowReport !== undefined;
}

function getRawClient(prisma: MemoryShadowReportPrismaClient): MemoryShadowReportSqlClient {
  if (!prisma.$queryRawUnsafe || !prisma.$executeRawUnsafe) {
    throw new Error('MemoryShadowReportRepository requires either a delegate or raw Prisma methods');
  }
  return prisma as MemoryShadowReportSqlClient;
}

function normalizeCount(value: number | bigint | string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  if (Number.isNaN(parsed)) throw new Error('Invalid count value');
  return parsed;
}

/**
 * Tenant-scoped access to append-only shadow evidence. There is deliberately no
 * unscoped list/find/delete API: callers must always provide the authz boundary.
 */
export class MemoryShadowReportRepository {
  constructor(private readonly prisma: MemoryShadowReportPrismaClient) {}

  async create(input: CreateMemoryShadowReportInput): Promise<MemoryShadowReportRow> {
    if (!input.tenantId) throw new Error('MemoryShadowReport tenantId is required');
    if (!input.actorUserId) throw new Error('MemoryShadowReport actorUserId is required');
    if (hasDelegate(this.prisma)) {
      return this.prisma.memoryShadowReport.create({ data: input });
    }

    const rowId = randomUUID();
    const rows = await getRawClient(this.prisma).$queryRawUnsafe<MemoryShadowReportRow[]>(
      `INSERT INTO "memory_shadow_reports" (
        "id",
        "tenantId",
        "orgId",
        "actorUserId",
        "requestId",
        "mode",
        "query",
        "legacy",
        "next",
        "divergence",
        "severity",
        "agreementRate",
        "infrastructureError",
        "commitSha",
        "policyVersion",
        "corpusVersion",
        "observedAt",
        "expiresAt"
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        $9::jsonb,
        $10::jsonb,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18
      ) RETURNING
        "id",
        "tenantId",
        "orgId",
        "actorUserId",
        "requestId",
        "mode",
        "query",
        "legacy",
        "next",
        "divergence",
        "severity",
        "agreementRate",
        "infrastructureError",
        "commitSha",
        "policyVersion",
        "corpusVersion",
        "observedAt",
        "expiresAt",
        "createdAt"`,
      rowId,
      input.tenantId,
      input.orgId,
      input.actorUserId,
      input.requestId,
      input.mode,
      input.query,
      JSON.stringify(input.legacy),
      JSON.stringify(input.next),
      JSON.stringify(input.divergence),
      input.severity,
      input.agreementRate,
      input.infrastructureError,
      input.commitSha,
      input.policyVersion,
      input.corpusVersion,
      input.observedAt,
      input.expiresAt,
    );
    const [row] = rows;
    if (!row) throw new Error('MemoryShadowReport insert returned no row');
    return row;
  }

  async findByRequest(tenantId: string, requestId: string): Promise<MemoryShadowReportRow | null> {
    this.assertTenant(tenantId);
    if (hasDelegate(this.prisma)) {
      return this.prisma.memoryShadowReport.findFirst({ where: { tenantId, requestId } });
    }

    const rows = await getRawClient(this.prisma).$queryRawUnsafe<MemoryShadowReportRow[]>(
      `SELECT
        "id",
        "tenantId",
        "orgId",
        "actorUserId",
        "requestId",
        "mode",
        "query",
        "legacy",
        "next",
        "divergence",
        "severity",
        "agreementRate",
        "infrastructureError",
        "commitSha",
        "policyVersion",
        "corpusVersion",
        "observedAt",
        "expiresAt",
        "createdAt"
      FROM "memory_shadow_reports"
      WHERE "tenantId" = $1 AND "requestId" = $2
      LIMIT 1`,
      tenantId,
      requestId,
    );
    return rows[0] ?? null;
  }

  async listForTenant(
    tenantId: string,
    options: ListMemoryShadowReportsOptions = {},
  ): Promise<MemoryShadowReportRow[]> {
    this.assertTenant(tenantId);
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    if (hasDelegate(this.prisma)) {
      return this.prisma.memoryShadowReport.findMany({
        where: {
          tenantId,
          ...(options.actorUserId ? { actorUserId: options.actorUserId } : {}),
          ...(options.severity ? { severity: options.severity } : {}),
        },
        orderBy: { observedAt: 'desc' },
        take: limit,
      });
    }

    const values: unknown[] = [tenantId];
    const clauses = ['"tenantId" = $1'];
    let position = 2;

    if (options.actorUserId) {
      clauses.push(`"actorUserId" = $${position}`);
      values.push(options.actorUserId);
      position += 1;
    }
    if (options.severity) {
      clauses.push(`"severity" = $${position}`);
      values.push(options.severity);
      position += 1;
    }

    values.push(limit);

    return getRawClient(this.prisma).$queryRawUnsafe<MemoryShadowReportRow[]>(
      `SELECT
        "id",
        "tenantId",
        "orgId",
        "actorUserId",
        "requestId",
        "mode",
        "query",
        "legacy",
        "next",
        "divergence",
        "severity",
        "agreementRate",
        "infrastructureError",
        "commitSha",
        "policyVersion",
        "corpusVersion",
        "observedAt",
        "expiresAt",
        "createdAt"
      FROM "memory_shadow_reports"
      WHERE ${clauses.join(' AND ')}
      ORDER BY "observedAt" DESC
      LIMIT $${position}`,
      ...values,
    );
  }

  async countForTenant(tenantId: string): Promise<number> {
    this.assertTenant(tenantId);
    if (hasDelegate(this.prisma)) {
      return this.prisma.memoryShadowReport.count({ where: { tenantId } });
    }

    const rows = await getRawClient(this.prisma).$queryRawUnsafe<CountRow[]>((
      'SELECT COUNT(*) AS count FROM "memory_shadow_reports" WHERE "tenantId" = $1'
    ), tenantId);
    return normalizeCount(rows[0]?.count ?? 0);
  }

  async deleteExpiredForTenant(tenantId: string, now = new Date()): Promise<number> {
    this.assertTenant(tenantId);
    if (hasDelegate(this.prisma)) {
      const result = await this.prisma.memoryShadowReport.deleteMany({
        where: { tenantId, expiresAt: { lte: now } },
      });
      return result.count;
    }

    return getRawClient(this.prisma).$executeRawUnsafe(
      'DELETE FROM "memory_shadow_reports" WHERE "tenantId" = $1 AND "expiresAt" <= $2',
      tenantId,
      now,
    );
  }

  private assertTenant(tenantId: string): void {
    if (!tenantId) throw new Error('tenantId is required');
  }
}
