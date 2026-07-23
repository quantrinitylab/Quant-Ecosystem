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

export interface MemoryShadowReportWhere {
  tenantId: string;
  actorUserId?: string;
  severity?: string;
  commitSha?: string;
  policyVersion?: string;
  corpusVersion?: string;
  observedAt?: { gte?: Date; lte?: Date };
}

export interface MemoryShadowReportDelegate {
  create(args: { data: CreateMemoryShadowReportInput }): Promise<MemoryShadowReportRow>;
  findFirst(args: {
    where: { tenantId: string; requestId: string };
  }): Promise<MemoryShadowReportRow | null>;
  findMany(args: {
    where: MemoryShadowReportWhere;
    orderBy: { observedAt: 'desc' };
    take: number;
  }): Promise<MemoryShadowReportRow[]>;
  count(args: { where: MemoryShadowReportWhere }): Promise<number>;
  deleteMany(args: {
    where: { tenantId: string; expiresAt: { lte: Date } };
  }): Promise<{ count: number }>;
}

export interface MemoryShadowReportPrismaClient {
  memoryShadowReport: MemoryShadowReportDelegate;
}

export interface ListMemoryShadowReportsOptions {
  actorUserId?: string;
  severity?: string;
  commitSha?: string;
  policyVersion?: string;
  corpusVersion?: string;
  observedAfter?: Date;
  observedBefore?: Date;
  limit?: number;
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
    return this.prisma.memoryShadowReport.create({ data: input });
  }

  async findByRequest(tenantId: string, requestId: string): Promise<MemoryShadowReportRow | null> {
    this.assertTenant(tenantId);
    return this.prisma.memoryShadowReport.findFirst({ where: { tenantId, requestId } });
  }

  async listForTenant(
    tenantId: string,
    options: ListMemoryShadowReportsOptions = {},
  ): Promise<MemoryShadowReportRow[]> {
    this.assertTenant(tenantId);
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    return this.prisma.memoryShadowReport.findMany({
      where: this.scopedWhere(tenantId, options),
      orderBy: { observedAt: 'desc' },
      take: limit,
    });
  }

  async countForTenant(
    tenantId: string,
    options: Omit<ListMemoryShadowReportsOptions, 'limit'> = {},
  ): Promise<number> {
    this.assertTenant(tenantId);
    return this.prisma.memoryShadowReport.count({ where: this.scopedWhere(tenantId, options) });
  }

  async deleteExpiredForTenant(tenantId: string, now = new Date()): Promise<number> {
    this.assertTenant(tenantId);
    const result = await this.prisma.memoryShadowReport.deleteMany({
      where: { tenantId, expiresAt: { lte: now } },
    });
    return result.count;
  }

  private scopedWhere(
    tenantId: string,
    options: Omit<ListMemoryShadowReportsOptions, 'limit'>,
  ): MemoryShadowReportWhere {
    return {
      tenantId,
      ...(options.actorUserId ? { actorUserId: options.actorUserId } : {}),
      ...(options.severity ? { severity: options.severity } : {}),
      ...(options.commitSha ? { commitSha: options.commitSha } : {}),
      ...(options.policyVersion ? { policyVersion: options.policyVersion } : {}),
      ...(options.corpusVersion ? { corpusVersion: options.corpusVersion } : {}),
      ...(options.observedAfter || options.observedBefore
        ? {
            observedAt: {
              ...(options.observedAfter ? { gte: options.observedAfter } : {}),
              ...(options.observedBefore ? { lte: options.observedBefore } : {}),
            },
          }
        : {}),
    };
  }

  private assertTenant(tenantId: string): void {
    if (!tenantId) throw new Error('tenantId is required');
  }
}
