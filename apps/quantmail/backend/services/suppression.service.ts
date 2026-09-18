import { prisma as defaultPrisma } from '@quant/database';
import { createAppError } from '@quant/server-core';

export type SuppressionReason = 'BOUNCE' | 'COMPLAINT' | 'MANUAL' | 'UNSUBSCRIBE';
export type SuppressionSource = 'SNS' | 'USER' | 'ADMIN';

export interface SuppressionRow {
  id: string;
  email: string;
  reason: string;
  source: string;
  details?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuppressionPrismaClient {
  emailSuppression: {
    findUnique(args: { where: { email: string } }): Promise<SuppressionRow | null>;
    findMany(args: { where?: any; orderBy?: any }): Promise<SuppressionRow[]>;
    create?(args: {
      data: { email: string; reason: string; source: string; details?: any };
    }): Promise<SuppressionRow>;
    upsert(args: {
      where: { email: string };
      create: { email: string; reason: string; source: string; details?: any };
      update: { reason: string; source: string; details?: any };
    }): Promise<SuppressionRow>;
    delete(args: { where: { email: string } }): Promise<SuppressionRow>;
    count?(args?: any): Promise<number>;
  };
}

export class SuppressionService {
  private readonly db: SuppressionPrismaClient;

  constructor(db?: SuppressionPrismaClient) {
    this.db = db ?? (defaultPrisma as unknown as SuppressionPrismaClient);
  }

  /** No optional chaining on the delegate: a missing model must fail loudly (W15-3 / Gate 4). */
  private rows() {
    const delegate = this.db?.emailSuppression;
    if (!delegate || typeof delegate.findUnique !== 'function') {
      throw createAppError(
        'email_suppressions is not available; run prisma migrate + prisma generate',
        503,
        'DATABASE_UNAVAILABLE',
      );
    }
    return delegate;
  }

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async isSuppressed(email: string): Promise<boolean> {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return false;
    const row = await this.rows().findUnique({
      where: { email: normalized },
    });
    return Boolean(row);
  }

  async suppress(
    email: string,
    reason: SuppressionReason | string,
    source: SuppressionSource | string,
    details?: unknown,
  ): Promise<SuppressionRow> {
    const normalized = this.normalizeEmail(email);
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw createAppError('Invalid email address for suppression', 400, 'INVALID_EMAIL');
    }
    return this.rows().upsert({
      where: { email: normalized },
      create: { email: normalized, reason, source, details },
      update: { reason, source, details },
    });
  }

  async unsuppress(email: string): Promise<void> {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return;
    try {
      await this.rows().delete({
        where: { email: normalized },
      });
    } catch {
      // Idempotent: deleting a non-existent suppression record is a no-op
    }
  }

  async filterAllowedRecipients(recipients: string[]): Promise<{
    allowed: string[];
    suppressed: string[];
  }> {
    const normalizedList = Array.from(
      new Set(recipients.map((e) => this.normalizeEmail(e)).filter(Boolean)),
    );
    if (normalizedList.length === 0) {
      return { allowed: [], suppressed: [] };
    }

    const found = await this.rows().findMany({
      where: { email: { in: normalizedList } },
    });
    const suppressedSet = new Set<string>(found.map((r) => r.email.toLowerCase()));

    const allowed = normalizedList.filter((e) => !suppressedSet.has(e));
    const suppressed = normalizedList.filter((e) => suppressedSet.has(e));

    return { allowed, suppressed };
  }

  async list(options?: { reason?: string }): Promise<SuppressionRow[]> {
    const where = options?.reason ? { reason: options.reason } : {};
    return this.rows().findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(options?: { reason?: string }): Promise<number> {
    const delegate = this.rows();
    const where = options?.reason ? { reason: options.reason } : {};
    if (typeof delegate.count === 'function') {
      return delegate.count({ where });
    }
    const all = await delegate.findMany({ where });
    return all.length;
  }
}

export const suppressionService = new SuppressionService();
