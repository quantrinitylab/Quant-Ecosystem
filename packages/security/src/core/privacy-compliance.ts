// ============================================================================
// Security Package - Privacy Compliance (GDPR)
// ============================================================================

import crypto from 'node:crypto';
import type { GDPRRequest, GDPRExportData, ConsentRecord, RetentionPolicy } from '../types';

/**
 * PrivacyCompliance - GDPR and privacy compliance management with data export,
 * right to deletion, consent management, data minimization, and retention schedules.
 */
export class PrivacyCompliance {
  private requests: Map<string, GDPRRequest>;
  private consents: Map<string, ConsentRecord[]>;
  private retentionPolicies: Map<string, RetentionPolicy>;
  private userData: Map<string, Map<string, unknown[]>>;
  private deletionLog: { userId: string; categories: string[]; timestamp: number }[];
  private processingPurposes: Map<
    string,
    { description: string; legalBasis: string; required: boolean }
  >;

  constructor() {
    this.requests = new Map();
    this.consents = new Map();
    this.retentionPolicies = new Map();
    this.userData = new Map();
    this.deletionLog = [];
    this.processingPurposes = new Map();
    this.initializeDefaultPolicies();
  }

  /** Submit a GDPR data request (export, deletion, etc.) */
  async submitRequest(
    userId: string,
    type: GDPRRequest['type'],
    categories: string[] = [],
  ): Promise<GDPRRequest> {
    const id = this.generateId('gdpr');
    const now = Date.now();

    const request: GDPRRequest = {
      id,
      userId,
      type,
      status: 'pending',
      createdAt: now,
      dataCategories: categories.length > 0 ? categories : this.getAllCategories(),
    };

    this.requests.set(id, request);

    // Auto-process if possible
    if (type === 'export') {
      await this.processExportRequest(request);
    } else if (type === 'deletion') {
      await this.processDeletionRequest(request);
    }

    return request;
  }

  /** Process a data export request */
  private async processExportRequest(request: GDPRRequest): Promise<void> {
    request.status = 'processing';
    // In production, this would be async. Here we complete immediately.
    request.status = 'completed';
    request.completedAt = Date.now();
  }

  /** Process a deletion request (right to be forgotten) */
  private async processDeletionRequest(request: GDPRRequest): Promise<void> {
    request.status = 'processing';

    const userDataMap = this.userData.get(request.userId);
    if (userDataMap) {
      const deletedCategories: string[] = [];
      for (const category of request.dataCategories) {
        // Check retention policy - some data may have legal basis to retain
        const policy = this.retentionPolicies.get(category);
        if (policy && policy.legalBasis === 'legal_obligation') {
          continue; // Cannot delete data required by law
        }
        userDataMap.delete(category);
        deletedCategories.push(category);
      }

      this.deletionLog.push({
        userId: request.userId,
        categories: deletedCategories,
        timestamp: Date.now(),
      });

      if (userDataMap.size === 0) {
        this.userData.delete(request.userId);
      }
    }

    // Remove consent records (except proof of consent for legal basis)
    const userConsents = this.consents.get(request.userId) || [];
    const retainedConsents = userConsents.filter((c) => c.purpose === 'consent_proof');
    this.consents.set(request.userId, retainedConsents);

    request.status = 'completed';
    request.completedAt = Date.now();
  }

  /** Export user data in structured format */
  async exportUserData(userId: string, format: 'json' | 'csv' = 'json'): Promise<GDPRExportData> {
    const userDataMap = this.userData.get(userId) || new Map();
    const categories: Record<string, unknown[]> = {};

    for (const [category, data] of userDataMap) {
      categories[category] = [...data];
    }

    // Include consent records
    const consents = this.consents.get(userId) || [];
    categories['consents'] = consents;

    return {
      userId,
      exportDate: Date.now(),
      categories,
      metadata: {
        format,
        exportedBy: 'system',
        version: '1.0',
        totalCategories: Object.keys(categories).length.toString(),
      },
      format,
    };
  }

  /** Record user consent */
  async recordConsent(
    userId: string,
    purpose: string,
    granted: boolean,
    version: string = '1.0',
  ): Promise<ConsentRecord> {
    const now = Date.now();
    const record: ConsentRecord = {
      userId,
      purpose,
      granted,
      timestamp: now,
      version,
      source: 'explicit',
    };

    // Get existing consents for user
    const userConsents = this.consents.get(userId) || [];

    // Update or add consent for this purpose
    const existingIdx = userConsents.findIndex((c) => c.purpose === purpose);
    if (existingIdx >= 0) {
      // If withdrawing, record withdrawal timestamp
      if (!granted && userConsents[existingIdx]!.granted) {
        record.withdrawnAt = now;
      }
      userConsents[existingIdx] = record;
    } else {
      userConsents.push(record);
    }

    this.consents.set(userId, userConsents);
    return record;
  }

  /** Check if user has granted consent for a purpose */
  hasConsent(userId: string, purpose: string): boolean {
    const userConsents = this.consents.get(userId) || [];
    const consent = userConsents.find((c) => c.purpose === purpose);
    if (!consent) return false;
    if (!consent.granted) return false;
    if (consent.expiresAt && Date.now() > consent.expiresAt) return false;
    if (consent.withdrawnAt) return false;
    return true;
  }

  /** Withdraw consent for a purpose */
  async withdrawConsent(userId: string, purpose: string): Promise<boolean> {
    const userConsents = this.consents.get(userId) || [];
    const consent = userConsents.find((c) => c.purpose === purpose);
    if (!consent || !consent.granted) return false;

    consent.granted = false;
    consent.withdrawnAt = Date.now();
    return true;
  }

  /** Get all consents for a user */
  getUserConsents(userId: string): ConsentRecord[] {
    return [...(this.consents.get(userId) || [])];
  }

  /** Register a data retention policy */
  registerRetentionPolicy(policy: RetentionPolicy): void {
    this.retentionPolicies.set(policy.category, policy);
  }

  /** Apply retention policies - delete expired data */
  async applyRetentionPolicies(): Promise<{ deletedRecords: number; affectedUsers: number }> {
    const now = Date.now();
    let deletedRecords = 0;
    const affectedUsers = new Set<string>();

    for (const [userId, userDataMap] of this.userData) {
      for (const [category, data] of userDataMap) {
        const policy = this.retentionPolicies.get(category);
        if (!policy || !policy.autoDelete) continue;

        const maxAge = policy.retentionDays * 86400000;
        const filtered = data.filter((item: any) => {
          const createdAt = item?.createdAt || item?.timestamp || 0;
          return now - createdAt < maxAge;
        });

        if (filtered.length < data.length) {
          deletedRecords += data.length - filtered.length;
          affectedUsers.add(userId);
          userDataMap.set(category, filtered);
        }
      }
    }

    return { deletedRecords, affectedUsers: affectedUsers.size };
  }

  /** Store user data (for simulation purposes) */
  storeUserData(userId: string, category: string, data: unknown): void {
    let userDataMap = this.userData.get(userId);
    if (!userDataMap) {
      userDataMap = new Map();
      this.userData.set(userId, userDataMap);
    }
    const categoryData = userDataMap.get(category) || [];
    categoryData.push(data);
    userDataMap.set(category, categoryData);
  }

  /** Register a processing purpose */
  registerPurpose(
    id: string,
    description: string,
    legalBasis: string,
    required: boolean = false,
  ): void {
    this.processingPurposes.set(id, { description, legalBasis, required });
  }

  /** Get data processing purposes */
  getPurposes(): Map<string, { description: string; legalBasis: string; required: boolean }> {
    return new Map(this.processingPurposes);
  }

  /** Get request by ID */
  getRequest(requestId: string): GDPRRequest | undefined {
    return this.requests.get(requestId);
  }

  /** Get all requests for a user */
  getUserRequests(userId: string): GDPRRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.userId === userId);
  }

  /** Initialize default retention policies */
  private initializeDefaultPolicies(): void {
    this.retentionPolicies.set('analytics', {
      category: 'analytics',
      retentionDays: 730,
      legalBasis: 'legitimate_interest',
      autoDelete: true,
      notifyBeforeDays: 30,
    });
    this.retentionPolicies.set('logs', {
      category: 'logs',
      retentionDays: 90,
      legalBasis: 'legitimate_interest',
      autoDelete: true,
      notifyBeforeDays: 7,
    });
    this.retentionPolicies.set('billing', {
      category: 'billing',
      retentionDays: 2555, // ~7 years
      legalBasis: 'legal_obligation',
      autoDelete: false,
      notifyBeforeDays: 90,
    });
    this.retentionPolicies.set('profile', {
      category: 'profile',
      retentionDays: 0, // Until deletion requested
      legalBasis: 'consent',
      autoDelete: false,
      notifyBeforeDays: 0,
    });

    // Default processing purposes
    this.registerPurpose('essential', 'Essential service functionality', 'contract', true);
    this.registerPurpose(
      'analytics',
      'Usage analytics and improvement',
      'legitimate_interest',
      false,
    );
    this.registerPurpose('marketing', 'Marketing communications', 'consent', false);
    this.registerPurpose('personalization', 'Content personalization', 'consent', false);
  }

  /** Get all data categories */
  private getAllCategories(): string[] {
    return Array.from(this.retentionPolicies.keys());
  }

  /** Generate unique ID */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  /** Get compliance statistics */
  getStats(): {
    totalRequests: number;
    pendingRequests: number;
    totalConsents: number;
    deletionCount: number;
  } {
    let pending = 0;
    for (const req of this.requests.values()) {
      if (req.status === 'pending' || req.status === 'processing') pending++;
    }

    let totalConsents = 0;
    for (const consents of this.consents.values()) {
      totalConsents += consents.length;
    }

    return {
      totalRequests: this.requests.size,
      pendingRequests: pending,
      totalConsents,
      deletionCount: this.deletionLog.length,
    };
  }
}
