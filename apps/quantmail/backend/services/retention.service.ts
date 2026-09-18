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
  // Legal Holds (Task X07)
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
    const hold: LegalHold = {
      id,
      custodianEmail: normalizedEmail,
      matterName: data.matterName.trim(),
      reason: data.reason?.trim() || 'Regulatory compliance inquiry',
      placedBy: data.placedBy,
      active: true,
      createdAt: new Date().toISOString(),
    };

    memoryLegalHolds.set(id, hold);
    return hold;
  }

  async getLegalHolds(activeOnly = false): Promise<LegalHold[]> {
    const all = Array.from(memoryLegalHolds.values());
    if (activeOnly) {
      return all.filter((h) => h.active);
    }
    return all;
  }

  async releaseLegalHold(
    id: string,
    releaseReason: string,
    releasedBy: string,
  ): Promise<LegalHold> {
    const hold = memoryLegalHolds.get(id);
    if (!hold) {
      throw createAppError('Legal hold record not found', 404, 'LEGAL_HOLD_NOT_FOUND');
    }
    if (!hold.active) {
      throw createAppError('Legal hold is already released', 400, 'ALREADY_RELEASED');
    }

    hold.active = false;
    hold.releasedAt = new Date().toISOString();
    hold.releaseReason = releaseReason?.trim() || `Released by ${releasedBy}`;

    memoryLegalHolds.set(id, hold);
    return hold;
  }

  async isUnderLegalHold(email: string): Promise<boolean> {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    for (const hold of memoryLegalHolds.values()) {
      if (hold.active && hold.custodianEmail === normalized) {
        return true;
      }
    }
    return false;
  }
}
