// ============================================================================
// AI Core - Provider Health Monitor
// ============================================================================

import type { AIProvider, ProviderHealthStats } from '../types';

const WINDOW_MS = 300_000; // 5 minutes
const CIRCUIT_OPEN_DURATION_MS = 60_000; // 60 seconds
const MIN_REQUESTS_FOR_HEALTH_CHECK = 10;
const ERROR_RATE_THRESHOLD = 0.05; // 5%

interface ProviderWindow {
  windowStartMs: number;
  successes: number;
  errors: number;
  latencies: number[];
  lastErrorAt: number | null;
  circuitOpen: boolean;
  circuitOpenedAt: number | null;
  probeInFlight: boolean;
}

/**
 * Provider Health Monitor
 *
 * Tracks provider health using a sliding window approach with circuit breaker logic.
 * When a provider's error rate exceeds 5% (with at least 10 requests), the circuit opens.
 * After 60 seconds, a single probe request is allowed to test recovery.
 */
export class ProviderHealthMonitor {
  private windows: Map<string, ProviderWindow> = new Map();
  private nowFn: () => number;

  constructor(nowFn?: () => number) {
    this.nowFn = nowFn ?? (() => Date.now());
  }

  /**
   * Record a successful request for a provider
   */
  recordSuccess(provider: AIProvider, latencyMs: number): void {
    const window = this.getOrCreateWindow(provider);
    this.pruneWindow(window);
    window.successes++;
    window.latencies.push(latencyMs);

    // If probe was in flight and succeeded, close circuit
    if (window.probeInFlight) {
      window.probeInFlight = false;
      window.circuitOpen = false;
      window.circuitOpenedAt = null;
    }
  }

  /**
   * Record an error for a provider
   */
  recordError(provider: AIProvider): void {
    const window = this.getOrCreateWindow(provider);
    this.pruneWindow(window);
    window.errors++;
    window.lastErrorAt = this.nowFn();

    // If probe was in flight and failed, extend circuit open duration
    if (window.probeInFlight) {
      window.probeInFlight = false;
      window.circuitOpenedAt = this.nowFn();
    }

    // Check if we should open the circuit
    if (!window.circuitOpen) {
      const total = window.successes + window.errors;
      if (total >= MIN_REQUESTS_FOR_HEALTH_CHECK) {
        const errorRate = window.errors / total;
        if (errorRate >= ERROR_RATE_THRESHOLD) {
          window.circuitOpen = true;
          window.circuitOpenedAt = this.nowFn();
        }
      }
    }
  }

  /**
   * Check if a provider is healthy (circuit is closed or probe is allowed)
   */
  isHealthy(provider: AIProvider): boolean {
    const window = this.windows.get(provider);
    if (!window) return true;

    this.pruneWindow(window);

    if (!window.circuitOpen) {
      // Re-evaluate health based on current window
      const total = window.successes + window.errors;
      if (total >= MIN_REQUESTS_FOR_HEALTH_CHECK) {
        const errorRate = window.errors / total;
        if (errorRate >= ERROR_RATE_THRESHOLD) {
          window.circuitOpen = true;
          window.circuitOpenedAt = this.nowFn();
          return false;
        }
      }
      return true;
    }

    // Circuit is open - check if probe window has elapsed
    if (window.circuitOpenedAt !== null) {
      const elapsed = this.nowFn() - window.circuitOpenedAt;
      if (elapsed >= CIRCUIT_OPEN_DURATION_MS) {
        // Allow a probe request
        window.probeInFlight = true;
        return true;
      }
    }

    return false;
  }

  /**
   * Get P95 latency for a provider
   */
  getP95Latency(provider: AIProvider): number {
    const window = this.windows.get(provider);
    if (!window || window.latencies.length === 0) return 0;

    const sorted = [...window.latencies].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
  }

  /**
   * Get stats for a specific provider
   */
  getStats(provider: AIProvider): ProviderHealthStats {
    const window = this.windows.get(provider);
    if (!window) {
      return {
        provider,
        windowStartMs: this.nowFn(),
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        latencies: [],
        lastErrorAt: null,
        circuitOpen: false,
        circuitOpenedAt: null,
      };
    }

    return {
      provider,
      windowStartMs: window.windowStartMs,
      totalRequests: window.successes + window.errors,
      successCount: window.successes,
      errorCount: window.errors,
      latencies: [...window.latencies],
      lastErrorAt: window.lastErrorAt,
      circuitOpen: window.circuitOpen,
      circuitOpenedAt: window.circuitOpenedAt,
    };
  }

  /**
   * Get stats for all tracked providers
   */
  getAllStats(): ProviderHealthStats[] {
    const stats: ProviderHealthStats[] = [];
    for (const [provider] of this.windows) {
      stats.push(this.getStats(provider as AIProvider));
    }
    return stats;
  }

  /**
   * Reset all health tracking data
   */
  reset(): void {
    this.windows.clear();
  }

  private getOrCreateWindow(provider: AIProvider): ProviderWindow {
    let window = this.windows.get(provider);
    if (!window) {
      window = {
        windowStartMs: this.nowFn(),
        successes: 0,
        errors: 0,
        latencies: [],
        lastErrorAt: null,
        circuitOpen: false,
        circuitOpenedAt: null,
        probeInFlight: false,
      };
      this.windows.set(provider, window);
    }
    return window;
  }

  private pruneWindow(window: ProviderWindow): void {
    const now = this.nowFn();
    const cutoff = now - WINDOW_MS;
    if (window.windowStartMs < cutoff) {
      // Reset the window - data is stale
      window.windowStartMs = now;
      window.successes = 0;
      window.errors = 0;
      window.latencies = [];
      // Keep circuit state - it has its own timing logic
    }
  }
}
