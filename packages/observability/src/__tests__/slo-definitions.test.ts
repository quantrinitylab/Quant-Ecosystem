import { describe, it, expect } from 'vitest';
import { ServiceSLODefinitions, parseSLOConfig } from '../slo-definitions.js';

describe('ServiceSLODefinitions', () => {
  const ALL_SERVICES = [
    'quantmail',
    'quantube',
    'quantsync',
    'quantgram',
    'quantcast',
    'quantdocs',
    'quantdrive',
    'quantforum',
    'quantmarket',
  ];

  it('has SLO configs for all 9 services', () => {
    const definitions = new ServiceSLODefinitions();
    const services = definitions.getServiceNames();

    expect(services).toHaveLength(9);
    for (const name of ALL_SERVICES) {
      expect(services).toContain(name);
    }
  });

  it('each service has availability and latency SLOs', () => {
    const definitions = new ServiceSLODefinitions();

    for (const name of ALL_SERVICES) {
      const slo = definitions.getService(name);
      expect(slo).not.toBeNull();
      expect(slo!.availability).toBeDefined();
      expect(slo!.availability.target).toBe(0.999);
      expect(slo!.latencyP95).toBeDefined();
      expect(slo!.latencyP95.target).toBe(0.95);
      expect(slo!.latencyP99).toBeDefined();
      expect(slo!.latencyP99.target).toBe(0.99);
    }
  });

  it('parseSLOConfig validates correct configs', () => {
    const definitions = new ServiceSLODefinitions();
    const config = definitions.getConfig();

    const result = parseSLOConfig(config);
    expect(result).toBeDefined();
    expect(result.services).toHaveLength(9);
  });

  it('parseSLOConfig rejects config with target > 1', () => {
    const invalidConfig = {
      services: [
        {
          serviceName: 'test',
          availability: {
            name: 'test_availability',
            target: 1.5, // invalid
            metric: 'success_rate',
            window: 2592000000,
            burnRateThresholds: [],
            description: 'test',
          },
          latencyP95: {
            name: 'test_p95',
            target: 0.95,
            metric: 'latency',
            window: 2592000000,
            burnRateThresholds: [],
            description: 'test',
          },
          latencyP99: {
            name: 'test_p99',
            target: 0.99,
            metric: 'latency',
            window: 2592000000,
            burnRateThresholds: [],
            description: 'test',
          },
        },
      ],
    };

    expect(() => parseSLOConfig(invalidConfig)).toThrow();
  });

  it('parseSLOConfig rejects config with missing fields', () => {
    const invalidConfig = {
      services: [
        {
          serviceName: 'test',
          availability: {
            name: 'test_availability',
            target: 0.999,
            // missing metric
          },
        },
      ],
    };

    expect(() => parseSLOConfig(invalidConfig)).toThrow();
  });
});
