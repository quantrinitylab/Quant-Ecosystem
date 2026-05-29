// ============================================================================
// Chaos Testing - Fault Injector
// Simulates various types of service faults for resilience testing
// ============================================================================

import type { FaultInjection, FaultType, FaultConfig } from './types';

function generateId(): string {
  return `fault-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class FaultInjector {
  private activeFaults: Map<string, FaultInjection> = new Map();
  private targetFaults: Map<string, FaultInjection[]> = new Map();

  injectLatency(target: string, latencyMs: number, duration: number = 30000): FaultInjection {
    const fault = this.createFault('latency', target, duration, { latencyMs });
    this.registerFault(fault);
    return fault;
  }

  injectFailure(target: string, failureRate: number, duration: number = 30000): FaultInjection {
    const rate = Math.max(0, Math.min(1, failureRate));
    const fault = this.createFault('failure', target, duration, { failureRate: rate });
    this.registerFault(fault);
    return fault;
  }

  injectTimeout(target: string, timeoutMs: number, duration: number = 30000): FaultInjection {
    const fault = this.createFault('timeout', target, duration, { timeoutMs });
    this.registerFault(fault);
    return fault;
  }

  injectCorruption(
    target: string,
    corruptionRate: number,
    duration: number = 30000,
  ): FaultInjection {
    const rate = Math.max(0, Math.min(1, corruptionRate));
    const fault = this.createFault('corruption', target, duration, { corruptionRate: rate });
    this.registerFault(fault);
    return fault;
  }

  reset(faultId?: string): void {
    if (faultId) {
      const fault = this.activeFaults.get(faultId);
      if (fault) {
        fault.active = false;
        this.activeFaults.delete(faultId);
        const targetFaults = this.targetFaults.get(fault.target);
        if (targetFaults) {
          this.targetFaults.set(
            fault.target,
            targetFaults.filter((f) => f.id !== faultId),
          );
        }
      }
    } else {
      for (const fault of this.activeFaults.values()) {
        fault.active = false;
      }
      this.activeFaults.clear();
      this.targetFaults.clear();
    }
  }

  getActiveFaults(): FaultInjection[] {
    return Array.from(this.activeFaults.values());
  }

  getFaultsForTarget(target: string): FaultInjection[] {
    return this.targetFaults.get(target) ?? [];
  }

  isTargetAffected(target: string): boolean {
    const faults = this.targetFaults.get(target);
    return faults !== undefined && faults.length > 0;
  }

  shouldFail(target: string): boolean {
    const faults = this.getFaultsForTarget(target);
    for (const fault of faults) {
      if (fault.type === 'failure' && fault.config.failureRate !== undefined) {
        if (Math.random() < fault.config.failureRate) {
          return true;
        }
      }
    }
    return false;
  }

  getLatencyDelay(target: string): number {
    const faults = this.getFaultsForTarget(target);
    let totalLatency = 0;

    for (const fault of faults) {
      if (fault.type === 'latency' && fault.config.latencyMs !== undefined) {
        totalLatency += fault.config.latencyMs;
      }
    }

    return totalLatency;
  }

  getTimeoutDuration(target: string): number | undefined {
    const faults = this.getFaultsForTarget(target);
    for (const fault of faults) {
      if (fault.type === 'timeout' && fault.config.timeoutMs !== undefined) {
        return fault.config.timeoutMs;
      }
    }
    return undefined;
  }

  private createFault(
    type: FaultType,
    target: string,
    duration: number,
    config: FaultConfig,
  ): FaultInjection {
    return {
      id: generateId(),
      type,
      target,
      duration,
      startTime: Date.now(),
      config,
      active: true,
    };
  }

  private registerFault(fault: FaultInjection): void {
    this.activeFaults.set(fault.id, fault);

    const existing = this.targetFaults.get(fault.target) ?? [];
    existing.push(fault);
    this.targetFaults.set(fault.target, existing);
  }
}
