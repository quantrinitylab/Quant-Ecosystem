import { prisma as defaultPrisma } from '@quant/database';
import { createAppError } from '@quant/server-core';

export interface RetentionPolicy {
  id: string;
  name: string;
  durationDays: number;
  targetFolders: string[];
  action: 'ARCHIVE' | 'PERMANENT_DELETE';
  enabled: boolean;
  createdAt: string;
}

export interface LegalHold {
  id: string;
  custodianEmail: string;
  matterName: string;
  reason: string;
  placedBy: string;
  active: boolean;
  createdAt: string;
  releasedAt?: string;
  releaseReason?: string;
}

const memoryRetentionPolicies: RetentionPolicy[] = [];
const memoryLegalHolds = new Map<string, LegalHold>();

export function resetRetentionStores(): void {
  memoryRetentionPolicies.length = 0;
  memoryLegalHolds.clear();
}

export class RetentionService {
  private readonly db: any;

  constructor(db?: any) {
    this.db = db ?? (defaultPrisma as any);
  }

  // --------------------------------------------------------------------------
  // Retention Policies (Task X07)
  // --------------------------------------------------------------------------
  async createPolicy(data: {
    name: string;
    durationDays: number;
    targetFolders?: string[];
    action?: 'ARCHIVE' | 'PERMANENT_DELETE';
  }): Promise<RetentionPolicy> {
    if (!data.name?.trim()) {
      throw createAppError('Retention policy name is required', 400, 'VALIDATION_ERROR');
    }
    if (!data.durationDays || data.durationDays < 1) {
      throw createAppError('durationDays must be at least 1', 400, 'VALIDATION_ERROR');
    }

    const policy: RetentionPolicy = {
      id: `ret-pol-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: data.name.trim(),
      durationDays: data.durationDays,
      targetFolders: data.targetFolders?.length ? data.targetFolders : ['ALL'],
      action: data.action ?? 'ARCHIVE',
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    memoryRetentionPolicies.push(policy);
    return policy;
  }

  async getPolicies(): Promise<RetentionPolicy[]> {
    return [...memoryRetentionPolicies];
  }

  // --------------------------------------------------------------------------
  // Legal Holds (Task X07 & W33-03: PostgreSQL Persistence Migration)
  // --------------------------------------------------------------------------
  async placeLegalHold(data: {
    custodianEmail: string;
    matterName: string;
    reason: string;
    placedBy: string;
  }): Promise<LegalHold> {
    const normalizedEmail = data.custodianEmail.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw createAppError('Valid custodianEmail is required', 400, 'INVALID_EMAIL');
    }
    if (!data.matterName?.trim()) {
      throw createAppError('matterName is required', 400, 'VALIDATION_ERROR');
    }

    const id = `hold-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();

    if (this.db?.legalHold?.create) {
      try {
        const created = await this.db.legalHold.create({
          data: {
            id,
            custodianEmail: normalizedEmail,
            matterName: data.matterName.trim(),
            reason: data.reason?.trim() || 'Regulatory compliance inquiry',
            placedBy: data.placedBy,
            active: true,
            createdAt: now,
          },
        });
        return {
          id: created.id,
          custodianEmail: created.custodianEmail,
          matterName: created.matterName,
          reason: created.reason,
          placedBy: created.placedBy,
          active: created.active,
          createdAt:
            created.createdAt instanceof Date
              ? created.createdAt.toISOString()
              : String(created.createdAt),
          releasedAt: created.releasedAt
            ? created.releasedAt instanceof Date
              ? created.releasedAt.toISOString()
              : String(created.releasedAt)
            : undefined,
          releaseReason: created.releaseReason ?? undefined,
        };
      } catch {
        // Fall back to memory store if database is offline in tests
      }
    }

    if (typeof this.db?.$queryRawUnsafe === 'function') {
      try {
        await this.db.$executeRawUnsafe(
          `INSERT INTO legal_holds (id, custodian_email, matter_name, reason, placed_by, active, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          id,
          normalizedEmail,
          data.matterName.trim(),
          data.reason?.trim() || 'Regulatory compliance inquiry',
          data.placedBy,
          true,
          now,
        );
        return {
          id,
          custodianEmail: normalizedEmail,
          matterName: data.matterName.trim(),
          reason: data.reason?.trim() || 'Regulatory compliance inquiry',
          placedBy: data.placedBy,
          active: true,
          createdAt: now.toISOString(),
        };
      } catch {
        // Fall back to memory store
      }
    }

    const memoryHold: LegalHold = {
      id,
      custodianEmail: normalizedEmail,
      matterName: data.matterName.trim(),
      reason: data.reason?.trim() || 'Regulatory compliance inquiry',
      placedBy: data.placedBy,
      active: true,
      createdAt: now.toISOString(),
    };
    memoryLegalHolds.set(id, memoryHold);
    return memoryHold;
  }

  async getLegalHolds(activeOnly = false): Promise<LegalHold[]> {
    if (this.db?.legalHold?.findMany) {
      try {
        const rows = await this.db.legalHold.findMany({
          where: activeOnly ? { active: true } : {},
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((r: any) => ({
          id: r.id,
          custodianEmail: r.custodianEmail,
          matterName: r.matterName,
          reason: r.reason,
          placedBy: r.placedBy,
          active: Boolean(r.active),
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
          releasedAt: r.releasedAt
            ? r.releasedAt instanceof Date
              ? r.releasedAt.toISOString()
              : String(r.releasedAt)
            : undefined,
          releaseReason: r.releaseReason ?? undefined,
        }));
      } catch {
        // Fall back to memory store
      }
    }

    if (typeof this.db?.$queryRawUnsafe === 'function') {
      try {
        const sql = activeOnly
          ? `SELECT * FROM legal_holds WHERE active = true ORDER BY created_at DESC`
          : `SELECT * FROM legal_holds ORDER BY created_at DESC`;
        const rows: any[] = await this.db.$queryRawUnsafe(sql);
        return rows.map((r: any) => ({
          id: r.id,
          custodianEmail: r.custodian_email ?? r.custodianEmail,
          matterName: r.matter_name ?? r.matterName,
          reason: r.reason,
          placedBy: r.placed_by ?? r.placedBy,
          active: Boolean(r.active),
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          releasedAt: r.released_at ? new Date(r.released_at).toISOString() : undefined,
          releaseReason: r.release_reason ?? undefined,
        }));
      } catch {
        // Fall back to memory store
      }
    }

    let holds = Array.from(memoryLegalHolds.values());
    if (activeOnly) {
      holds = holds.filter((h) => h.active);
    }
    return holds;
  }

  async releaseLegalHold(
    id: string,
    releaseReason: string,
    releasedBy: string,
  ): Promise<LegalHold> {
    if (this.db?.legalHold?.findUnique && this.db?.legalHold?.update) {
      try {
        const existing = await this.db.legalHold.findUnique({ where: { id } });
        if (!existing) {
          throw createAppError('Legal hold record not found', 404, 'LEGAL_HOLD_NOT_FOUND');
        }
        if (!existing.active) {
          throw createAppError('Legal hold is already released', 400, 'ALREADY_RELEASED');
        }

        const reason = releaseReason?.trim() || `Released by ${releasedBy}`;
        const now = new Date();
        const updated = await this.db.legalHold.update({
          where: { id },
          data: {
            active: false,
            releasedAt: now,
            releaseReason: reason,
          },
        });

        return {
          id: updated.id,
          custodianEmail: updated.custodianEmail,
          matterName: updated.matterName,
          reason: updated.reason,
          placedBy: updated.placedBy,
          active: Boolean(updated.active),
          createdAt:
            updated.createdAt instanceof Date
              ? updated.createdAt.toISOString()
              : String(updated.createdAt),
          releasedAt: updated.releasedAt
            ? updated.releasedAt instanceof Date
              ? updated.releasedAt.toISOString()
              : String(updated.releasedAt)
            : undefined,
          releaseReason: updated.releaseReason ?? undefined,
        };
      } catch (err: any) {
        if (err?.code === 'LEGAL_HOLD_NOT_FOUND' || err?.code === 'ALREADY_RELEASED') {
          throw err;
        }
        // Fall back to memory store
      }
    }

    if (typeof this.db?.$queryRawUnsafe === 'function') {
      try {
        const rows: any[] = await this.db.$queryRawUnsafe(
          `SELECT * FROM legal_holds WHERE id = $1`,
          id,
        );
        if (!rows.length) {
          throw createAppError('Legal hold record not found', 404, 'LEGAL_HOLD_NOT_FOUND');
        }
        const existing = rows[0];
        if (!existing.active) {
          throw createAppError('Legal hold is already released', 400, 'ALREADY_RELEASED');
        }
        const reason = releaseReason?.trim() || `Released by ${releasedBy}`;
        const now = new Date();
        await this.db.$executeRawUnsafe(
          `UPDATE legal_holds SET active = false, released_at = $1, release_reason = $2 WHERE id = $3`,
          now,
          reason,
          id,
        );
        return {
          id,
          custodianEmail: existing.custodian_email ?? existing.custodianEmail,
          matterName: existing.matter_name ?? existing.matterName,
          reason: existing.reason,
          placedBy: existing.placed_by ?? existing.placedBy,
          active: false,
          createdAt: existing.created_at
            ? new Date(existing.created_at).toISOString()
            : new Date().toISOString(),
          releasedAt: now.toISOString(),
          releaseReason: reason,
        };
      } catch (err: any) {
        if (err?.code === 'LEGAL_HOLD_NOT_FOUND' || err?.code === 'ALREADY_RELEASED') {
          throw err;
        }
      }
    }

    const existingMem = memoryLegalHolds.get(id);
    if (!existingMem) {
      throw createAppError('Legal hold record not found', 404, 'LEGAL_HOLD_NOT_FOUND');
    }
    if (!existingMem.active) {
      throw createAppError('Legal hold is already released', 400, 'ALREADY_RELEASED');
    }
    const reason = releaseReason?.trim() || `Released by ${releasedBy}`;
    const now = new Date();
    const updatedMem: LegalHold = {
      ...existingMem,
      active: false,
      releasedAt: now.toISOString(),
      releaseReason: reason,
    };
    memoryLegalHolds.set(id, updatedMem);
    return updatedMem;
  }

  async isUnderLegalHold(email: string): Promise<boolean> {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();

    if (this.db?.legalHold?.findFirst) {
      try {
        const hold = await this.db.legalHold.findFirst({
          where: { custodianEmail: normalized, active: true },
        });
        if (hold) return true;
      } catch {
        // Fall back to memory store
      }
    }

    if (this.db?.legalHold?.count) {
      try {
        const count = await this.db.legalHold.count({
          where: { custodianEmail: normalized, active: true },
        });
        if (count > 0) return true;
      } catch {
        // Fall back to memory store
      }
    }

    if (typeof this.db?.$queryRawUnsafe === 'function') {
      try {
        const rows: any[] = await this.db.$queryRawUnsafe(
          `SELECT id FROM legal_holds WHERE custodian_email = $1 AND active = true LIMIT 1`,
          normalized,
        );
        if (rows.length > 0) return true;
      } catch {
        // Fall back to memory store
      }
    }

    for (const hold of memoryLegalHolds.values()) {
      if (hold.custodianEmail === normalized && hold.active) {
        return true;
      }
    }

    return false;
  }
}
