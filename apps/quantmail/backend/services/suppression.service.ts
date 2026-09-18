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
  private readonly db?: SuppressionPrismaClient;
  private readonly memoryFallback = new Map<string, SuppressionRow>();

  constructor(db?: SuppressionPrismaClient) {
    if (db) {
      this.db = db;
    } else if (process.env.DATABASE_URL) {
      this.db = defaultPrisma as unknown as SuppressionPrismaClient;
    }
  }

  resetStore(): void {
    this.memoryFallback.clear();
  }

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async isSuppressed(email: string): Promise<boolean> {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return false;
    try {
      if (this.db?.emailSuppression?.findUnique) {
        const row = await this.db.emailSuppression.findUnique({
          where: { email: normalized },
        });
        if (row) return true;
      }
    } catch {
      // Prisma call failed (e.g. in standalone test environment)
    }
    return this.memoryFallback.has(normalized);
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
    let row: SuppressionRow | null = null;
    try {
      if (this.db?.emailSuppression?.upsert) {
        row = await this.db.emailSuppression.upsert({
          where: { email: normalized },
          create: { email: normalized, reason, source, details },
          update: { reason, source, details },
        });
      }
    } catch {
      // Fall through to memory fallback
    }

    if (!row) {
      row = {
        id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        email: normalized,
        reason,
        source,
        details,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    this.memoryFallback.set(normalized, row);
    return row;
  }

  async unsuppress(email: string): Promise<void> {
    const normalized = this.normalizeEmail(email);
    this.memoryFallback.delete(normalized);
    try {
      if (this.db?.emailSuppression?.delete) {
        await this.db.emailSuppression.delete({
          where: { email: normalized },
        });
      }
    } catch {
      // Idempotent: non-existing record deletion is a no-op
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

    const suppressedSet = new Set<string>();
    try {
      if (this.db?.emailSuppression?.findMany) {
        const found = await this.db.emailSuppression.findMany({
          where: { email: { in: normalizedList } },
        });
        for (const r of found) {
          suppressedSet.add(r.email.toLowerCase());
        }
      }
    } catch {
      // Fail open for DB blip
    }

    for (const email of normalizedList) {
      if (this.memoryFallback.has(email)) {
        suppressedSet.add(email);
      }
    }

    const allowed = normalizedList.filter((e) => !suppressedSet.has(e));
    const suppressed = normalizedList.filter((e) => suppressedSet.has(e));

    return { allowed, suppressed };
  }

  async list(options?: { reason?: string }): Promise<SuppressionRow[]> {
    try {
      if (this.db?.emailSuppression?.findMany) {
        const where = options?.reason ? { reason: options.reason } : {};
        const rows = await this.db.emailSuppression.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        });
        if (rows && rows.length > 0) return rows;
      }
    } catch {
      // Fall through
    }
    const all = Array.from(this.memoryFallback.values());
    if (options?.reason) {
      return all.filter((r) => r.reason === options.reason);
    }
    return all;
  }

  async count(): Promise<number> {
    try {
      if (typeof this.db?.emailSuppression?.count === 'function') {
        return await this.db.emailSuppression.count();
      }
    } catch {
      // Fall through
    }
    return this.memoryFallback.size;
  }
}

export const suppressionService = new SuppressionService();
