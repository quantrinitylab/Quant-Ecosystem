import type { ConsentRecord } from '../types.js';

export interface ConsentStorage {
  save(record: ConsentRecord): void;
  update(record: ConsentRecord): void;
  findById(id: string): ConsentRecord | undefined;
  findByUser(userId: string): ConsentRecord[];
  findAll(): ConsentRecord[];
}

export class InMemoryConsentStorage implements ConsentStorage {
  private records: ConsentRecord[] = [];

  save(record: ConsentRecord): void {
    this.records.push(record);
  }

  update(record: ConsentRecord): void {
    const idx = this.records.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      this.records[idx] = record;
    }
  }

  findById(id: string): ConsentRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  findByUser(userId: string): ConsentRecord[] {
    return this.records.filter((r) => r.userId === userId);
  }

  findAll(): ConsentRecord[] {
    return [...this.records];
  }
}

export class ConsentManager {
  private storage: ConsentStorage;

  constructor(storage?: ConsentStorage) {
    this.storage = storage ?? new InMemoryConsentStorage();
  }

  grant(userId: string, faceId: string, purpose: string): ConsentRecord {
    const record: ConsentRecord = {
      id: `consent_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      userId,
      faceId,
      granted: true,
      timestamp: Date.now(),
      purpose,
      revoked: false,
    };
    this.storage.save(record);
    return record;
  }

  revoke(consentId: string): boolean {
    const record = this.storage.findById(consentId);
    if (!record || record.revoked) return false;

    record.revoked = true;
    record.revokedAt = Date.now();
    this.storage.update(record);
    return true;
  }

  hasConsent(userId: string, faceId: string, purpose: string): boolean {
    const records = this.storage.findByUser(userId);
    return records.some(
      (r) => r.faceId === faceId && r.purpose === purpose && r.granted && !r.revoked,
    );
  }

  getAuditTrail(userId?: string): ConsentRecord[] {
    if (userId) {
      return this.storage.findByUser(userId);
    }
    return this.storage.findAll();
  }

  getActiveConsents(userId: string): ConsentRecord[] {
    return this.storage.findByUser(userId).filter((r) => r.granted && !r.revoked);
  }

  revokeAll(userId: string): number {
    let count = 0;
    const records = this.storage.findByUser(userId);
    for (const record of records) {
      if (!record.revoked) {
        record.revoked = true;
        record.revokedAt = Date.now();
        this.storage.update(record);
        count++;
      }
    }
    return count;
  }

  getStorage(): ConsentStorage {
    return this.storage;
  }
}
