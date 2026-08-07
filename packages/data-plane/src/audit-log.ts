import type { PrismaClient } from '@quant/database';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface AuditLogParams {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  diff: { before: Record<string, unknown>; after: Record<string, unknown> };
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogRecord {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  diff: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditLogQueryOptions {
  skip?: number;
  take?: number;
  orderBy?: 'asc' | 'desc';
}

export class AuditLogger {
  async log(tx: TransactionClient, params: AuditLogParams): Promise<AuditLogRecord> {
    const record = await (
      tx as unknown as { auditLog: { create: (args: unknown) => Promise<AuditLogRecord> } }
    ).auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        diff: params.diff,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });

    return record;
  }

  async getForResource(
    client: PrismaClient,
    resourceType: string,
    resourceId: string,
    options?: AuditLogQueryOptions,
  ): Promise<AuditLogRecord[]> {
    const records = await (
      client as unknown as { auditLog: { findMany: (args: unknown) => Promise<AuditLogRecord[]> } }
    ).auditLog.findMany({
      where: { resourceType, resourceId },
      skip: options?.skip,
      take: options?.take,
      orderBy: { createdAt: options?.orderBy ?? 'desc' },
    });

    return records;
  }
}

export function createAuditLogger(): AuditLogger {
  return new AuditLogger();
}
