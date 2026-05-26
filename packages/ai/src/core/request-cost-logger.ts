// ============================================================================
// AI Core - Request Cost Logger
// ============================================================================

/**
 * Cost log entry for a single AI request
 */
export interface CostLogEntry {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  timestamp: number;
}

/**
 * Request Cost Logger
 *
 * Tracks per-request costs for accurate billing and usage analytics.
 */
export class RequestCostLogger {
  private entries: CostLogEntry[] = [];

  /**
   * Log a request with token counts and per-token costs
   */
  logRequest(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    costPerInputToken: number,
    costPerOutputToken: number,
  ): CostLogEntry {
    const estimatedCost = inputTokens * costPerInputToken + outputTokens * costPerOutputToken;
    const entry: CostLogEntry = {
      modelId,
      inputTokens,
      outputTokens,
      estimatedCost,
      timestamp: Date.now(),
    };
    this.entries.push(entry);
    return entry;
  }

  /**
   * Get total cost across all logged requests
   */
  getTotal(): number {
    let total = 0;
    for (const entry of this.entries) {
      total += entry.estimatedCost;
    }
    return total;
  }

  /**
   * Get all entries for a specific model
   */
  getByModel(modelId: string): CostLogEntry[] {
    return this.entries.filter((e) => e.modelId === modelId);
  }

  /**
   * Reset all logged entries
   */
  reset(): void {
    this.entries = [];
  }
}
