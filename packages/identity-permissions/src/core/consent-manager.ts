// ============================================================================
// Consent Manager - AI consent and data usage tracking
// ============================================================================
// NOTE: This is an in-memory implementation for the foundation phase. All consent prompts,
// responses, and data usage logs are held in Maps with no persistence, eviction, or size limits.
// Database-backed storage and eviction policies will be added when persistence integration
// is implemented.

import type { ConsentPrompt, ConsentResponse, ConsentLedgerEntry, ResourceType } from '../types.js';

interface DataUsageEntry {
  agentId: string;
  resourceIds: string[];
  reason: string;
  timestamp: number;
}

export class ConsentManager {
  private prompts: Map<string, ConsentPrompt> = new Map();
  private responses: Map<string, ConsentResponse> = new Map();
  private dataUsageLog: Map<string, DataUsageEntry[]> = new Map();
  private consentLedger: Map<string, ConsentLedgerEntry[]> = new Map();

  requestConsent(
    userId: string,
    agentId: string,
    resourceType: ResourceType,
    reason: string,
  ): string {
    const id = `consent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const prompt: ConsentPrompt = {
      id,
      userId,
      agentId,
      resourceType,
      reason,
      createdAt: Date.now(),
    };
    this.prompts.set(id, prompt);
    return id;
  }

  recordResponse(promptId: string, userId: string, granted: boolean): boolean {
    const prompt = this.prompts.get(promptId);
    if (!prompt || prompt.userId !== userId) return false;

    const response: ConsentResponse = {
      promptId,
      userId,
      granted,
      respondedAt: Date.now(),
    };
    this.responses.set(promptId, response);
    return true;
  }

  hasConsent(userId: string, agentId: string, resourceType: ResourceType): boolean {
    for (const [promptId, prompt] of this.prompts) {
      if (prompt.userId !== userId) continue;
      if (prompt.agentId !== agentId) continue;
      if (prompt.resourceType !== resourceType) continue;

      const response = this.responses.get(promptId);
      if (response?.granted) return true;
    }
    return false;
  }

  revokeConsent(promptId: string): boolean {
    if (!this.responses.has(promptId)) return false;
    this.responses.delete(promptId);
    return true;
  }

  getActiveConsents(userId: string): ConsentResponse[] {
    const results: ConsentResponse[] = [];
    for (const [promptId, prompt] of this.prompts) {
      if (prompt.userId !== userId) continue;
      const response = this.responses.get(promptId);
      if (response?.granted) {
        results.push(response);
      }
    }
    return results;
  }

  logDataUsage(suggestionId: string, agentId: string, resourceIds: string[], reason: string): void {
    const entries = this.dataUsageLog.get(suggestionId) ?? [];
    entries.push({
      agentId,
      resourceIds,
      reason,
      timestamp: Date.now(),
    });
    this.dataUsageLog.set(suggestionId, entries);
  }

  getDataUsageExplanation(suggestionId: string): DataUsageEntry[] | undefined {
    return this.dataUsageLog.get(suggestionId);
  }

  getAIDataUsagePanel(
    userId: string,
  ): { promptId: string; prompt: ConsentPrompt; usage: DataUsageEntry[] }[] {
    const results: { promptId: string; prompt: ConsentPrompt; usage: DataUsageEntry[] }[] = [];
    for (const [promptId, prompt] of this.prompts) {
      if (prompt.userId !== userId) continue;
      const response = this.responses.get(promptId);
      if (!response?.granted) continue;

      // Gather all data usage entries related to this agent
      const usage: DataUsageEntry[] = [];
      for (const entries of this.dataUsageLog.values()) {
        for (const entry of entries) {
          if (entry.agentId === prompt.agentId) {
            usage.push(entry);
          }
        }
      }
      results.push({ promptId, prompt, usage });
    }
    return results;
  }

  // ==========================================================================
  // Consent Ledger - Full consent lifecycle tracking
  // ==========================================================================

  /** Grant consent and record in the ledger */
  grantConsent(userId: string, scope: string, source: string, expiry?: number): string {
    const id = `ledger-${userId}-${Date.now()}-${crypto.randomUUID().slice(0, 12)}`;
    const entry: ConsentLedgerEntry = {
      id,
      userId,
      scope,
      source,
      grantedAt: Date.now(),
      expiry,
      withdrawnAt: undefined,
    };

    const entries = this.consentLedger.get(userId) ?? [];
    entries.push(entry);
    this.consentLedger.set(userId, entries);
    return id;
  }

  /** Withdraw consent immediately - marks as withdrawn */
  withdrawConsent(consentId: string): boolean {
    for (const entries of this.consentLedger.values()) {
      const entry = entries.find((e) => e.id === consentId);
      if (entry) {
        if (entry.withdrawnAt !== undefined) return false;
        entry.withdrawnAt = Date.now();
        return true;
      }
    }
    return false;
  }

  /** Get full consent history for a user */
  getConsentHistory(userId: string): ConsentLedgerEntry[] {
    return this.consentLedger.get(userId) ?? [];
  }

  /** Get all active (non-withdrawn, non-expired) consents for a user */
  getActiveConsentsForUser(userId: string): ConsentLedgerEntry[] {
    const entries = this.consentLedger.get(userId) ?? [];
    const now = Date.now();
    return entries.filter((entry) => {
      if (entry.withdrawnAt !== undefined) return false;
      if (entry.expiry !== undefined && entry.expiry <= now) return false;
      return true;
    });
  }

  /** Check if a specific consent entry is still valid (not withdrawn, not expired) */
  isConsentValid(consentId: string): boolean {
    const now = Date.now();
    for (const entries of this.consentLedger.values()) {
      const entry = entries.find((e) => e.id === consentId);
      if (entry) {
        if (entry.withdrawnAt !== undefined) return false;
        if (entry.expiry !== undefined && entry.expiry <= now) return false;
        return true;
      }
    }
    return false;
  }
}
