// ============================================================================
// SLO Definitions - Per-service SLO Configuration
// ============================================================================

import { z } from 'zod';
import { SLODefinition, BurnRateThreshold } from './types';
import type { ServiceSLO, SLOServiceConfig } from './types';

const DEFAULT_BURN_RATE_THRESHOLDS: BurnRateThreshold[] = [
  { severity: 'critical', shortWindow: 300000, longWindow: 3600000, burnRate: 14.4 },
  { severity: 'warning', shortWindow: 1800000, longWindow: 21600000, burnRate: 6 },
  { severity: 'info', shortWindow: 3600000, longWindow: 86400000, burnRate: 3 },
];

const THIRTY_DAYS_MS = 30 * 24 * 3600000;

const SERVICE_NAMES = [
  'quantmail',
  'quantube',
  'quantsync',
  'quantgram',
  'quantcast',
  'quantdocs',
  'quantdrive',
  'quantforum',
  'quantmarket',
] as const;

function createServiceSLO(serviceName: string): ServiceSLO {
  return {
    serviceName,
    availability: {
      name: `${serviceName}_availability`,
      target: 0.999,
      metric: 'success_rate',
      window: THIRTY_DAYS_MS,
      burnRateThresholds: DEFAULT_BURN_RATE_THRESHOLDS,
      description: `${serviceName} service availability (99.9%)`,
    },
    latencyP95: {
      name: `${serviceName}_latency_p95`,
      target: 0.95,
      metric: 'latency_p95_under_200ms',
      window: THIRTY_DAYS_MS,
      burnRateThresholds: DEFAULT_BURN_RATE_THRESHOLDS,
      description: `${serviceName} latency p95 < 200ms`,
    },
    latencyP99: {
      name: `${serviceName}_latency_p99`,
      target: 0.99,
      metric: 'latency_p99_under_500ms',
      window: THIRTY_DAYS_MS,
      burnRateThresholds: DEFAULT_BURN_RATE_THRESHOLDS,
      description: `${serviceName} latency p99 < 500ms`,
    },
  };
}

const burnRateThresholdSchema = z.object({
  severity: z.enum(['critical', 'warning', 'info']),
  shortWindow: z.number().positive(),
  longWindow: z.number().positive(),
  burnRate: z.number().positive(),
});

const sloDefinitionSchema = z.object({
  name: z.string().min(1),
  target: z.number().min(0).max(1),
  metric: z.string().min(1),
  window: z.number().positive(),
  burnRateThresholds: z.array(burnRateThresholdSchema),
  description: z.string(),
});

const serviceSLOSchema = z.object({
  serviceName: z.string().min(1),
  availability: sloDefinitionSchema,
  latencyP95: sloDefinitionSchema,
  latencyP99: sloDefinitionSchema,
});

const sloServiceConfigSchema = z.object({
  services: z.array(serviceSLOSchema),
});

/**
 * Parse and validate an SLO configuration object using zod.
 */
export function parseSLOConfig(config: unknown): SLOServiceConfig {
  return sloServiceConfigSchema.parse(config);
}

/**
 * Get SLO configuration for a specific service by name.
 */
export function getServiceSLO(serviceName: string): ServiceSLO | null {
  const definitions = new ServiceSLODefinitions();
  return definitions.getService(serviceName);
}

export class ServiceSLODefinitions {
  private services: Map<string, ServiceSLO> = new Map();

  constructor() {
    for (const name of SERVICE_NAMES) {
      this.services.set(name, createServiceSLO(name));
    }
  }

  /**
   * Get SLO config for a specific service.
   */
  getService(serviceName: string): ServiceSLO | null {
    return this.services.get(serviceName) ?? null;
  }

  /**
   * Get all service SLO configurations.
   */
  getAllServices(): ServiceSLO[] {
    return Array.from(this.services.values());
  }

  /**
   * Get all SLO definitions (flat list across all services).
   */
  getAllDefinitions(): SLODefinition[] {
    const definitions: SLODefinition[] = [];
    for (const slo of this.services.values()) {
      definitions.push(slo.availability, slo.latencyP95, slo.latencyP99);
    }
    return definitions;
  }

  /**
   * Get service names.
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get the full config object for all services.
   */
  getConfig(): SLOServiceConfig {
    return { services: this.getAllServices() };
  }
}
