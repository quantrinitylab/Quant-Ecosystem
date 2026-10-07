export interface ScalingPolicy {
  service: string;
  minReplicas: number;
  maxReplicas: number;
  targetCPU: number;
  targetMemory: number;
  scaleUpCooldown: number;
  scaleDownCooldown: number;
}

export interface ScalingMetrics {
  cpu: number;
  memory: number;
  requestsPerSecond: number;
  activeConnections: number;
}

export class AutoScaler {
  private policies: Map<string, ScalingPolicy> = new Map();
  private currentReplicas: Map<string, number> = new Map();

  constructor() {
    // Default policies for critical services
    this.setPolicy('quantai', {
      service: 'quantai',
      minReplicas: 3,
      maxReplicas: 100,
      targetCPU: 70,
      targetMemory: 80,
      scaleUpCooldown: 60,
      scaleDownCooldown: 300,
    });

    this.setPolicy('quantchat', {
      service: 'quantchat',
      minReplicas: 5,
      maxReplicas: 200,
      targetCPU: 60,
      targetMemory: 70,
      scaleUpCooldown: 30,
      scaleDownCooldown: 300,
    });
  }

  setPolicy(service: string, policy: ScalingPolicy) {
    this.policies.set(service, policy);
    if (!this.currentReplicas.has(service)) {
      this.currentReplicas.set(service, policy.minReplicas);
    }
  }

  async evaluateScaling(service: string, metrics: ScalingMetrics): Promise<number> {
    const policy = this.policies.get(service);
    if (!policy) return this.currentReplicas.get(service) || 1;

    const current = this.currentReplicas.get(service) || policy.minReplicas;
    let target = current;

    // CPU-based scaling
    if (metrics.cpu > policy.targetCPU) {
      target = Math.min(current + 2, policy.maxReplicas);
    } else if (metrics.cpu < policy.targetCPU - 20) {
      target = Math.max(current - 1, policy.minReplicas);
    }

    // Memory-based scaling
    if (metrics.memory > policy.targetMemory) {
      target = Math.min(target + 3, policy.maxReplicas);
    }

    // Request-based scaling
    const rpsPerReplica = metrics.requestsPerSecond / current;
    if (rpsPerReplica > 100) {
      target = Math.min(target + 5, policy.maxReplicas);
    }

    return Math.max(policy.minReplicas, Math.min(target, policy.maxReplicas));
  }

  async applyScaling(service: string, targetReplicas: number): Promise<void> {
    const current = this.currentReplicas.get(service) || 1;

    if (targetReplicas !== current) {
      this.currentReplicas.set(service, targetReplicas);
    }
  }

  getCurrentReplicas(service: string): number {
    return this.currentReplicas.get(service) || 1;
  }

  getPolicy(service: string): ScalingPolicy | undefined {
    return this.policies.get(service);
  }
}

export const autoScaler = new AutoScaler();
