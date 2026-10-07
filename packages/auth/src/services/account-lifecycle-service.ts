// ============================================================================
// Auth - Account Lifecycle Service
// ============================================================================

import type { AccountDeletionRequest } from '../types';

/** Vacation responder configuration */
export interface VacationResponder {
  enabled: boolean;
  subject: string;
  message: string;
  startDate: Date;
  endDate?: Date;
}

/** Account export data structure for GDPR/DPDP */
export interface AccountExportData {
  userId: string;
  exportedAt: Date;
  profile: Record<string, unknown>;
  sessions: Record<string, unknown>[];
  preferences: Record<string, unknown>;
  activityLog: Record<string, unknown>[];
}

/** Interface for services that hold user data and need cleanup on purge */
export interface PurgeableService {
  purgeUserData(userId: string): void | Promise<void>;
}

/** Grace period in milliseconds (14 days) */
const DELETION_GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Account Lifecycle Service
 *
 * Manages the full lifecycle of a user account including:
 * - Account deletion with 14-day grace period
 * - Data export for GDPR/DPDP compliance
 * - Full account purge across all stores
 * - Vacation responder propagation
 */
export class AccountLifecycleService {
  private deletionRequests: Map<string, AccountDeletionRequest> = new Map();
  private vacationResponders: Map<string, VacationResponder> = new Map();
  private purgedAccounts: Set<string> = new Set();
  private purgeableServices: PurgeableService[] = [];

  /**
   * Register a service for cross-service cleanup on account purge
   */
  registerPurgeableService(service: PurgeableService): void {
    this.purgeableServices.push(service);
  }

  /**
   * Request account deletion with 14-day grace period
   */
  requestDeletion(userId: string): AccountDeletionRequest {
    const now = new Date();
    const request: AccountDeletionRequest = {
      userId,
      requestedAt: now,
      scheduledPurgeAt: new Date(now.getTime() + DELETION_GRACE_PERIOD_MS),
      status: 'pending',
    };
    this.deletionRequests.set(userId, request);
    return request;
  }

  /**
   * Cancel a pending deletion request
   */
  cancelDeletion(userId: string): boolean {
    const request = this.deletionRequests.get(userId);
    if (!request || request.status !== 'pending') return false;
    request.status = 'cancelled';
    return true;
  }

  /**
   * Get the status of a deletion request
   */
  getAccountDeletionStatus(userId: string): AccountDeletionRequest | null {
    return this.deletionRequests.get(userId) ?? null;
  }

  /**
   * Export account data for GDPR/DPDP compliance
   */
  exportAccountData(userId: string): AccountExportData {
    return {
      userId,
      exportedAt: new Date(),
      profile: {
        userId,
        exportFormat: 'quant-gdpr-v1',
      },
      sessions: [],
      preferences: {},
      activityLog: [],
    };
  }

  /**
   * Purge an account - full removal across all stores
   */
  purgeAccount(userId: string): boolean {
    const request = this.deletionRequests.get(userId);
    if (request) {
      request.status = 'purged';
    }
    this.vacationResponders.delete(userId);
    this.purgedAccounts.add(userId);

    // Orchestrate cross-service cleanup
    for (const service of this.purgeableServices) {
      service.purgeUserData(userId);
    }

    return true;
  }

  /**
   * Check if an account has been purged
   */
  isAccountPurged(userId: string): boolean {
    return this.purgedAccounts.has(userId);
  }

  /**
   * Set vacation responder for a user
   */
  setVacationResponder(userId: string, responder: VacationResponder): void {
    this.vacationResponders.set(userId, responder);
  }

  /**
   * Get vacation responder for a user
   */
  getVacationResponder(userId: string): VacationResponder | null {
    return this.vacationResponders.get(userId) ?? null;
  }

  /**
   * Clear vacation responder for a user
   */
  clearVacationResponder(userId: string): boolean {
    return this.vacationResponders.delete(userId);
  }
}
