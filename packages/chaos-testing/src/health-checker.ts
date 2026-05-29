// ============================================================================
// Chaos Testing - Service Health Checker
// Monitors service health and triggers alerts on degradation
// ============================================================================

import type { HealthCheck, HealthStatus, ServiceHealth } from './types';

export class ServiceHealthChecker {
  private services: Map<string, HealthCheck> = new Map();
  private healthState: Map<string, ServiceHealth> = new Map();
  private unhealthyCallbacks: Array<(service: ServiceHealth) => void> = [];
  private checkIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  registerService(healthCheck: HealthCheck): void {
    this.services.set(healthCheck.name, healthCheck);
    this.healthState.set(healthCheck.name, {
      name: healthCheck.name,
      status: 'unknown',
      latency: 0,
      lastChecked: 0,
      errorCount: 0,
    });
  }

  unregisterService(name: string): void {
    this.services.delete(name);
    this.healthState.delete(name);
    const interval = this.checkIntervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(name);
    }
  }

  async checkAll(): Promise<Map<string, ServiceHealth>> {
    const checks = Array.from(this.services.entries()).map(async ([name, check]) => {
      const health = await this.performCheck(name, check);
      return [name, health] as const;
    });

    const results = await Promise.allSettled(checks);
    const healthMap = new Map<string, ServiceHealth>();

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [name, health] = result.value;
        healthMap.set(name, health);
      }
    }

    return healthMap;
  }

  async checkService(name: string): Promise<ServiceHealth | null> {
    const check = this.services.get(name);
    if (!check) return null;
    return this.performCheck(name, check);
  }

  getStatus(name: string): ServiceHealth | undefined {
    return this.healthState.get(name);
  }

  getAllStatuses(): ServiceHealth[] {
    return Array.from(this.healthState.values());
  }

  onUnhealthy(callback: (service: ServiceHealth) => void): () => void {
    this.unhealthyCallbacks.push(callback);
    return () => {
      this.unhealthyCallbacks = this.unhealthyCallbacks.filter((cb) => cb !== callback);
    };
  }

  startMonitoring(): void {
    for (const [name, check] of this.services.entries()) {
      const interval = setInterval(async () => {
        await this.performCheck(name, check);
      }, check.interval);
      this.checkIntervals.set(name, interval);
    }
  }

  stopMonitoring(): void {
    for (const [name, interval] of this.checkIntervals.entries()) {
      clearInterval(interval);
      this.checkIntervals.delete(name);
    }
  }

  private async performCheck(name: string, check: HealthCheck): Promise<ServiceHealth> {
    const startTime = Date.now();
    let status: HealthStatus = 'unknown';
    let errorCount = this.healthState.get(name)?.errorCount ?? 0;

    try {
      const result = await Promise.race([
        check.check(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), check.timeout),
        ),
      ]);

      const latency = Date.now() - startTime;

      if (result) {
        status = latency > check.timeout * 0.8 ? 'degraded' : 'healthy';
        errorCount = 0;
      } else {
        status = 'unhealthy';
        errorCount++;
      }
    } catch {
      status = 'unhealthy';
      errorCount++;
    }

    const health: ServiceHealth = {
      name,
      status,
      latency: Date.now() - startTime,
      lastChecked: Date.now(),
      errorCount,
    };

    this.healthState.set(name, health);

    if (status === 'unhealthy') {
      this.notifyUnhealthy(health);
    }

    return health;
  }

  private notifyUnhealthy(service: ServiceHealth): void {
    for (const callback of this.unhealthyCallbacks) {
      callback(service);
    }
  }
}
