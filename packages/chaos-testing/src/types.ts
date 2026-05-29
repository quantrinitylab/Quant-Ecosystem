// ============================================================================
// Chaos Testing - Type Definitions
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  latency: number;
  lastChecked: number;
  errorCount: number;
  metadata?: Record<string, unknown>;
}

export interface HealthCheck {
  name: string;
  endpoint: string;
  interval: number;
  timeout: number;
  check: () => Promise<boolean>;
}

export type FaultType = 'latency' | 'failure' | 'timeout' | 'corruption' | 'partition';

export interface FaultInjection {
  id: string;
  type: FaultType;
  target: string;
  duration: number;
  startTime: number;
  config: FaultConfig;
  active: boolean;
}

export interface FaultConfig {
  latencyMs?: number;
  failureRate?: number;
  timeoutMs?: number;
  corruptionRate?: number;
}

export interface ChaosExperiment {
  id: string;
  name: string;
  description: string;
  faults: FaultInjection[];
  hypothesis: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  result?: ExperimentResult;
}

export interface ExperimentResult {
  passed: boolean;
  observations: string[];
  metrics: Record<string, number>;
}

export interface ResilienceReport {
  timestamp: number;
  serviceName: string;
  tests: ResilienceTestResult[];
  overallScore: number;
  recommendations: string[];
}

export interface ResilienceTestResult {
  name: string;
  passed: boolean;
  duration: number;
  details: string;
}
