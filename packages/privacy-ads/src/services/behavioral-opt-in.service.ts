// ============================================================================
// Privacy-First Ads - Behavioral Opt-In Service
// Manages user consent for behavioral targeting. Default is false (opt-in only).
// ============================================================================

import { z } from 'zod';

export const SetConsentSchema = z.object({
  userId: z.string().min(1),
  consented: z.boolean(),
});

export const GetConsentSchema = z.object({
  userId: z.string().min(1),
});

/**
 * ConsentStore interface for pluggable persistence backends.
 * Implement this to persist consent state across restarts or replicas.
 */
export interface ConsentStore {
  get(userId: string): boolean | undefined | Promise<boolean | undefined>;
  set(userId: string, consented: boolean): void | Promise<void>;
}

/**
 * Default in-memory consent store. Suitable for testing or single-process use.
 */
export class InMemoryConsentStore implements ConsentStore {
  private readonly store = new Map<string, boolean>();

  get(userId: string): boolean | undefined {
    return this.store.get(userId);
  }

  set(userId: string, consented: boolean): void {
    this.store.set(userId, consented);
  }
}

/**
 * BehavioralOptInService - Manages user consent state
 *
 * Behavioral targeting is strictly opt-in. Default consent state is false.
 * Users must explicitly opt in before the on-device ranker can use
 * behavioral signals for ad targeting.
 *
 * Accepts an optional ConsentStore for persistent backends. Falls back
 * to in-memory storage if none is provided.
 */
export class BehavioralOptInService {
  private readonly consentStore: ConsentStore;

  constructor(store?: ConsentStore) {
    this.consentStore = store ?? new InMemoryConsentStore();
  }

  /**
   * Get consent state for a user. Default is false (not opted in).
   */
  getConsent(userId: string): boolean {
    GetConsentSchema.parse({ userId });
    const value = this.consentStore.get(userId);
    // Handle both sync and async stores; for sync stores the value is immediate
    if (value instanceof Promise) {
      // Synchronous callers expect a boolean; only sync stores are supported
      // in the synchronous API path. Async stores should use getConsentAsync.
      return false;
    }
    return value ?? false;
  }

  /**
   * Get consent state asynchronously. Supports async ConsentStore backends.
   */
  async getConsentAsync(userId: string): Promise<boolean> {
    GetConsentSchema.parse({ userId });
    const value = await this.consentStore.get(userId);
    return value ?? false;
  }

  /**
   * Set consent state for a user.
   */
  setConsent(userId: string, consented: boolean): void {
    SetConsentSchema.parse({ userId, consented });
    this.consentStore.set(userId, consented);
  }

  /**
   * Check if a user has opted in to behavioral targeting.
   */
  isOptedIn(userId: string): boolean {
    GetConsentSchema.parse({ userId });
    const value = this.consentStore.get(userId);
    if (value instanceof Promise) {
      return false;
    }
    return value ?? false;
  }
}
