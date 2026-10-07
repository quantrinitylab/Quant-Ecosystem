// ============================================================================
// Health Checker - Kubernetes-compatible Health Probes
// ============================================================================

import {
  HealthStatus,
  HealthStatusType,
  HealthCheck,
  HealthCheckRegistration,
  HealthCheckResult,
  HealthHistory,
} from '../types';

interface CheckCache {
  result: HealthCheck;
  cachedAt: number;
}

interface DependencyFeature {
  name: string;
  requiredDependencies: string[];
}

export class HealthChecker {
  private checks: Map<string, HealthCheckRegistration> = new Map();
  private checkCache: Map<string, CheckCache> = new Map();
  private history: HealthHistory[] = [];
  private maxHistorySize: number = 100;
  private startupComplete: boolean = false;
  private startTime: number = Date.now();
  private version: string;
  private features: DependencyFeature[] = [];
  private lastCheckResults: Map<string, HealthCheck> = new Map();

  constructor(version: string = '1.0.0') {
    this.version = version;
  }

  // Register a health check
  registerCheck(registration: HealthCheckRegistration): void {
    this.checks.set(registration.name, registration);
  }

  // Remove a health check
  removeCheck(name: string): void {
    this.checks.delete(name);
    this.checkCache.delete(name);
    this.lastCheckResults.delete(name);
  }

  // Register a feature with its required dependencies
  registerFeature(name: string, requiredDependencies: string[]): void {
    this.features.push({ name, requiredDependencies });
  }

  // Mark startup as complete
  markStartupComplete(): void {
    this.startupComplete = true;
  }

  // Liveness probe - process is alive and not deadlocked
  async liveness(): Promise<{ alive: boolean; uptime: number }> {
    return {
      alive: true,
      uptime: Date.now() - this.startTime,
    };
  }

  // Readiness probe - all critical dependencies healthy
  async readiness(): Promise<{ ready: boolean; checks: HealthCheck[] }> {
    const results = await this.runAllChecks();
    const criticalChecks = results.filter(c => {
      const reg = this.checks.get(c.name);
      return reg?.critical ?? false;
    });
    const ready = criticalChecks.every(c => c.status === 'healthy');
    return { ready, checks: results };
  }

  // Startup probe - initialization is complete
  startup(): { started: boolean; uptime: number } {
    return {
      started: this.startupComplete,
      uptime: Date.now() - this.startTime,
    };
  }

  // Run a single health check with timeout
  private async runCheck(name: string): Promise<HealthCheck> {
    const registration = this.checks.get(name);
    if (!registration) {
      return {
        name,
        status: 'unhealthy',
        latency: 0,
        message: 'Check not registered',
        critical: false,
        lastChecked: Date.now(),
      };
    }

    // Check cache
    const cached = this.checkCache.get(name);
    if (cached && (Date.now() - cached.cachedAt) < registration.cooldown) {
      return cached.result;
    }

    const startTime = Date.now();
    let result: HealthCheckResult;

    try {
      // Run with timeout
      result = await this.withTimeout(
        registration.checkFn(),
        registration.timeout
      );
    } catch (error) {
      result = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Check failed',
      };
    }

    const latency = Date.now() - startTime;
    const healthCheck: HealthCheck = {
      name,
      status: result.status,
      latency,
      message: result.message,
      critical: registration.critical,
      lastChecked: Date.now(),
    };

    // Update cache
    this.checkCache.set(name, { result: healthCheck, cachedAt: Date.now() });
    this.lastCheckResults.set(name, healthCheck);

    return healthCheck;
  }

  // Execute with timeout
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Health check timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  // Run all registered checks
  async runAllChecks(): Promise<HealthCheck[]> {
    const results: HealthCheck[] = [];
    for (const [name] of this.checks) {
      const result = await this.runCheck(name);
      results.push(result);
    }
    return results;
  }

  // Get aggregated health status
  async getHealthStatus(): Promise<HealthStatus> {
    const checks = await this.runAllChecks();
    const status = this.aggregateStatus(checks);

    const healthStatus: HealthStatus = {
      status,
      checks,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      version: this.version,
    };

    // Record history
    this.addToHistory({
      timestamp: Date.now(),
      status,
      checks,
    });

    return healthStatus;
  }

  // Aggregate individual check results into overall status
  private aggregateStatus(checks: HealthCheck[]): HealthStatusType {
    if (checks.length === 0) return 'healthy';

    const criticalUnhealthy = checks.some(c => c.critical && c.status === 'unhealthy');
    if (criticalUnhealthy) return 'unhealthy';

    const anyUnhealthy = checks.some(c => c.status === 'unhealthy');
    const anyDegraded = checks.some(c => c.status === 'degraded');
    if (anyUnhealthy || anyDegraded) return 'degraded';

    return 'healthy';
  }

  // Add to health history
  private addToHistory(entry: HealthHistory): void {
    this.history.push(entry);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  // Get health history
  getHistory(count?: number): HealthHistory[] {
    const limit = count || this.history.length;
    return this.history.slice(-limit);
  }

  // Get available features based on dependency health
  getAvailableFeatures(): { name: string; available: boolean; missingDeps: string[] }[] {
    return this.features.map(feature => {
      const missingDeps: string[] = [];
      for (const dep of feature.requiredDependencies) {
        const lastResult = this.lastCheckResults.get(dep);
        if (!lastResult || lastResult.status === 'unhealthy') {
          missingDeps.push(dep);
        }
      }
      return {
        name: feature.name,
        available: missingDeps.length === 0,
        missingDeps,
      };
    });
  }

  // Get last check result for a dependency
  getLastResult(name: string): HealthCheck | null {
    return this.lastCheckResults.get(name) || null;
  }

  // Clear cache for a specific check
  clearCache(name: string): void {
    this.checkCache.delete(name);
  }

  // Clear all caches
  clearAllCaches(): void {
    this.checkCache.clear();
  }

  // Set max history size
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = Math.max(1, size);
    while (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  // Get registered check names
  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }

  // Get critical check names
  getCriticalChecks(): string[] {
    return Array.from(this.checks.entries())
      .filter(([, reg]) => reg.critical)
      .map(([name]) => name);
  }

  // Get non-critical check names
  getNonCriticalChecks(): string[] {
    return Array.from(this.checks.entries())
      .filter(([, reg]) => !reg.critical)
      .map(([name]) => name);
  }

  // Check if a specific dependency is healthy
  isDependencyHealthy(name: string): boolean {
    const result = this.lastCheckResults.get(name);
    return result?.status === 'healthy';
  }

  // Get uptime
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  // Get status summary
  getStatusSummary(): { total: number; healthy: number; degraded: number; unhealthy: number } {
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;

    for (const [, result] of this.lastCheckResults) {
      switch (result.status) {
        case 'healthy': healthy++; break;
        case 'degraded': degraded++; break;
        case 'unhealthy': unhealthy++; break;
      }
    }

    return {
      total: this.lastCheckResults.size,
      healthy,
      degraded,
      unhealthy,
    };
  }

  // Reset all state
  reset(): void {
    this.checkCache.clear();
    this.lastCheckResults.clear();
    this.history = [];
    this.startupComplete = false;
    this.startTime = Date.now();
  }
}
